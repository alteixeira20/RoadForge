from redis import asyncio as redis
from redis.exceptions import RedisError

from api.config import Settings


async def validate_realtime_connectivity(settings: Settings) -> None:
    if settings.realtime_backend != "redis":
        return

    client = redis.Redis.from_url(
        settings.redis_url or "",
        socket_connect_timeout=settings.redis_connect_timeout_seconds,
        socket_timeout=settings.redis_socket_timeout_seconds,
    )
    try:
        await client.ping()
    except RedisError as exc:
        raise RuntimeError(
            "Redis is unavailable while ROADFORGE_REALTIME_BACKEND=redis."
        ) from exc
    finally:
        await client.aclose()
