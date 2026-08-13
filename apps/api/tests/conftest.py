"""
Test fixtures for RoadForge API tests.

Environment setup must happen before any api.* imports so that
get_settings() and the module-level engine are initialised with the
test database URL.
"""

from __future__ import annotations

import os

_DEFAULT_TEST_URL = (
    "postgresql+asyncpg://roadforge:roadforge_dev@localhost:5433/roadforge_test"
)
_TEST_DB_URL = os.environ.get("TEST_DATABASE_URL", _DEFAULT_TEST_URL)
os.environ["DATABASE_URL"] = _TEST_DB_URL

from api.config import get_settings  # noqa: E402

get_settings.cache_clear()

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool  # noqa: E402

import api.routers.roadmap_activity as _roadmap_activity_module  # noqa: E402
import api.routers.roadmap_core as _roadmap_core_module  # noqa: E402
import api.routers.roadmap_locks as _roadmap_locks_module  # noqa: E402
import api.routers.roadmap_realtime as _roadmap_realtime_module  # noqa: E402
import api.routers.roadmap_sharing as _roadmap_sharing_module  # noqa: E402
import api.routers.roadmap_tags as _roadmap_tags_module  # noqa: E402
import api.routers.roadmap_tasks as _roadmap_tasks_module  # noqa: E402
import api.routers.roadmap_versions as _roadmap_versions_module  # noqa: E402
from api.database import get_db  # noqa: E402
from api.main import create_app  # noqa: E402
from api.models.base import Base  # noqa: E402
from api.services.rate_limit_service import MemoryRateLimiter  # noqa: E402

_test_engine = create_async_engine(_TEST_DB_URL, echo=False, poolclass=NullPool)
_test_session_factory = async_sessionmaker(_test_engine, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _create_schema():
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session():
    async with _test_engine.connect() as conn:
        await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        await conn.begin_nested()
        yield session
        await session.close()
        await conn.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    async def _override_get_db():
        yield db_session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    limiter = MemoryRateLimiter()
    _roadmap_activity_module.rate_limiter = limiter
    _roadmap_core_module.rate_limiter = limiter
    _roadmap_locks_module.rate_limiter = limiter
    _roadmap_realtime_module.rate_limiter = limiter
    _roadmap_sharing_module.rate_limiter = limiter
    _roadmap_tags_module.rate_limiter = limiter
    _roadmap_tasks_module.rate_limiter = limiter
    _roadmap_versions_module.rate_limiter = limiter

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


async def create_roadmap(client: AsyncClient, *, name: str = "Test Roadmap") -> dict:
    resp = await client.post(
        "/api/roadmaps",
        json={
            "name": name,
            "owner_display_name": "Owner",
            "phases": [],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
