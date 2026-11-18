import asyncio
import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import Dict, Protocol, Tuple

import redis.asyncio as redis
from redis.exceptions import RedisError

from api.config import get_settings
from api.services.event_bus import Event, event_bus

logger = logging.getLogger(__name__)
_LOCK_TTL_SECONDS = 30
_ACQUIRE_LOCK_SCRIPT = """
local lock_key = KEYS[1]
local index_key = KEYS[2]
local participant_id = ARGV[1]
local payload = ARGV[2]
local ttl = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local current = redis.call("GET", lock_key)
if current then
    local data = cjson.decode(current)
    local expires_at = tonumber(data["expires_at"]) or 0
    if data["participant_id"] ~= participant_id and now < expires_at then
        return {0, current}
    end
end

redis.call("SET", lock_key, payload, "EX", ttl)
redis.call("SADD", index_key, lock_key)
redis.call("EXPIRE", index_key, ttl)
return {1, payload}
"""
_RELEASE_LOCK_SCRIPT = """
local lock_key = KEYS[1]
local index_key = KEYS[2]
local participant_id = ARGV[1]

local current = redis.call("GET", lock_key)
if not current then
    return 0
end

local data = cjson.decode(current)
if data["participant_id"] ~= participant_id then
    return 0
end

redis.call("DEL", lock_key)
redis.call("SREM", index_key, lock_key)
return 1
"""


@dataclass
class Lock:
    roadmap_id: str
    target: str
    participant_id: str
    display_name: str
    expires_at: float


class EditLockStore(Protocol):
    async def acquire_lock(
        self, roadmap_id: str, target: str, participant_id: str, display_name: str
    ) -> Lock | None: ...

    async def release_lock(self, roadmap_id: str, target: str, participant_id: str) -> None: ...

    async def get_locks_for_roadmap(self, roadmap_id: str) -> list[Lock]: ...


class MemoryLockService:
    def __init__(self, ttl: int = _LOCK_TTL_SECONDS):
        # (roadmap_id, target) -> Lock
        self._locks: Dict[Tuple[str, str], Lock] = {}
        self._ttl = ttl
        self._lock = asyncio.Lock()

    async def acquire_lock(
        self, roadmap_id: str, target: str, participant_id: str, display_name: str
    ) -> Lock | None:
        async with self._lock:
            key = (roadmap_id, target)
            now = time.time()

            existing = self._locks.get(key)
            if existing and now < existing.expires_at:
                if existing.participant_id != participant_id:
                    # Locked by someone else
                    return None

            # Create or refresh lock
            lock = Lock(
                roadmap_id=roadmap_id,
                target=target,
                participant_id=participant_id,
                display_name=display_name,
                expires_at=now + self._ttl
            )
            self._locks[key] = lock

            # Broadast event
            await event_bus.publish(Event(
                roadmap_id=roadmap_id,
                action="lock.acquired",
                payload={
                    "roadmap_id": roadmap_id,
                    "target": target,
                    "participant_id": participant_id,
                    "display_name": display_name,
                }
            ))

            return lock

    async def release_lock(self, roadmap_id: str, target: str, participant_id: str):
        async with self._lock:
            key = (roadmap_id, target)
            existing = self._locks.get(key)

            if not existing:
                return

            if existing.participant_id != participant_id:
                # Cannot release someone else's lock
                return

            del self._locks[key]

            # Broadcast event
            await event_bus.publish(Event(
                roadmap_id=roadmap_id,
                action="lock.released",
                payload={
                    "roadmap_id": roadmap_id,
                    "target": target,
                    "participant_id": participant_id,
                }
            ))

    async def get_locks_for_roadmap(self, roadmap_id: str) -> list[Lock]:
        now = time.time()
        # Prune expired locks for this roadmap opportunistically
        expired_keys = [
            k for k, lk in self._locks.items()
            if k[0] == roadmap_id and now > lk.expires_at
        ]
        for k in expired_keys:
            del self._locks[k]

        return [lk for k, lk in self._locks.items() if k[0] == roadmap_id]


