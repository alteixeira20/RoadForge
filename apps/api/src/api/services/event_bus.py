import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, Protocol, Set

import redis.asyncio as redis
from redis.exceptions import RedisError

from api.config import get_settings

logger = logging.getLogger(__name__)
_HEARTBEAT_INTERVAL_SECONDS = 25.0

AuthorizationCheck = Callable[[], Awaitable[bool]]


@dataclass
class Event:
    roadmap_id: str
    action: str
    payload: Dict[str, Any]

    def to_sse(self) -> str:
        data = json.dumps(self.payload)
        return f"event: {self.action}\ndata: {data}\n\n"


def _is_own_revocation(event: Event, participant_id: str | None) -> bool:
    """True when `event` is the revocation of the stream's own participant.

    Revocation must close the specific connection it targets immediately,
    while other participants' streams keep receiving the same broadcast
    event (e.g. so an owner's participant list updates live).
    """
    return (
        participant_id is not None
        and event.action == "participant.revoked"
        and event.payload.get("participant_id") == participant_id
    )


class Subscription(Protocol):
    """An already-open, backend-specific handle to a roadmap's event feed.

    Opening a subscription must be the first thing that happens for a
    stream: any application event published after `open_subscription()`
    returns is guaranteed to be observed by this subscription, so callers
    can safely recheck authorization *after* subscribing and still be sure
    no revocation published during that check is missed.
    """

    async def get_event(self, timeout: float) -> Event | None: ...

    async def close(self) -> None: ...


class RealtimeEventBus(Protocol):
    async def publish(self, event: Event) -> None: ...

    async def open_subscription(self, roadmap_id: str) -> Subscription: ...

    async def stream(
        self,
        roadmap_id: str,
        *,
        participant_id: str | None = None,
        close_at: float | None = None,
        is_still_authorized: AuthorizationCheck | None = None,
    ) -> AsyncIterator[str]: ...


async def forward_subscription(
    subscription: Subscription,
    *,
    participant_id: str | None = None,
    close_at: float | None = None,
    is_still_authorized: AuthorizationCheck | None = None,
) -> AsyncIterator[str]:
    """
    Forwards events from an already-open `subscription` as SSE chunks until
    the subscription's own participant is revoked, `close_at` passes, or a
    periodic `is_still_authorized` recheck fails.

    Callers that care about the revocation race (see `Subscription`) must
    open the subscription and perform their own post-subscription
    authorization check *before* handing it to this function — this
    function assumes the subscription is already authorized and only
    re-validates periodically afterward as defense-in-depth.

    The periodic recheck runs on a bounded wall-clock cadence
    (`_HEARTBEAT_INTERVAL_SECONDS`) regardless of whether events keep
    arriving, so continuous unrelated traffic cannot postpone it
    indefinitely the way an idle-only timeout would.
    """
    next_reauth_at = (
        time.time() + _HEARTBEAT_INTERVAL_SECONDS if is_still_authorized is not None else None
    )
    try:
        while True:
            if close_at is not None and time.time() >= close_at:
                break

            timeout = _HEARTBEAT_INTERVAL_SECONDS
            if close_at is not None:
                timeout = min(timeout, max(close_at - time.time(), 0.0))
            if next_reauth_at is not None:
                timeout = min(timeout, max(next_reauth_at - time.time(), 0.0))

            event = await subscription.get_event(timeout)

            if close_at is not None and time.time() >= close_at:
                break

            if next_reauth_at is not None and time.time() >= next_reauth_at:
                next_reauth_at = time.time() + _HEARTBEAT_INTERVAL_SECONDS
                if not await is_still_authorized():
                    break

            if event is None:
                yield ": heartbeat\n\n"
                continue

            yield event.to_sse()
            if _is_own_revocation(event, participant_id):
                break
    finally:
        await subscription.close()


class MemorySubscription:
    def __init__(self, bus: "MemoryEventBus", roadmap_id: str, queue: asyncio.Queue):
        self._bus = bus
        self._roadmap_id = roadmap_id
        self._queue = queue

    async def get_event(self, timeout: float) -> Event | None:
        try:
            return await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None

    async def close(self) -> None:
        await self._bus.unsubscribe(self._roadmap_id, self._queue)


class MemoryEventBus:
    def __init__(self):
        # roadmap_id -> set of queues
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, roadmap_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            if roadmap_id not in self._subscribers:
                self._subscribers[roadmap_id] = set()
            self._subscribers[roadmap_id].add(queue)
        return queue

    async def unsubscribe(self, roadmap_id: str, queue: asyncio.Queue):
        async with self._lock:
            if roadmap_id in self._subscribers:
                self._subscribers[roadmap_id].discard(queue)
                if not self._subscribers[roadmap_id]:
                    del self._subscribers[roadmap_id]

    async def publish(self, event: Event):
        async with self._lock:
            queues = self._subscribers.get(event.roadmap_id, set()).copy()

        if not queues:
            return

        for queue in queues:
            await queue.put(event)

    async def open_subscription(self, roadmap_id: str) -> MemorySubscription:
        queue = await self.subscribe(roadmap_id)
        return MemorySubscription(self, roadmap_id, queue)

    async def stream(
        self,
        roadmap_id: str,
        *,
        participant_id: str | None = None,
        close_at: float | None = None,
        is_still_authorized: AuthorizationCheck | None = None,
    ):
        """
        SSE event generator for a roadmap. Handles subscribe/unsubscribe and heartbeats.

        When `participant_id` is set, the stream closes itself the moment it
        forwards a `participant.revoked` event targeting that same
        participant — revocation must not depend on the client choosing to
        disconnect. `is_still_authorized`, when provided, is polled on a
        bounded cadence as defense-in-depth against a missed/dropped event.

        Callers that need to recheck authorization *after* subscribing but
        *before* forwarding any events (closing the revocation race at
        stream open) should call `open_subscription()` and
        `forward_subscription()` directly instead of this convenience
        method — see the `/events` route.
        """
        subscription = await self.open_subscription(roadmap_id)
        async for chunk in forward_subscription(
            subscription,
            participant_id=participant_id,
            close_at=close_at,
            is_still_authorized=is_still_authorized,
        ):
            yield chunk


