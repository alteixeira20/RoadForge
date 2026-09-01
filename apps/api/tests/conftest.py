"""
Test fixtures for RoadForge API tests.

Environment setup must happen before any api.* imports so that
get_settings() and the module-level engine are initialised with the
test database URL.
"""

from __future__ import annotations

import os

# ── 1. Point at the test DB before any api.* import ───────────────────────────
_DEFAULT_TEST_URL = (
    "postgresql+asyncpg://roadforge:roadforge_dev@localhost:5433/roadforge_test"
)
_TEST_DB_URL = os.environ.get("TEST_DATABASE_URL", _DEFAULT_TEST_URL)

os.environ["DATABASE_URL"] = _TEST_DB_URL

# ── 2. Clear the settings cache so get_settings() picks up the override ───────
# Import order matters: config must be imported before other api modules.
from api.config import get_settings  # noqa: E402

get_settings.cache_clear()

# ── 3. Now safe to import api modules ────────────────────────────────────────
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool  # noqa: E402

import api.routers.roadmap_activity as _roadmap_activity_module  # noqa: E402
import api.routers.roadmap_client as _roadmap_client_module  # noqa: E402
import api.routers.roadmap_core as _roadmap_core_module  # noqa: E402
import api.routers.roadmap_focused as _roadmap_focused_module  # noqa: E402
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

# ── 4. Engine for the test database ───────────────────────────────────────────
# NullPool disables connection pooling so asyncpg never holds loop-bound
# connections across pytest-asyncio's per-test event loops.
_test_engine = create_async_engine(_TEST_DB_URL, echo=False, poolclass=NullPool)
_test_session_factory = async_sessionmaker(_test_engine, expire_on_commit=False)


# ── 5. Create/drop schema once per test session ───────────────────────────────
@pytest_asyncio.fixture(scope="session", autouse=True)
async def _create_schema():
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# ── 6. Per-test transaction rollback for isolation ────────────────────────────
@pytest_asyncio.fixture
async def db_session():
    """
    Yields an AsyncSession that wraps each test in a SAVEPOINT so the outer
    transaction is never committed and always rolls back after the test.
    """
    async with _test_engine.connect() as conn:
        await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        await conn.begin_nested()  # SAVEPOINT

        yield session

        await session.close()
        await conn.rollback()


# ── 7. Override get_db with the per-test session ──────────────────────────────
@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    """AsyncClient with get_db overridden and rate limiter reset."""

    async def _override_get_db():
        yield db_session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    # Production intentionally disables the public OpenAPI URL. Expose the
    # generated schema only in the test app so response-model contracts can be
    # asserted without changing the deployed API surface.
    @app.get("/openapi.json", include_in_schema=False)
    async def _test_openapi_schema() -> dict:
        return app.openapi()

    # All roadmap route modules share one fresh limiter per test so endpoint
    # budgets preserve the pre-decomposition behavior without cross-test bleed.
    limiter = MemoryRateLimiter()
    _roadmap_activity_module.rate_limiter = limiter
    _roadmap_client_module.rate_limiter = limiter
    _roadmap_core_module.rate_limiter = limiter
    _roadmap_focused_module.rate_limiter = limiter
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


# ── 8. Helper — create a roadmap and return the full response body ────────────
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
