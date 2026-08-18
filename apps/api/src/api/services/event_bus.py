import asyncio
import json
import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, Protocol, Set

import redis.asyncio as redis
from redis.exceptions import RedisError

from api.config import get_settings

logger = logging.getLogger(__name__)
_HEARTBEAT_INTERVAL_SECONDS = 25.0
_MEMORY_SUBSCRIPTION_QUEUE_MAX = 256
_OVERFLOW_SENTINEL = object()

AuthorizationCheck = Callable[[], Awaitable[bool]]

# Return contract for `is_participant_revoked_now`: True suppresses the
# event, False forwards it, and None means neither the fast-path registry
# nor PostgreSQL could establish an answer - the stream must fail closed
# rather than treat that uncertainty as "not revoked".
RevocationCheck = Callable[[], Awaitable["bool | None"]]


@dataclass
class Event:
    roadmap_id: str
    action: str
    payload: Dict[str, Any]

    def to_sse(self) -> str:
        data = json.dumps(self.payload)
        return f"event: {self.action}\ndata: {data}\n\n"


class SubscriptionOverflowError(RuntimeError):
    """Raised when a slow in-memory SSE consumer exceeds its bounded queue."""


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
        is_participant_revoked_now: RevocationCheck | None = None,
    ) -> AsyncIterator[str]: ...


