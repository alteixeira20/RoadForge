"""Server-authoritative phase create/delete/reorder collaboration tests."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

import api.routers.roadmap_structure as structure_router
from api.database import get_db
from api.main import create_app
from api.models.roadmap import ActivityLog, Roadmap
from api.services.projection import validate_projection_parity
from api.services.rate_limit_service import MemoryRateLimiter
from tests.conftest import _test_session_factory
from tests.helpers_projection import PHASES_WITH_TASKS, auth, create_with_phases

pytestmark = pytest.mark.asyncio


@asynccontextmanager
async def _committing_client():
    async def _override_get_db():
        async with _test_session_factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def _shared_barrier_wrappers(*functions):
    ready = asyncio.Event()
    counter_lock = asyncio.Lock()
    entered = 0

    def wrap(func):
        async def wrapped(*args, **kwargs):
            nonlocal entered
            async with counter_lock:
                entered += 1
                if entered >= len(functions):
                    ready.set()
            await asyncio.wait_for(ready.wait(), timeout=5)
            return await func(*args, **kwargs)

        return wrapped

    return tuple(wrap(func) for func in functions)


async def test_create_phase_appends_server_normalized_empty_phase_and_keeps_projection_parity(
    client: AsyncClient,
    db_session,
):
    body = await create_with_phases(client)

    response = await client.post(
        f"/api/roadmaps/{body['id']}/phases",
        headers=auth(body["owner_session_token"]),
        json={
            "id": "ph_c",
            "name": " Gamma ",
            "color": " #445566 ",
            "colorMode": "manual",
        },
    )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert [phase["id"] for phase in payload["phases"]] == ["ph_a", "ph_b", "ph_c"]
    created = payload["phases"][-1]
    assert created == {
        "id": "ph_c",
        "num": "03",
        "name": "Gamma",
        "color": "#445566",
        "colorMode": "manual",
        "status": "future",
        "progress": 0,
        "tasks": [],
    }

    roadmap = await db_session.get(Roadmap, body["id"])
    assert roadmap is not None
    parity = await validate_projection_parity(db_session, roadmap)
    assert parity.ok is True
    assert parity.issues == []


async def test_create_phase_rejects_duplicate_id_without_mutating_roadmap(client: AsyncClient):
    body = await create_with_phases(client)

    response = await client.post(
        f"/api/roadmaps/{body['id']}/phases",
        headers=auth(body["owner_session_token"]),
        json={"id": "ph_a", "name": "Duplicate", "color": "red"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Phase ID already exists"}
    loaded = await client.get(
        f"/api/roadmaps/{body['id']}",
        headers=auth(body["owner_session_token"]),
    )
    assert loaded.status_code == 200
    assert loaded.json()["phases"] == body["phases"]
    assert loaded.json()["updated_at"] == body["updated_at"]


async def test_delete_phase_removes_latest_server_phase_and_renumbers_survivors(
    client: AsyncClient,
    db_session,
):
    body = await create_with_phases(client)

    response = await client.delete(
        f"/api/roadmaps/{body['id']}/phases/ph_a",
        headers=auth(body["owner_session_token"]),
    )

    assert response.status_code == 200, response.text
    phases = response.json()["phases"]
    assert [phase["id"] for phase in phases] == ["ph_b"]
    assert phases[0]["num"] == "01"
    assert phases[0]["tasks"] == body["phases"][1]["tasks"]

    roadmap = await db_session.get(Roadmap, body["id"])
    assert roadmap is not None
    parity = await validate_projection_parity(db_session, roadmap)
    assert parity.ok is True
    assert parity.issues == []


async def test_delete_phase_missing_is_not_a_whole_roadmap_conflict(client: AsyncClient):
    body = await create_with_phases(client)

    response = await client.delete(
        f"/api/roadmaps/{body['id']}/phases/missing",
        headers=auth(body["owner_session_token"]),
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Phase not found"}


async def test_reorder_merges_known_order_and_preserves_server_only_phase(client: AsyncClient):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])
    created = await client.post(
        f"/api/roadmaps/{body['id']}/phases",
        headers=headers,
        json={"id": "ph_c", "name": "Gamma", "color": "orange"},
    )
    assert created.status_code == 201, created.text

    response = await client.put(
        f"/api/roadmaps/{body['id']}/phases/order",
        headers=headers,
        json={"phase_ids": ["ph_b", "ph_a", "already-deleted-client-id"]},
    )

    assert response.status_code == 200, response.text
    phases = response.json()["phases"]
    assert [phase["id"] for phase in phases] == ["ph_b", "ph_a", "ph_c"]
    assert [phase["num"] for phase in phases] == ["01", "02", "03"]
    assert next(phase for phase in phases if phase["id"] == "ph_c")["name"] == "Gamma"


async def test_reorder_noop_is_revision_and_activity_neutral(client: AsyncClient, db_session):
    body = await create_with_phases(client)

    response = await client.put(
        f"/api/roadmaps/{body['id']}/phases/order",
        headers=auth(body["owner_session_token"]),
        json={"phase_ids": ["ph_a", "ph_b"]},
    )

    assert response.status_code == 200, response.text
    assert response.json()["updated_at"] == body["updated_at"]
    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.roadmap_id == body["id"],
            ActivityLog.action == "phase.reordered",
        )
    )
    assert result.scalars().all() == []


async def test_phase_structure_payload_validation(client: AsyncClient):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])

    duplicate_order = await client.put(
        f"/api/roadmaps/{body['id']}/phases/order",
        headers=headers,
        json={"phase_ids": ["ph_a", "ph_a"]},
    )
    empty_order = await client.put(
        f"/api/roadmaps/{body['id']}/phases/order",
        headers=headers,
        json={"phase_ids": []},
    )
    create_extra = await client.post(
        f"/api/roadmaps/{body['id']}/phases",
        headers=headers,
        json={"id": "ph_c", "name": "Gamma", "color": "red", "tasks": []},
    )

    assert duplicate_order.status_code == 422
    assert empty_order.status_code == 422
    assert create_extra.status_code == 422


async def test_viewer_cannot_create_delete_or_reorder_phases(client: AsyncClient):
    body = await create_with_phases(client)
    rotate = await client.post(
        f"/api/roadmaps/{body['id']}/share-links/viewer/rotate",
        headers=auth(body["owner_session_token"]),
    )
    assert rotate.status_code == 200, rotate.text
    invite_token = rotate.json()["url"].split("token=")[-1]
    joined = await client.post(
        "/api/roadmaps/join",
        json={"token": invite_token, "display_name": "Viewer"},
    )
    assert joined.status_code == 200, joined.text
    headers = auth(joined.json()["session_token"])

    create = await client.post(
        f"/api/roadmaps/{body['id']}/phases",
        headers=headers,
        json={"id": "ph_c", "name": "Gamma", "color": "red"},
    )
    delete_response = await client.delete(
        f"/api/roadmaps/{body['id']}/phases/ph_a",
        headers=headers,
    )
    reorder = await client.put(
        f"/api/roadmaps/{body['id']}/phases/order",
        headers=headers,
        json={"phase_ids": ["ph_b", "ph_a"]},
    )

    assert create.status_code == 403
    assert delete_response.status_code == 403
    assert reorder.status_code == 403


async def test_concurrent_create_and_reorder_both_survive_with_deterministic_merge(
    monkeypatch: pytest.MonkeyPatch,
):
    roadmap_name = "Concurrent phase structure merge"
    roadmap_id: str | None = None
    monkeypatch.setattr(structure_router, "rate_limiter", MemoryRateLimiter())
    synchronized_create, synchronized_reorder = _shared_barrier_wrappers(
        structure_router.create_phase,
        structure_router.reorder_phases,
    )
    monkeypatch.setattr(structure_router, "create_phase", synchronized_create)
    monkeypatch.setattr(structure_router, "reorder_phases", synchronized_reorder)

    try:
        async with _committing_client() as concurrent_client:
            created = await concurrent_client.post(
                "/api/roadmaps",
                json={
                    "name": roadmap_name,
                    "owner_display_name": "Owner",
                    "phases": PHASES_WITH_TASKS,
                },
            )
            assert created.status_code == 201, created.text
            body = created.json()
            roadmap_id = body["id"]
            headers = auth(body["owner_session_token"])

            responses = await asyncio.gather(
                concurrent_client.post(
                    f"/api/roadmaps/{roadmap_id}/phases",
                    headers=headers,
                    json={"id": "ph_c", "name": "Gamma", "color": "orange"},
                ),
                concurrent_client.put(
                    f"/api/roadmaps/{roadmap_id}/phases/order",
                    headers=headers,
                    json={"phase_ids": ["ph_b", "ph_a"]},
                ),
            )

            assert [response.status_code for response in responses] == [201, 200]
            loaded = await concurrent_client.get(
                f"/api/roadmaps/{roadmap_id}",
                headers=headers,
            )
            assert loaded.status_code == 200, loaded.text
            phases = loaded.json()["phases"]
            assert [phase["id"] for phase in phases] == ["ph_b", "ph_a", "ph_c"]
            assert [phase["num"] for phase in phases] == ["01", "02", "03"]
    finally:
        if roadmap_id is not None:
            async with _test_session_factory() as db:
                await db.execute(delete(Roadmap).where(Roadmap.id == roadmap_id))
                await db.commit()
