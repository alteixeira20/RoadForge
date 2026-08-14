"""Server-authoritative roadmap structure collaboration write tests."""

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


def _synchronize_calls(func, parties: int = 2):
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


async def test_roadmap_rename_needs_no_revision_and_preserves_snapshot(client: AsyncClient):
    body = await create_with_phases(client)

    response = await client.patch(
        f"/api/roadmaps/{body['id']}/name",
        headers=auth(body["owner_session_token"]),
        json={"name": "  Shared roadmap renamed  "},
    )

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Shared roadmap renamed"
    assert response.json()["phases"] == body["phases"]
    assert response.json()["updated_at"] != body["updated_at"]


async def test_roadmap_rename_noop_does_not_advance_revision_or_log_activity(
    client: AsyncClient,
    db_session,
):
    body = await create_with_phases(client)

    response = await client.patch(
        f"/api/roadmaps/{body['id']}/name",
        headers=auth(body["owner_session_token"]),
        json={"name": body["name"]},
    )

    assert response.status_code == 200, response.text
    assert response.json()["updated_at"] == body["updated_at"]
    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.roadmap_id == body["id"],
            ActivityLog.action == "roadmap.renamed",
        )
    )
    assert result.scalars().all() == []


async def test_roadmap_rename_validates_shape(client: AsyncClient):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])

    empty = await client.patch(
        f"/api/roadmaps/{body['id']}/name",
        headers=headers,
        json={"name": "   "},
    )
    too_long = await client.patch(
        f"/api/roadmaps/{body['id']}/name",
        headers=headers,
        json={"name": "x" * 121},
    )
    extra = await client.patch(
        f"/api/roadmaps/{body['id']}/name",
        headers=headers,
        json={"name": "Valid", "last_updated_at": body["updated_at"]},
    )

    assert empty.status_code == 422
    assert too_long.status_code == 422
    assert extra.status_code == 422


async def test_phase_patch_preserves_tasks_and_projection_parity(
    client: AsyncClient,
    db_session,
):
    body = await create_with_phases(client)
    before_phase = body["phases"][0]

    response = await client.patch(
        f"/api/roadmaps/{body['id']}/phases/ph_a",
        headers=auth(body["owner_session_token"]),
        json={"name": "Alpha live", "color": "#123456", "colorMode": "manual"},
    )

    assert response.status_code == 200, response.text
    phase = response.json()["phases"][0]
    assert phase["name"] == "Alpha live"
    assert phase["color"] == "#123456"
    assert phase["colorMode"] == "manual"
    assert phase["tasks"] == before_phase["tasks"]
    assert phase["status"] == before_phase["status"]
    assert phase["progress"] == before_phase["progress"]

    roadmap = await db_session.get(Roadmap, body["id"])
    assert roadmap is not None
    parity = await validate_projection_parity(db_session, roadmap)
    assert parity.ok is True
    assert parity.issues == []


async def test_phase_patch_after_unrelated_server_write_needs_no_stale_revision(
    client: AsyncClient,
):
    body = await create_with_phases(client)

    task_done = await client.patch(
        f"/api/roadmaps/{body['id']}/tasks/tk_a1/done",
        headers=auth(body["owner_session_token"]),
        json={"done": True, "last_updated_at": body["updated_at"]},
    )
    assert task_done.status_code == 200, task_done.text

    phase_update = await client.patch(
        f"/api/roadmaps/{body['id']}/phases/ph_a",
        headers=auth(body["owner_session_token"]),
        json={"name": "Still applies on latest server state"},
    )

    assert phase_update.status_code == 200, phase_update.text
    phase = phase_update.json()["phases"][0]
    assert phase["name"] == "Still applies on latest server state"
    task = next(task for task in phase["tasks"] if task["id"] == "tk_a1")
    assert task["done"] is True


async def test_phase_patch_noop_does_not_advance_revision_or_log_activity(
    client: AsyncClient,
    db_session,
):
    body = await create_with_phases(client)

    response = await client.patch(
        f"/api/roadmaps/{body['id']}/phases/ph_a",
        headers=auth(body["owner_session_token"]),
        json={"name": "Alpha"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["updated_at"] == body["updated_at"]
    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.roadmap_id == body["id"],
            ActivityLog.action == "phase.updated",
        )
    )
    assert result.scalars().all() == []


