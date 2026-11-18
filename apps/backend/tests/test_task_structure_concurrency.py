"""Real PostgreSQL concurrency tests for task structure writes."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

import api.features.tasks.structure_router as task_structure_router
from api.database import get_db
from api.features.tasks import structure_service
from api.main import create_app
from api.models.roadmap import ActivityLog, Roadmap
from api.shared.security import rate_limit_service
from api.shared.security.rate_limit_service import MemoryRateLimiter
from tests.conftest import _test_session_factory
from tests.helpers_projection import PHASES_WITH_TASKS, auth
from tests.test_auth_and_share_links import _join, _rotate_link

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


async def test_concurrent_task_create_and_reorder_both_survive_deterministically(
    monkeypatch: pytest.MonkeyPatch,
):
    roadmap_name = "Concurrent task create reorder"
    roadmap_id: str | None = None
    monkeypatch.setattr(rate_limit_service, "rate_limiter", MemoryRateLimiter())
    synchronized_create, synchronized_reorder = _shared_barrier_wrappers(
        task_structure_router.create_task,
        task_structure_router.reorder_top_level_tasks,
    )
    monkeypatch.setattr(task_structure_router, "create_task", synchronized_create)
    monkeypatch.setattr(
        task_structure_router,
        "reorder_top_level_tasks",
        synchronized_reorder,
    )

    try:
        async with _committing_client() as client:
            created = await client.post(
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
                client.post(
                    f"/api/roadmaps/{roadmap_id}/phases/ph_a/tasks",
                    headers=headers,
                    json={"id": "tk_concurrent", "title": "Concurrent create"},
                ),
                client.put(
                    f"/api/roadmaps/{roadmap_id}/phases/ph_a/tasks/order",
                    headers=headers,
                    json={"task_ids": ["tk_a1"]},
                ),
            )

            assert [response.status_code for response in responses] == [201, 200]
            loaded = await client.get(
                f"/api/roadmaps/{roadmap_id}",
                headers=headers,
            )
            assert loaded.status_code == 200, loaded.text
            ids = [task["id"] for task in loaded.json()["phases"][0]["tasks"]]
            assert ids == ["tk_a1", "tk_a2", "tk_concurrent"]
    finally:
        if roadmap_id is not None:
            async with _test_session_factory() as db:
                await db.execute(delete(Roadmap).where(Roadmap.id == roadmap_id))
                await db.commit()


async def test_concurrent_dependency_links_both_survive_row_lock(
    monkeypatch: pytest.MonkeyPatch,
):
    roadmap_name = "Concurrent dependency links"
    roadmap_id: str | None = None
    monkeypatch.setattr(rate_limit_service, "rate_limiter", MemoryRateLimiter())
    synchronized_first, synchronized_second = _shared_barrier_wrappers(
        task_structure_router.set_task_dependency,
        task_structure_router.set_task_dependency,
    )
    call_index = 0

    async def synchronized_dependency(*args, **kwargs):
        nonlocal call_index
        wrapper = synchronized_first if call_index == 0 else synchronized_second
        call_index += 1
        return await wrapper(*args, **kwargs)

    monkeypatch.setattr(
        task_structure_router,
        "set_task_dependency",
        synchronized_dependency,
    )

    try:
        async with _committing_client() as client:
            created = await client.post(
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
                client.put(
                    f"/api/roadmaps/{roadmap_id}/tasks/tk_b1/dependencies/tk_a1",
                    headers=headers,
                ),
                client.put(
                    f"/api/roadmaps/{roadmap_id}/tasks/tk_b1/dependencies/tk_a2",
                    headers=headers,
                ),
            )

            assert [response.status_code for response in responses] == [200, 200]
            loaded = await client.get(
                f"/api/roadmaps/{roadmap_id}",
                headers=headers,
            )
            assert loaded.status_code == 200, loaded.text
            task_b1 = next(
                task
                for phase in loaded.json()["phases"]
                for task in phase["tasks"]
                if task["id"] == "tk_b1"
            )
            assert set(task_b1["deps"]) == {"tk_a1", "tk_a2"}
    finally:
        if roadmap_id is not None:
            async with _test_session_factory() as db:
                await db.execute(delete(Roadmap).where(Roadmap.id == roadmap_id))
                await db.commit()


async def test_second_locked_reorder_wins_for_known_tasks_and_keeps_server_only_tasks(monkeypatch):
    roadmap_id = None
    first_locked = asyncio.Event()
    second_waiting = asyncio.Event()
    original_lock = structure_service.fetch_active_roadmap_for_update
    monkeypatch.setattr(rate_limit_service, "rate_limiter", MemoryRateLimiter())

    async def acquire_in_order(db, target_id):
        if first_locked.is_set():
            second_waiting.set()
            return await original_lock(db, target_id)
        roadmap = await original_lock(db, target_id)
        first_locked.set()
        await asyncio.wait_for(second_waiting.wait(), timeout=5)
        return roadmap

    def task_ids(response):
        return [task["id"] for task in response.json()["phases"][0]["tasks"]]

    try:
        async with _committing_client() as client:
            created = await client.post("/api/roadmaps", json={
                "name": "Two reorder writers",
                "owner_display_name": "Owner",
                "phases": PHASES_WITH_TASKS,
            })
            assert created.status_code == 201, created.text
            roadmap_id = created.json()["id"]
            owner_token = created.json()["owner_session_token"]
            owner = auth(owner_token)
            editor_invite = await _rotate_link(client, roadmap_id, owner_token, "editor")
            joined = await _join(client, editor_invite, "Editor")
            assert joined.status_code == 200, joined.text
            editor = auth(joined.json()["session_token"])
            phase = f"/api/roadmaps/{roadmap_id}/phases/ph_a/tasks"
            for task_id, title in [
                ("tk_reorder_peer", "Other top-level task"),
                ("tk_server_only", "Server-only task"),
            ]:
                created_task = await client.post(phase, headers=owner, json={
                    "id": task_id, "title": title,
                })
                assert created_task.status_code == 201, created_task.text

            monkeypatch.setattr(
                structure_service, "fetch_active_roadmap_for_update", acquire_in_order,
            )
            async with asyncio.TaskGroup() as group:
                first = group.create_task(client.put(f"{phase}/order", headers=owner, json={
                    "task_ids": ["tk_reorder_peer", "tk_a1", "tk_stale"],
                }))
                await asyncio.wait_for(first_locked.wait(), timeout=5)
                second = group.create_task(client.put(f"{phase}/order", headers=editor, json={
                    "task_ids": ["tk_a1", "tk_reorder_peer"],
                }))

            assert first.result().status_code == second.result().status_code == 200
            first_order = ["tk_reorder_peer", "tk_a1", "tk_server_only"]
            final_order = ["tk_a1", "tk_reorder_peer", "tk_server_only"]
            # The first response refreshes after releasing its row lock. The
            # activity rows pin what each transaction actually committed.
            async with _test_session_factory() as db:
                result = await db.scalars(select(ActivityLog).where(
                    ActivityLog.roadmap_id == roadmap_id,
                    ActivityLog.action == "task.reordered",
                ))
                logs = {row.actor_name: row for row in result}
            assert logs.keys() == {"Owner", "Editor"}
            assert logs["Owner"].after_json == {"taskIds": first_order}
            assert logs["Editor"].before_json == {"taskIds": first_order}
            assert logs["Editor"].after_json == {"taskIds": final_order}
            assert task_ids(second.result()) == [
                "tk_a1", "tk_a2", "tk_reorder_peer", "tk_server_only",
            ]
            loaded = await client.get(f"/api/roadmaps/{roadmap_id}", headers=owner)
            assert loaded.status_code == 200
            assert task_ids(loaded) == task_ids(second.result())
    finally:
        if roadmap_id is not None:
            async with _test_session_factory() as db:
                await db.execute(delete(Roadmap).where(Roadmap.id == roadmap_id))
                await db.commit()
