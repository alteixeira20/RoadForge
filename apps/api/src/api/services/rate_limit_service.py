from __future__ import annotations

import hashlib
import logging
import math
import time
from dataclasses import dataclass
from typing import Protocol

import redis
from fastapi import HTTPException
from redis.exceptions import RedisError

from api.config import get_settings

_RATE_LIMIT_DETAIL = "Too many requests. Try again later."
_MAX_BUCKETS = 10_000
_RATE_LIMIT_SCRIPT = """
local count = redis.call("INCR", KEYS[1])
if count == 1 then
    redis.call("EXPIRE", KEYS[1], ARGV[1])
end

local pttl = redis.call("PTTL", KEYS[1])
if pttl < 0 then
    redis.call("EXPIRE", KEYS[1], ARGV[1])
    pttl = tonumber(ARGV[1]) * 1000
end

return {count, pttl}
"""


logger = logging.getLogger(__name__)


@dataclass
class RateLimitResult:
    allowed: bool
    remaining: int
    retry_after: int


@dataclass
class _Bucket:
    count: int
    reset_at: float


class RateLimiter(Protocol):
    def check(self, action: str, key: str, limit: int, window_seconds: int) -> RateLimitResult: ...

    def enforce(self, action: str, key: str, limit: int, window_seconds: int) -> RateLimitResult: ...


class MemoryRateLimiter:
    """Small single-process fixed-window limiter for the current one-worker API."""

    def __init__(self) -> None:
        self._buckets: dict[str, _Bucket] = {}

    def check(self, action: str, key: str, limit: int, window_seconds: int) -> RateLimitResult:
        now = time.monotonic()
        self._expire(now)
        bucket_key = f"{action}:{key}"
        bucket = self._buckets.get(bucket_key)
        if bucket is None or bucket.reset_at <= now:
            self._buckets[bucket_key] = _Bucket(count=1, reset_at=now + window_seconds)
            return RateLimitResult(allowed=True, remaining=max(limit - 1, 0), retry_after=0)

        retry_after = max(1, int(bucket.reset_at - now) + 1)
        if bucket.count >= limit:
            return RateLimitResult(allowed=False, remaining=0, retry_after=retry_after)

        bucket.count += 1
        return RateLimitResult(allowed=True, remaining=max(limit - bucket.count, 0), retry_after=retry_after)

    def enforce(self, action: str, key: str, limit: int, window_seconds: int) -> RateLimitResult:
        result = self.check(action, key, limit, window_seconds)
        if not result.allowed:
            raise HTTPException(
                status_code=429,
                detail=_RATE_LIMIT_DETAIL,
                headers={"Retry-After": str(result.retry_after)},
            )
        return result

    def _expire(self, now: float) -> None:
        if len(self._buckets) <= _MAX_BUCKETS:
            expired = [key for key, bucket in self._buckets.items() if bucket.reset_at <= now]
        else:
            expired = [
                key
                for key, bucket in sorted(self._buckets.items(), key=lambda item: item[1].reset_at)
                if bucket.reset_at <= now
            ]
            if len(self._buckets) - len(expired) > _MAX_BUCKETS:
                overflow = len(self._buckets) - len(expired) - _MAX_BUCKETS
                oldest = [
                    key
                    for key, _bucket in sorted(self._buckets.items(), key=lambda item: item[1].reset_at)
                    if key not in expired
                ]
                expired.extend(oldest[:overflow])

        for key in expired:
            self._buckets.pop(key, None)


class RedisRateLimiter:
    """Redis fixed-window limiter shared by Redis-backed realtime deployments."""

    def __init__(
        self,
        *,
        redis_url: str,
        key_prefix: str,
        connect_timeout_seconds: float,
        socket_timeout_seconds: float,
    ) -> None:
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

    def check(self, action: str, key: str, limit: int, window_seconds: int) -> RateLimitResult:
        try:
            count, pttl = self._redis.eval(
                _RATE_LIMIT_SCRIPT,
                1,
                self._bucket_key(action, key),
                window_seconds,
            )
        except RedisError:
            logger.warning("Rate limiter Redis check failed; allowing request for action=%s", action)
            return RateLimitResult(allowed=True, remaining=limit, retry_after=0)

        count = int(count)
        retry_after = max(1, math.ceil(int(pttl) / 1000)) if int(pttl) > 0 else window_seconds
        if count > limit:
            return RateLimitResult(allowed=False, remaining=0, retry_after=retry_after)

        return RateLimitResult(
            allowed=True,
            remaining=max(limit - count, 0),
            retry_after=0 if count == 1 else retry_after,
        )

    def enforce(self, action: str, key: str, limit: int, window_seconds: int) -> RateLimitResult:
        result = self.check(action, key, limit, window_seconds)
        if not result.allowed:
            raise HTTPException(
                status_code=429,
                detail=_RATE_LIMIT_DETAIL,
                headers={"Retry-After": str(result.retry_after)},
            )
        return result

    def _bucket_key(self, action: str, key: str) -> str:
        key_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return f"{self._key_prefix}:rate:{action}:{key_hash}"


InMemoryRateLimiter = MemoryRateLimiter


def _build_rate_limiter() -> RateLimiter:
    settings = get_settings()
    if settings.realtime_backend == "memory":
        return MemoryRateLimiter()
    if settings.realtime_backend == "redis":
        return RedisRateLimiter(
            redis_url=settings.redis_url or "",
            key_prefix=settings.redis_key_prefix,
            connect_timeout_seconds=settings.redis_connect_timeout_seconds,
            socket_timeout_seconds=settings.redis_socket_timeout_seconds,
        )
    raise RuntimeError(f"Unsupported realtime backend: {settings.realtime_backend}")


rate_limiter = _build_rate_limiter()