EventBus = MemoryEventBus


class RedisPubSubEventBus:
    def __init__(
        self,
        *,
        redis_url: str,
        key_prefix: str,
        connect_timeout_seconds: float,
        socket_timeout_seconds: float,
    ):
        if not redis_url:
            raise RuntimeError(
                "REDIS_URL is required when ROADFORGE_REALTIME_BACKEND=redis"
            )
        self._key_prefix = key_prefix
        self._redis = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=connect_timeout_seconds,
            socket_timeout=socket_timeout_seconds,
        )

    def _channel(self, roadmap_id: str) -> str:
        return f"{self._key_prefix}:events:roadmap:{roadmap_id}"

    async def publish(self, event: Event) -> None:
        message = json.dumps({
            "action": event.action,
            "payload": event.payload,
        })
        try:
            await self._redis.publish(self._channel(event.roadmap_id), message)
        except RedisError:
            logger.exception("Failed to publish realtime event through Redis")
            raise

    async def open_subscription(self, roadmap_id: str) -> "RedisSubscription":
        channel = self._channel(roadmap_id)
        pubsub = self._redis.pubsub()
        try:
            await pubsub.subscribe(channel)
        except RedisError:
            logger.exception("Failed to subscribe to realtime Redis channel")
            raise
        return RedisSubscription(self, roadmap_id, pubsub, channel)

    async def stream(
        self,
        roadmap_id: str,
        *,
        participant_id: str | None = None,
        close_at: float | None = None,
        is_still_authorized: AuthorizationCheck | None = None,
    ) -> AsyncIterator[str]:
        """
        SSE event generator for a roadmap. Redis owns fan-out; this generator
        keeps the existing heartbeat cadence and session expiry behavior.

        Revocation closure works the same way across every worker: whichever
        worker holds this participant's connection sees the published
        `participant.revoked` message on the shared channel and closes it.

        Callers that need to recheck authorization *after* subscribing but
        *before* forwarding any events should call `open_subscription()`
        and `forward_subscription()` directly instead — see the
        `/events` route.
        """
        subscription = await self.open_subscription(roadmap_id)
        async for chunk in forward_subscription(
            subscription,
            participant_id=participant_id,
            close_at=close_at,
            is_still_authorized=is_still_authorized,
        ):
            yield chunk

    async def _get_message(self, pubsub: Any, timeout: float):
        try:
            return await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=timeout,
            )
        except RedisError:
            logger.exception("Failed to receive realtime event from Redis")
            raise

    def _event_from_message(self, roadmap_id: str, data: Any) -> Event | None:
        try:
            message = json.loads(data)
        except (TypeError, json.JSONDecodeError):
            logger.warning("Ignored invalid realtime Redis message")
            return None

        action = message.get("action")
        payload = message.get("payload")
        if not isinstance(action, str) or not isinstance(payload, dict):
            logger.warning("Ignored malformed realtime Redis message")
            return None
        return Event(roadmap_id=roadmap_id, action=action, payload=payload)


class RedisSubscription:
    def __init__(
        self,
        bus: "RedisPubSubEventBus",
        roadmap_id: str,
        pubsub: Any,
        channel: str,
    ):
        self._bus = bus
        self._roadmap_id = roadmap_id
        self._pubsub = pubsub
        self._channel = channel

    async def get_event(self, timeout: float) -> Event | None:
        message = await self._bus._get_message(self._pubsub, timeout)
        if message is None or message.get("type") != "message":
            return None
        return self._bus._event_from_message(self._roadmap_id, message.get("data"))

    async def close(self) -> None:
        try:
            await self._pubsub.unsubscribe(self._channel)
            await self._pubsub.close()
        except RedisError:
            logger.warning("Failed to clean up realtime Redis subscription")


def _build_event_bus() -> RealtimeEventBus:
    settings = get_settings()
    if settings.realtime_backend == "memory":
        return MemoryEventBus()
    if settings.realtime_backend == "redis":
        return RedisPubSubEventBus(
            redis_url=settings.redis_url or "",
            key_prefix=settings.redis_key_prefix,
            connect_timeout_seconds=settings.redis_connect_timeout_seconds,
            socket_timeout_seconds=settings.redis_socket_timeout_seconds,
        )
    raise RuntimeError(f"Unsupported realtime backend: {settings.realtime_backend}")


# Global event bus instance
event_bus = _build_event_bus()
