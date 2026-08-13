import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

import api.routers.roadmaps as roadmaps_router
import api.services.activity_log_limit as activity_log_limit
import api.services.roadmap_join_service as roadmap_join_service
import api.services.version_service as version_service
from api.database import async_session_factory
from api.main import create_app
from api.models.roadmap import ActivityLog, Participant, Roadmap, RoadmapVersion
from api.services.auth_service import is_participant_revoked
from api.services.id_service import generate_id
from api.services.rate_limit_service import MemoryRateLimiter
from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@asynccontextmanager
async def _committing_client():
    """Use the application's real DB dependency so concurrent requests get separate transactions."""
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def _synchronize_calls(func, parties: int = 2):
    """Hold route calls until every contender is ready, then release them together."""
    ready = asyncio.Event()
    counter_lock = asyncio.Lock()
    entered = 0

    async def wrapped(*args, **kwargs):
        nonlocal entered
        async with counter_lock:
            entered += 1
            if entered >= parties:
                ready.set()
        await asyncio.wait_for(ready.wait(), timeout=5)
        return await func(*args, **kwargs)

    return wrapped


async def _delete_committed_roadmaps(roadmap_names: list[str]) -> None:
    if not roadmap_names:
        return
    async with async_session_factory() as db:
        await db.execute(delete(Roadmap).where(Roadmap.name.in_(roadmap_names)))
        await db.commit()


async def test_global_server_roadmap_capacity_blocks_further_anonymous_creation(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        roadmaps_router,
        "get_settings",
        lambda: SimpleNamespace(
            web_base_url="http://localhost:3020",
            max_server_roadmaps=1,
        ),
    )

    first = await client.post(
        "/api/roadmaps",
        json={"name": "First", "owner_display_name": "Owner", "phases": []},
    )
    second = await client.post(
        "/api/roadmaps",
        json={"name": "Second", "owner_display_name": "Owner", "phases": []},
    )

    assert first.status_code == 201, first.text
    assert second.status_code == 503, second.text
    assert second.json()["detail"] == "Server roadmap capacity is temporarily unavailable"


