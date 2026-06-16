"""
Test fixtures for Anvilary API tests.

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

# ── 3. Now safe to import api modules ─────────────────────────────────────────
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

from api.database import get_db  # noqa: E402
from api.main import create_app  # noqa: E402
from api.models.base import Base  # noqa: E402
from api.services.rate_limit_service import MemoryRateLimiter  # noqa: E402
import api.routers.roadmaps as _roadmaps_module  # noqa: E402

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

    # Reset rate limiter so tests don't bleed into each other
    _roadmaps_module.rate_limiter = MemoryRateLimiter()

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
