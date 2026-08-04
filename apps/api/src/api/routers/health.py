import logging

import redis.asyncio as redis
from fastapi import APIRouter, Depends, HTTPException, status
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.schemas.common import HealthResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


async def _database_is_ready(db: AsyncSession) -> bool:
    try:
        await db.execute(text("SELECT 1"))
        return True
    except (SQLAlchemyError, OSError):
        logger.warning("Readiness check failed: PostgreSQL is unavailable", exc_info=True)
        return False


async def _redis_is_ready(redis_url: str) -> bool:
    settings = get_settings()
    client: redis.Redis | None = None
    try:
        client = redis.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=settings.redis_connect_timeout_seconds,
            socket_timeout=settings.redis_socket_timeout_seconds,
        )
        return bool(await client.ping())
    except (RedisError, OSError):
        logger.warning("Readiness check failed: Redis is unavailable", exc_info=True)
        return False
    finally:
        if client is not None:
            await client.aclose()


async def _readiness_response(db: AsyncSession) -> HealthResponse:
    settings = get_settings()
    database_ready = await _database_is_ready(db)
    redis_ready = True
    if settings.realtime_backend == "redis":
        redis_ready = bool(settings.redis_url) and await _redis_is_ready(settings.redis_url or "")

    if not database_ready or not redis_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service dependencies are unavailable",
        )
    return HealthResponse(status="ok", version=settings.app_version)


@router.get("/health/live", response_model=HealthResponse)
async def liveness() -> HealthResponse:
    """Process liveness; does not touch external dependencies."""
    settings = get_settings()
    return HealthResponse(status="ok", version=settings.app_version)


@router.get("/health/ready", response_model=HealthResponse)
async def readiness(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Readiness for traffic, including PostgreSQL and configured Redis."""
    return await _readiness_response(db)


@router.get("/health", response_model=HealthResponse)
async def health(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """Backward-compatible readiness alias used by existing deployments."""
    return await _readiness_response(db)