async def test_global_server_roadmap_capacity_is_exact_under_concurrent_requests(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async with async_session_factory() as db:
        baseline = int(await db.scalar(select(func.count(Roadmap.id))) or 0)

    roadmap_names = ["Concurrent capacity A", "Concurrent capacity B"]
    original_create = roadmaps_router.create_roadmap
    monkeypatch.setattr(
        roadmaps_router,
        "create_roadmap",
        _synchronize_calls(original_create),
    )
    monkeypatch.setattr(roadmaps_router, "rate_limiter", MemoryRateLimiter())
    monkeypatch.setattr(
        roadmaps_router,
        "get_settings",
        lambda: SimpleNamespace(
            web_base_url="http://localhost:3020",
            max_server_roadmaps=baseline + 1,
        ),
    )

    try:
        async with _committing_client() as concurrent_client:
            responses = await asyncio.gather(
                concurrent_client.post(
                    "/api/roadmaps",
                    json={
                        "name": roadmap_names[0],
                        "owner_display_name": "Owner",
                        "phases": [],
                    },
                ),
                concurrent_client.post(
                    "/api/roadmaps",
                    json={
                        "name": roadmap_names[1],
                        "owner_display_name": "Owner",
                        "phases": [],
                    },
                ),
            )

        assert sorted(response.status_code for response in responses) == [201, 503]
        rejected = next(response for response in responses if response.status_code == 503)
        assert rejected.json()["detail"] == "Server roadmap capacity is temporarily unavailable"

        created_ids = [
            response.json()["id"] for response in responses if response.status_code == 201
        ]
        assert len(created_ids) == 1

        async with async_session_factory() as db:
            final_count = int(await db.scalar(select(func.count(Roadmap.id))) or 0)
        assert final_count == baseline + 1
    finally:
        await _delete_committed_roadmaps(roadmap_names)


async def test_share_link_active_session_cap_prevents_participant_row_amplification(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    body = await create_roadmap(client)
    viewer_url = next(link["url"] for link in body["share_links"] if link["role"] == "viewer")
    token = viewer_url.split("token=")[-1]

    monkeypatch.setattr(
        roadmap_join_service,
        "get_settings",
        lambda: SimpleNamespace(max_active_sessions_per_share_link=1),
    )

    first = await client.post(
        "/api/roadmaps/join",
        json={"token": token, "display_name": "Viewer One"},
    )
    second = await client.post(
        "/api/roadmaps/join",
        json={"token": token, "display_name": "Viewer Two"},
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 429, second.text
    assert second.json()["detail"] == "Active session limit reached for this invite"


async def test_share_link_active_session_cap_is_exact_under_concurrent_joins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    roadmap_name = "Concurrent join capacity"
    router_limiter = MemoryRateLimiter()
    join_limiter = MemoryRateLimiter()
    monkeypatch.setattr(roadmaps_router, "rate_limiter", router_limiter)
    monkeypatch.setattr(roadmap_join_service, "rate_limiter", join_limiter)

    try:
        async with _committing_client() as concurrent_client:
            created = await concurrent_client.post(
                "/api/roadmaps",
                json={
                    "name": roadmap_name,
                    "owner_display_name": "Owner",
                    "phases": [],
                },
            )
            assert created.status_code == 201, created.text
            body = created.json()
            viewer_link = next(
                link for link in body["share_links"] if link["role"] == "viewer"
            )
            token = viewer_link["url"].split("token=")[-1]

            monkeypatch.setattr(
                roadmap_join_service,
                "get_settings",
                lambda: SimpleNamespace(max_active_sessions_per_share_link=1),
            )
            original_join = roadmaps_router.join_roadmap
            monkeypatch.setattr(
                roadmaps_router,
                "join_roadmap",
                _synchronize_calls(original_join),
            )

            responses = await asyncio.gather(
                concurrent_client.post(
                    "/api/roadmaps/join",
                    json={"token": token, "display_name": "Concurrent Viewer A"},
                ),
                concurrent_client.post(
                    "/api/roadmaps/join",
                    json={"token": token, "display_name": "Concurrent Viewer B"},
                ),
            )

        assert sorted(response.status_code for response in responses) == [200, 429]
        rejected = next(response for response in responses if response.status_code == 429)
        assert rejected.json()["detail"] == "Active session limit reached for this invite"

        async with async_session_factory() as db:
            participant_count = int(
                await db.scalar(
                    select(func.count(Participant.id)).where(
                        Participant.share_link_id == viewer_link["id"]
                    )
                )
                or 0
            )
        assert participant_count == 1
    finally:
        await _delete_committed_roadmaps([roadmap_name])


async def test_activity_log_cap_keeps_only_newest_rows(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    body = await create_roadmap(client)
    roadmap_id = body["id"]

    for index in range(5):
        db_session.add(
            ActivityLog(
                id=f"al_test_{index}",
                roadmap_id=roadmap_id,
                action="security.test",
                entity_type="roadmap",
                entity_id=roadmap_id,
                metadata_json={"index": index},
            )
        )
    await db_session.flush()

    monkeypatch.setattr(
        activity_log_limit,
        "get_settings",
        lambda: SimpleNamespace(max_activity_logs_per_roadmap=3),
    )
    await activity_log_limit.enforce_activity_log_cap(db_session, roadmap_id)
    await db_session.flush()

    count = await db_session.scalar(
        select(func.count(ActivityLog.id)).where(ActivityLog.roadmap_id == roadmap_id)
    )
    assert count == 3


async def test_version_history_byte_cap_preserves_only_bounded_recent_history(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    body = await create_roadmap(client)
    roadmap_id = body["id"]

    for number in range(2, 6):
        db_session.add(
            RoadmapVersion(
                id=generate_id("rv_"),
                roadmap_id=roadmap_id,
                version_number=number,
                roadmap_name="Bounded",
                snapshot_json={"phases": [], "padding": "x" * 512},
                action="roadmap.checkpoint",
            )
        )
    await db_session.flush()

    monkeypatch.setattr(
        version_service,
        "get_settings",
        lambda: SimpleNamespace(max_version_history_bytes_per_roadmap=1),
    )
    await version_service._trim_old_versions(db_session, roadmap_id)
    await db_session.flush()

    versions = (
        await db_session.execute(
            select(RoadmapVersion)
            .where(RoadmapVersion.roadmap_id == roadmap_id)
            .order_by(RoadmapVersion.version_number.desc())
        )
    ).scalars().all()
    assert [version.version_number for version in versions] == [5, 4, 3]


async def test_soft_deleted_roadmap_invalidates_existing_sse_authorization(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    participant_id = body["owner_participant_id"]

    response = await client.delete(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(body["owner_session_token"]),
    )
    assert response.status_code == 200, response.text

    assert await is_participant_revoked(db_session, roadmap_id, participant_id) is True