async def test_phase_patch_validates_shape_and_missing_phase(client: AsyncClient):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])

    empty = await client.patch(
        f"/api/roadmaps/{body['id']}/phases/ph_a",
        headers=headers,
        json={},
    )
    extra = await client.patch(
        f"/api/roadmaps/{body['id']}/phases/ph_a",
        headers=headers,
        json={"progress": 100},
    )
    missing = await client.patch(
        f"/api/roadmaps/{body['id']}/phases/missing",
        headers=headers,
        json={"name": "No phase"},
    )

    assert empty.status_code == 422
    assert extra.status_code == 422
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Phase not found"}


async def test_viewer_cannot_rename_or_patch_phase(client: AsyncClient):
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
    viewer_headers = auth(joined.json()["session_token"])

    rename = await client.patch(
        f"/api/roadmaps/{body['id']}/name",
        headers=viewer_headers,
        json={"name": "Forbidden"},
    )
    phase = await client.patch(
        f"/api/roadmaps/{body['id']}/phases/ph_a",
        headers=viewer_headers,
        json={"name": "Forbidden"},
    )

    assert rename.status_code == 403
    assert phase.status_code == 403


async def test_concurrent_phase_field_operations_both_survive_row_lock(
    monkeypatch: pytest.MonkeyPatch,
):
    roadmap_name = "Concurrent phase collaboration"
    monkeypatch.setattr(structure_router, "rate_limiter", MemoryRateLimiter())
    original_patch_phase = structure_router.patch_phase
    monkeypatch.setattr(
        structure_router,
        "patch_phase",
        _synchronize_calls(original_patch_phase),
    )

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
            headers = auth(body["owner_session_token"])

            responses = await asyncio.gather(
                concurrent_client.patch(
                    f"/api/roadmaps/{body['id']}/phases/ph_a",
                    headers=headers,
                    json={"name": "Concurrent name"},
                ),
                concurrent_client.patch(
                    f"/api/roadmaps/{body['id']}/phases/ph_a",
                    headers=headers,
                    json={"color": "#445566", "colorMode": "manual"},
                ),
            )

            assert [response.status_code for response in responses] == [200, 200]
            loaded = await concurrent_client.get(
                f"/api/roadmaps/{body['id']}",
                headers=headers,
            )
            assert loaded.status_code == 200, loaded.text
            phase = loaded.json()["phases"][0]
            assert phase["name"] == "Concurrent name"
            assert phase["color"] == "#445566"
            assert phase["colorMode"] == "manual"
    finally:
        async with _test_session_factory() as db:
            await db.execute(delete(Roadmap).where(Roadmap.name == roadmap_name))
            await db.commit()


async def test_concurrent_rename_and_phase_update_both_survive_row_lock(
    monkeypatch: pytest.MonkeyPatch,
):
    initial_name = "Concurrent rename collaboration"
    roadmap_id: str | None = None
    monkeypatch.setattr(structure_router, "rate_limiter", MemoryRateLimiter())
    synchronized_name, synchronized_phase = _shared_barrier_wrappers(
        structure_router.patch_roadmap_name,
        structure_router.patch_phase,
    )
    monkeypatch.setattr(structure_router, "patch_roadmap_name", synchronized_name)
    monkeypatch.setattr(structure_router, "patch_phase", synchronized_phase)

    try:
        async with _committing_client() as concurrent_client:
            created = await concurrent_client.post(
                "/api/roadmaps",
                json={
                    "name": initial_name,
                    "owner_display_name": "Owner",
                    "phases": PHASES_WITH_TASKS,
                },
            )
            assert created.status_code == 201, created.text
            body = created.json()
            roadmap_id = body["id"]
            headers = auth(body["owner_session_token"])

            responses = await asyncio.gather(
                concurrent_client.patch(
                    f"/api/roadmaps/{roadmap_id}/name",
                    headers=headers,
                    json={"name": "Renamed concurrently"},
                ),
                concurrent_client.patch(
                    f"/api/roadmaps/{roadmap_id}/phases/ph_a",
                    headers=headers,
                    json={"color": "#778899", "colorMode": "manual"},
                ),
            )

            assert [response.status_code for response in responses] == [200, 200]
            loaded = await concurrent_client.get(
                f"/api/roadmaps/{roadmap_id}",
                headers=headers,
            )
            assert loaded.status_code == 200, loaded.text
            assert loaded.json()["name"] == "Renamed concurrently"
            phase = loaded.json()["phases"][0]
            assert phase["color"] == "#778899"
            assert phase["colorMode"] == "manual"
    finally:
        if roadmap_id is not None:
            async with _test_session_factory() as db:
                await db.execute(delete(Roadmap).where(Roadmap.id == roadmap_id))
                await db.commit()