class RedisLockService:
    def __init__(
        self,
        *,
        redis_url: str,
        key_prefix: str,
        connect_timeout_seconds: float,
        socket_timeout_seconds: float,
        ttl: int = _LOCK_TTL_SECONDS,
    ):
        if not redis_url:
            raise RuntimeError(
                "REDIS_URL is required when ROADFORGE_REALTIME_BACKEND=redis"
            )
        self._key_prefix = key_prefix
        self._ttl = ttl
        self._redis = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=connect_timeout_seconds,
            socket_timeout=socket_timeout_seconds,
        )

    async def acquire_lock(
        self, roadmap_id: str, target: str, participant_id: str, display_name: str
    ) -> Lock | None:
        expires_at = time.time() + self._ttl
        payload = json.dumps({
            "roadmap_id": roadmap_id,
            "target": target,
            "participant_id": participant_id,
            "display_name": display_name,
            "expires_at": expires_at,
        })
        try:
            acquired, result_payload = await self._redis.eval(
                _ACQUIRE_LOCK_SCRIPT,
                2,
                self._lock_key(roadmap_id, target),
                self._index_key(roadmap_id),
                participant_id,
                payload,
                self._ttl,
                time.time(),
            )
        except RedisError:
            logger.exception("Failed to acquire edit lock through Redis")
            raise

        if int(acquired) != 1:
            return None

        lock = self._lock_from_payload(result_payload)
        if lock is None:
            raise RuntimeError("Redis returned malformed edit lock payload")

        await self._publish_acquired(lock)
        return lock

    async def release_lock(self, roadmap_id: str, target: str, participant_id: str) -> None:
        try:
            released = await self._redis.eval(
                _RELEASE_LOCK_SCRIPT,
                2,
                self._lock_key(roadmap_id, target),
                self._index_key(roadmap_id),
                participant_id,
            )
        except RedisError:
            logger.exception("Failed to release edit lock through Redis")
            raise

        if int(released) != 1:
            return

        await event_bus.publish(Event(
            roadmap_id=roadmap_id,
            action="lock.released",
            payload={
                "roadmap_id": roadmap_id,
                "target": target,
                "participant_id": participant_id,
            }
        ))

    async def get_locks_for_roadmap(self, roadmap_id: str) -> list[Lock]:
        index_key = self._index_key(roadmap_id)
        try:
            lock_keys = list(await self._redis.smembers(index_key))
            if not lock_keys:
                return []
            payloads = await self._redis.mget(lock_keys)
        except RedisError:
            logger.exception("Failed to list edit locks through Redis")
            raise

        locks: list[Lock] = []
        stale_keys: list[str] = []
        now = time.time()
        for lock_key, payload in zip(lock_keys, payloads):
            if not payload:
                stale_keys.append(lock_key)
                continue

            lock = self._lock_from_payload(payload)
            if lock is None or lock.roadmap_id != roadmap_id or now > lock.expires_at:
                stale_keys.append(lock_key)
                continue
            locks.append(lock)

        if stale_keys:
            try:
                await self._redis.delete(*stale_keys)
                await self._redis.srem(index_key, *stale_keys)
            except RedisError:
                logger.warning("Failed to remove stale Redis edit lock index entries")

        return locks

    def _lock_key(self, roadmap_id: str, target: str) -> str:
        target_hash = hashlib.sha256(target.encode("utf-8")).hexdigest()
        return f"{self._key_prefix}:lock:{roadmap_id}:{target_hash}"

    def _index_key(self, roadmap_id: str) -> str:
        return f"{self._key_prefix}:locks:index:{roadmap_id}"

    def _lock_from_payload(self, payload: str) -> Lock | None:
        try:
            data = json.loads(payload)
            return Lock(
                roadmap_id=data["roadmap_id"],
                target=data["target"],
                participant_id=data["participant_id"],
                display_name=data["display_name"],
                expires_at=float(data["expires_at"]),
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            return None

    async def _publish_acquired(self, lock: Lock) -> None:
        await event_bus.publish(Event(
            roadmap_id=lock.roadmap_id,
            action="lock.acquired",
            payload={
                "roadmap_id": lock.roadmap_id,
                "target": lock.target,
                "participant_id": lock.participant_id,
                "display_name": lock.display_name,
            }
        ))


LockService = MemoryLockService


def _build_lock_service() -> EditLockStore:
    settings = get_settings()
    if settings.realtime_backend == "memory":
        return MemoryLockService()
    if settings.realtime_backend == "redis":
        return RedisLockService(
            redis_url=settings.redis_url or "",
            key_prefix=settings.redis_key_prefix,
            connect_timeout_seconds=settings.redis_connect_timeout_seconds,
            socket_timeout_seconds=settings.redis_socket_timeout_seconds,
        )
    raise RuntimeError(f"Unsupported realtime backend: {settings.realtime_backend}")


# Global lock service instance
lock_service = _build_lock_service()
