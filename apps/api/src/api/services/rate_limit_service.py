from __future__ import annotations

import time
from dataclasses import dataclass

from fastapi import HTTPException

_RATE_LIMIT_DETAIL = "Too many requests. Try again later."
_MAX_BUCKETS = 10_000


@dataclass
class RateLimitResult:
    allowed: bool
    remaining: int
    retry_after: int


@dataclass
class _Bucket:
    count: int
    reset_at: float


class InMemoryRateLimiter:
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


rate_limiter = InMemoryRateLimiter()