async def forward_subscription(
    subscription: Subscription,
    *,
    participant_id: str | None = None,
    close_at: float | None = None,
    is_still_authorized: AuthorizationCheck | None = None,
    is_participant_revoked_now: RevocationCheck | None = None,
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

    `is_participant_revoked_now`, when provided, is consulted on every
    event pulled off the subscription, before that event is ever yielded.
    It returns `True` to suppress the event (participant is revoked),
    `False` to forward it, or `None` when authorization could not be
    established at all (both the fast-path registry and its PostgreSQL
    fallback failed) - that case ends the stream immediately rather than
    treating the uncertainty as "not revoked". The participant's own
    terminating `participant.revoked` notification is always recognized
    and delivered first (see `_is_own_revocation`), even if it is queued
    behind other traffic that arrived around the same time, so the client
    always learns why its connection ended; if it never arrives at all
    (e.g. the control event's publish failed), the stream still closes no
    later than the next `is_still_authorized`/`close_at` bound below. This
    closes the gap the periodic recheck leaves open on its own:
    `revoke_participant()` marks the registry before it commits the
    revocation to the database, so once the database commit is
    authoritative the registry already reflects it, and any other event
    still sitting in (or arriving on) this subscription's queue is
    suppressed instead of forwarded, regardless of whether the separate
    `participant.revoked` control event has been published yet.
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

            try:
                event = await subscription.get_event(timeout)
            except SubscriptionOverflowError:
                logger.warning("Closed slow realtime consumer after queue overflow")
                break

            if close_at is not None and time.time() >= close_at:
                break

            if next_reauth_at is not None and time.time() >= next_reauth_at:
                next_reauth_at = time.time() + _HEARTBEAT_INTERVAL_SECONDS
                if not await is_still_authorized():
                    break

            if event is None:
                yield ": heartbeat\n\n"
                continue

            if _is_own_revocation(event, participant_id):
                yield event.to_sse()
                break

            if event.action == "roadmap.deleted":
                # Deletion invalidates every participant session, but the
                # terminal event is still delivered so clients can explain
                # why the stream ended.
                yield event.to_sse()
                break

            if is_participant_revoked_now is not None:
                revoked = await is_participant_revoked_now()
                if revoked is None:
                    # Authorization could not be established at all; fail
                    # closed for this stream rather than guess.
                    break
                if revoked:
                    # Suppress this one event and keep waiting rather than
                    # closing here: the participant's own terminating
                    # `participant.revoked` notification may be queued
                    # behind it (e.g. concurrent unrelated traffic reached
                    # this subscription's queue first) and must still be
                    # delivered when it arrives. Nothing is leaked either
                    # way - this branch never yields - and the stream
                    # still closes promptly once that notification shows
                    # up or the bounded `is_still_authorized`/`close_at`
                    # checks above fire.
                    continue

            yield event.to_sse()
    finally:
        await subscription.close()


class MemorySubscription:
    def __init__(self, bus: "MemoryEventBus", roadmap_id: str, queue: asyncio.Queue):
        self._bus = bus
        self._roadmap_id = roadmap_id
        self._queue = queue

    async def get_event(self, timeout: float) -> Event | None:
        try:
            item = await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None
        if item is _OVERFLOW_SENTINEL:
            raise SubscriptionOverflowError
        return item

    async def close(self) -> None:
        await self._bus.unsubscribe(self._roadmap_id, self._queue)


class RevocationRegistryUnavailableError(RuntimeError):
    """Raised when the fast-path revocation registry cannot be written to.

    Callers (see `sharing_service.revoke_participant`) must treat this as
    fatal to the whole revocation: proceeding without the registry mark
    would let a revoked participant's already-open stream keep receiving
    events until the next bounded `is_still_authorized` recheck, which
    defeats the "immediate" cutoff guarantee.
    """


class RevocationMark(Enum):
    """State of a participant's fast-path revocation mark.

    `PENDING` covers two situations a reader cannot tell apart on its own:
    an in-flight revocation whose database commit has not landed yet, and
    an abandoned one whose owning process crashed before promoting or
    clearing the mark. Both require a PostgreSQL lookup to resolve - see
    `sharing_service.resolve_realtime_revocation`.
    """

    ACTIVE = "active"
    PENDING = "pending"
    COMMITTED = "committed"
    UNKNOWN = "unknown"


class RevocationRegistry(Protocol):
    """
    A cheap, no-database record of which participants are revoked, shared
    between `sharing_service.revoke_participant()` and every stream's
    per-event authorization check in `forward_subscription`.

    `revoke_participant()` marks a participant `PENDING` here *before*
    committing the database revocation, then promotes the mark to
    `COMMITTED` once that commit succeeds. A `COMMITTED` mark alone is
    trusted; `PENDING` and `UNKNOWN` (a failed read) are not - see
    `resolve_realtime_revocation` for how those are reconciled against
    PostgreSQL.
    """

    async def mark_pending(self, roadmap_id: str, participant_id: str) -> None: ...

    async def promote_committed(self, roadmap_id: str, participant_id: str) -> None: ...

    async def clear(self, roadmap_id: str, participant_id: str) -> None: ...

    async def get_mark(self, roadmap_id: str, participant_id: str) -> RevocationMark: ...


class MemoryRevocationRegistry:
    def __init__(self):
        self._marks: Dict[str, Dict[str, RevocationMark]] = {}

    async def mark_pending(self, roadmap_id: str, participant_id: str) -> None:
        self._marks.setdefault(roadmap_id, {})[participant_id] = RevocationMark.PENDING

    async def promote_committed(self, roadmap_id: str, participant_id: str) -> None:
        self._marks.setdefault(roadmap_id, {})[participant_id] = RevocationMark.COMMITTED

    async def clear(self, roadmap_id: str, participant_id: str) -> None:
        participants = self._marks.get(roadmap_id)
        if participants is None:
            return
        participants.pop(participant_id, None)
        if not participants:
            del self._marks[roadmap_id]

    async def get_mark(self, roadmap_id: str, participant_id: str) -> RevocationMark:
        return self._marks.get(roadmap_id, {}).get(participant_id, RevocationMark.ACTIVE)


class MemoryEventBus:
    def __init__(self):
        # roadmap_id -> set of queues
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()
        self.revocations = MemoryRevocationRegistry()

    async def subscribe(self, roadmap_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=_MEMORY_SUBSCRIPTION_QUEUE_MAX)
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
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                await self.unsubscribe(event.roadmap_id, queue)
                while not queue.empty():
                    try:
                        queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                queue.put_nowait(_OVERFLOW_SENTINEL)

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
        is_participant_revoked_now: AuthorizationCheck | None = None,
    ):
        """
        SSE event generator for a roadmap. Handles subscribe/unsubscribe and heartbeats.

        When `participant_id` is set, the stream closes itself the moment it
        forwards a `participant.revoked` event targeting that same
        participant — revocation must not depend on the client choosing to
        disconnect. `is_still_authorized`, when provided, is polled on a
        bounded cadence as defense-in-depth against a missed/dropped event.
        `is_participant_revoked_now`, when provided, is checked before every
        event is forwarded — see `forward_subscription`.

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
            is_participant_revoked_now=is_participant_revoked_now,
        ):
            yield chunk


EventBus = MemoryEventBus


# Safety-net TTL for a fast-path revocation mark in Redis. This bounds the
# worst case where a commit failure's compensating `clear()` call itself
# fails (e.g. a second, independent Redis outage) — the stale mark expires
# on its own rather than blocking the participant's events forever. It is
# not load-bearing for correctness: the database remains the source of
# truth for REST reads/writes and for the periodic `is_still_authorized`
# defense-in-depth recheck.
_REVOCATION_MARK_TTL_SECONDS = 86_400


class RedisRevocationRegistry:
    def __init__(self, redis_client: Any, *, key_prefix: str):
        self._redis = redis_client
        self._key_prefix = key_prefix

    def _key(self, roadmap_id: str, participant_id: str) -> str:
        return f"{self._key_prefix}:revoked:{roadmap_id}:{participant_id}"

    async def mark_pending(self, roadmap_id: str, participant_id: str) -> None:
        try:
            await self._redis.set(
                self._key(roadmap_id, participant_id),
                RevocationMark.PENDING.value,
                ex=_REVOCATION_MARK_TTL_SECONDS,
            )
        except RedisError as exc:
            raise RevocationRegistryUnavailableError(
                "Failed to write fast-path revocation registry mark"
            ) from exc

    async def promote_committed(self, roadmap_id: str, participant_id: str) -> None:
        try:
            await self._redis.set(
                self._key(roadmap_id, participant_id),
                RevocationMark.COMMITTED.value,
                ex=_REVOCATION_MARK_TTL_SECONDS,
            )
        except RedisError:
            # Best-effort: a stream that later reads a stale `PENDING` mark
            # still resolves it correctly against PostgreSQL - see
            # `resolve_realtime_revocation`.
            logger.exception("Failed to promote fast-path revocation registry mark")

    async def clear(self, roadmap_id: str, participant_id: str) -> None:
        try:
            await self._redis.delete(self._key(roadmap_id, participant_id))
        except RedisError:
            # Best-effort cleanup of an abandoned `PENDING` mark; the TTL
            # above bounds how long a mark that fails to clear can persist.
            logger.exception("Failed to clear fast-path revocation registry mark")

    async def get_mark(self, roadmap_id: str, participant_id: str) -> RevocationMark:
        try:
            value = await self._redis.get(self._key(roadmap_id, participant_id))
        except RedisError:
            # Represent the read failure explicitly rather than reporting
            # `ACTIVE`: the caller (`resolve_realtime_revocation`) must
            # fall back to PostgreSQL instead of treating this as "not
            # revoked".
            logger.exception("Failed to read fast-path revocation registry")
            return RevocationMark.UNKNOWN
        if value == RevocationMark.COMMITTED.value:
            return RevocationMark.COMMITTED
        if value == RevocationMark.PENDING.value:
            return RevocationMark.PENDING
        return RevocationMark.ACTIVE


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
        self.revocations = RedisRevocationRegistry(self._redis, key_prefix=key_prefix)

    def _channel(self, roadmap_id: str) -> str:
        return f"{self._key_prefix}:events:roadmap:{roadmap_id}"

    async def publish(self, event: Event) -> None:
        """Best-effort fan-out of an already-authoritative application event.

        Realtime delivery is a notification side effect, not part of the
        authoritative PostgreSQL/lock state transition. A Redis publish
        outage therefore must not turn an already-committed mutation into a
        false HTTP failure that callers may retry. Security-critical
        revocation preconditions use ``revocations.mark_pending`` separately
        and remain fail-closed.
        """
        message = json.dumps({
            "action": event.action,
            "payload": event.payload,
        })
        try:
            await self._redis.publish(self._channel(event.roadmap_id), message)
        except RedisError:
            logger.exception("Failed to publish realtime event through Redis")

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
        is_participant_revoked_now: AuthorizationCheck | None = None,
    ) -> AsyncIterator[str]:
        """
        SSE event generator for a roadmap. Redis owns fan-out; this generator
        keeps the existing heartbeat cadence and session expiry behavior.

        Revocation closure works the same way across every worker: whichever
        worker holds this participant's connection sees the published
        `participant.revoked` message on the shared channel and closes it.
        `is_participant_revoked_now`, when provided, is checked before every
        event is forwarded — see `forward_subscription`.

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
            is_participant_revoked_now=is_participant_revoked_now,
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
            await self._pubsub.aclose()
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
