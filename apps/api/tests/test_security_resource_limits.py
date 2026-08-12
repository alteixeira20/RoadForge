from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import api.routers.roadmaps as roadmaps_router
import api.services.activity_log_limit as activity_log_limit
import api.services.roadmap_join_service as roadmap_join_service
import api.services.version_service as version_service
from api.models.roadmap import ActivityLog, RoadmapVersion
from api.services.auth_service import is_participant_revoked
from api.services.id_service import generate_id
from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


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
