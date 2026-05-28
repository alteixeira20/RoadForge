import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, Protocol, Set

import redis.asyncio as redis
from redis.exceptions import RedisError

from api.config import get_settings


logger = logging.getLogger(__name__)
_HEARTBEAT_INTERVAL_SECONDS = 25.0


@dataclass
class Event:
    roadmap_id: str
    action: str
    payload: Dict[str, Any]

    def to_sse(self) -> str:
        data = json.dumps(self.payload)
        return f"event: {self.action}\ndata: {data}\n\n"


class RealtimeEventBus(Protocol):
    async def publish(self, event: Event) -> None: ...

    async def stream(
        self, roadmap_id: str, close_at: float | None = None
    ) -> AsyncIterator[str]: ...


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

        sse_data = event.to_sse()
        for queue in queues:
            await queue.put(sse_data)

    async def stream(self, roadmap_id: str, close_at: float | None = None):
        """
        SSE event generator for a roadmap. Handles subscribe/unsubscribe and heartbeats.
        """
        queue = await self.subscribe(roadmap_id)
        try:
            while True:
                timeout = _HEARTBEAT_INTERVAL_SECONDS
                if close_at is not None:
                    seconds_remaining = close_at - time.time()
                    if seconds_remaining <= 0:
                        break
                    timeout = min(timeout, seconds_remaining)

                try:
                    # Wait for an event from the bus or a heartbeat timeout.
                    event_data = await asyncio.wait_for(queue.get(), timeout=timeout)
                    if close_at is not None and time.time() >= close_at:
                        break
                    yield event_data
                except asyncio.TimeoutError:
                    if close_at is not None and time.time() >= close_at:
                        break
                    # Send an SSE comment as a heartbeat to keep the connection alive.
                    yield ": heartbeat\n\n"
        finally:
            await self.unsubscribe(roadmap_id, queue)


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

    async def stream(
        self, roadmap_id: str, close_at: float | None = None
    ) -> AsyncIterator[str]:
        """
        SSE event generator for a roadmap. Redis owns fan-out; this generator
        keeps the existing heartbeat cadence and session expiry behavior.
        """
        channel = self._channel(roadmap_id)
        pubsub = self._redis.pubsub()
        try:
            await pubsub.subscribe(channel)
        except RedisError:
            logger.exception("Failed to subscribe to realtime Redis channel")
            raise

        try:
            while True:
                timeout = _HEARTBEAT_INTERVAL_SECONDS
                if close_at is not None:
                    seconds_remaining = close_at - time.time()
                    if seconds_remaining <= 0:
                        break
                    timeout = min(timeout, seconds_remaining)

                message = await self._get_message(pubsub, timeout)
                if close_at is not None and time.time() >= close_at:
                    break
                if message is None:
                    yield ": heartbeat\n\n"
                    continue
                if message.get("type") != "message":
                    continue

                event = self._event_from_message(roadmap_id, message.get("data"))
                if event is not None:
                    yield event.to_sse()
        finally:
            try:
                await pubsub.unsubscribe(channel)
                await pubsub.close()
            except RedisError:
                logger.warning("Failed to clean up realtime Redis subscription")

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
