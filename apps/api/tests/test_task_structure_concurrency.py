"""Real PostgreSQL concurrency tests for task structure writes."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

import api.routers.roadmap_task_structure as task_structure_router
from api.database import get_db
from api.main import create_app
from api.models.roadmap import Roadmap
from api.services.rate_limit_service import MemoryRateLimiter
from tests.conftest import _test_session_factory
from tests.helpers_projection import PHASES_WITH_TASKS, auth

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
    monkeypatch.setattr(task_structure_router, "rate_limiter", MemoryRateLimiter())
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
    monkeypatch.setattr(task_structure_router, "rate_limiter", MemoryRateLimiter())
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
