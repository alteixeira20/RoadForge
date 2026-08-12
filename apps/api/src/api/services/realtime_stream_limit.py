from __future__ import annotations

import asyncio
import logging
import math
import secrets
import time
from dataclasses import dataclass
from typing import Protocol

import redis.asyncio as redis
from redis.exceptions import RedisError

from api.config import get_settings

logger = logging.getLogger(__name__)

STREAM_LEASE_TTL_SECONDS = 60

_ACQUIRE_LEASE_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local expires_at = tonumber(ARGV[2])
local max_streams = tonumber(ARGV[3])
local lease_id = ARGV[4]
redis.call("ZREMRANGEBYSCORE", key, "-inf", now)
if redis.call("ZCARD", key) >= max_streams then
    return 0
end
redis.call("ZADD", key, expires_at, lease_id)
redis.call("EXPIRE", key, math.ceil(expires_at - now) + 1)
return 1
"""

_REFRESH_LEASE_SCRIPT = """
local key = KEYS[1]
local expires_at = tonumber(ARGV[1])
local lease_id = ARGV[2]
local now = tonumber(ARGV[3])
redis.call("ZREMRANGEBYSCORE", key, "-inf", now)
if redis.call("ZSCORE", key, lease_id) == false then
    return 0
end
redis.call("ZADD", key, expires_at, lease_id)
redis.call("EXPIRE", key, math.ceil(expires_at - now) + 1)
return 1
"""

_RELEASE_LEASE_SCRIPT = """
local key = KEYS[1]
local lease_id = ARGV[1]
redis.call("ZREM", key, lease_id)
if redis.call("ZCARD", key) == 0 then
    redis.call("DEL", key)
end
return 1
"""


class RealtimeStreamLimitUnavailableError(RuntimeError):
    """Raised when an active-stream limit cannot be enforced safely."""


class RealtimeStreamRegistry(Protocol):
    async def acquire(
        self,
        roadmap_id: str,
        participant_id: str,
    ) -> RealtimeStreamLease | None: ...

    async def refresh(self, lease: RealtimeStreamLease) -> bool: ...

    async def release(self, lease: RealtimeStreamLease) -> None: ...


@dataclass(frozen=True, slots=True)
class RealtimeStreamLease:
    registry: RealtimeStreamRegistry
    roadmap_id: str
    participant_id: str
    lease_id: str

    async def refresh(self) -> bool:
        return await self.registry.refresh(self)

    async def release(self) -> None:
        await self.registry.release(self)


class MemoryRealtimeStreamRegistry:
    def __init__(self, *, max_streams: int, ttl: int = STREAM_LEASE_TTL_SECONDS) -> None:
        self._max_streams = max_streams
        self._ttl = ttl
        self._leases: dict[tuple[str, str], dict[str, float]] = {}
        self._lock = asyncio.Lock()

    async def acquire(
        self,
        roadmap_id: str,
        participant_id: str,
    ) -> RealtimeStreamLease | None:
        now = time.time()
        key = (roadmap_id, participant_id)
        async with self._lock:
            leases = self._leases.setdefault(key, {})
            self._prune(leases, now)
            if len(leases) >= self._max_streams:
                if not leases:
                    self._leases.pop(key, None)
                return None
            lease_id = secrets.token_urlsafe(18)
            leases[lease_id] = now + self._ttl
        return RealtimeStreamLease(self, roadmap_id, participant_id, lease_id)

    async def refresh(self, lease: RealtimeStreamLease) -> bool:
        now = time.time()
        key = (lease.roadmap_id, lease.participant_id)
        async with self._lock:
            leases = self._leases.get(key)
            if leases is None:
                return False
            self._prune(leases, now)
            if lease.lease_id not in leases:
                if not leases:
                    self._leases.pop(key, None)
                return False
            leases[lease.lease_id] = now + self._ttl
            return True

    async def release(self, lease: RealtimeStreamLease) -> None:
        key = (lease.roadmap_id, lease.participant_id)
        async with self._lock:
            leases = self._leases.get(key)
            if leases is None:
                return
            leases.pop(lease.lease_id, None)
            if not leases:
                self._leases.pop(key, None)

    @staticmethod
    def _prune(leases: dict[str, float], now: float) -> None:
        for lease_id in [lease_id for lease_id, expiry in leases.items() if expiry <= now]:
            leases.pop(lease_id, None)


class RedisRealtimeStreamRegistry:
    def __init__(
        self,
        *,
        redis_url: str,
        key_prefix: str,
        max_streams: int,
        connect_timeout_seconds: float,
        socket_timeout_seconds: float,
        ttl: int = STREAM_LEASE_TTL_SECONDS,
    ) -> None:
        if not redis_url:
            raise RuntimeError(
                "REDIS_URL is required when ROADFORGE_REALTIME_BACKEND=redis"
            )
        self._key_prefix = key_prefix
        self._max_streams = max_streams
        self._ttl = ttl
        self._redis = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=connect_timeout_seconds,
            socket_timeout=socket_timeout_seconds,
        )

    async def acquire(
        self,
        roadmap_id: str,
        participant_id: str,
    ) -> RealtimeStreamLease | None:
        now = time.time()
        lease_id = secrets.token_urlsafe(18)
        try:
            acquired = await self._redis.eval(
                _ACQUIRE_LEASE_SCRIPT,
                1,
                self._key(roadmap_id, participant_id),
                now,
                now + self._ttl,
                self._max_streams,
                lease_id,
            )
        except RedisError as exc:
            logger.exception("Failed to enforce realtime stream limit")
            raise RealtimeStreamLimitUnavailableError(
                "Realtime stream limit is temporarily unavailable"
            ) from exc
        if int(acquired) != 1:
            return None
        return RealtimeStreamLease(self, roadmap_id, participant_id, lease_id)

    async def refresh(self, lease: RealtimeStreamLease) -> bool:
        now = time.time()
        try:
            refreshed = await self._redis.eval(
                _REFRESH_LEASE_SCRIPT,
                1,
                self._key(lease.roadmap_id, lease.participant_id),
                now + self._ttl,
                lease.lease_id,
                now,
            )
        except RedisError:
            logger.exception("Failed to refresh realtime stream lease")
            return False
        return int(refreshed) == 1

    async def release(self, lease: RealtimeStreamLease) -> None:
        try:
            await self._redis.eval(
                _RELEASE_LEASE_SCRIPT,
                1,
                self._key(lease.roadmap_id, lease.participant_id),
                lease.lease_id,
            )
        except RedisError:
            # Lease TTL still bounds leaked state after a disconnect-time outage.
            logger.warning("Failed to release realtime stream lease", exc_info=True)

    def _key(self, roadmap_id: str, participant_id: str) -> str:
        return f"{self._key_prefix}:streams:{roadmap_id}:{participant_id}"


def _build_realtime_stream_registry() -> RealtimeStreamRegistry:
    settings = get_settings()
    if settings.realtime_backend == "memory":
        return MemoryRealtimeStreamRegistry(
            max_streams=settings.max_realtime_streams_per_participant,
        )
    if settings.realtime_backend == "redis":
        return RedisRealtimeStreamRegistry(
            redis_url=settings.redis_url or "",
            key_prefix=settings.redis_key_prefix,
            max_streams=settings.max_realtime_streams_per_participant,
            connect_timeout_seconds=settings.redis_connect_timeout_seconds,
            socket_timeout_seconds=settings.redis_socket_timeout_seconds,
        )
    raise RuntimeError(f"Unsupported realtime backend: {settings.realtime_backend}")


realtime_stream_registry = _build_realtime_stream_registry()
