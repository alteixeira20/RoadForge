"""Server-authoritative task structure collaboration tests."""

from __future__ import annotations

import copy

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from api.models.roadmap import ActivityLog, Roadmap
from api.services.projection import validate_projection_parity
from tests.helpers_projection import PHASES_WITH_TASKS, auth, create_with_phases

pytestmark = pytest.mark.asyncio


def _task(phases: list[dict], task_id: str) -> dict:
    return next(
        task
        for phase in phases
        for task in phase["tasks"]
        if task["id"] == task_id
    )


async def test_create_top_level_task_is_server_normalized_and_keeps_projection_parity(
    client: AsyncClient,
    db_session,
):
    body = await create_with_phases(client)

    response = await client.post(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks",
        headers=auth(body["owner_session_token"]),
        json={"id": "tk_new", "title": "  New shared task  "},
    )

    assert response.status_code == 201, response.text
    phases = response.json()["phases"]
    created = _task(phases, "tk_new")
    assert created["id"] == "tk_new"
    assert created["title"] == "New shared task"
    assert created["done"] is False
    assert created["next"] is False
    assert created["est"] == ""
    assert created["complexity"] == "medium"
    assert created["tags"] == []
    assert created["deps"] == []
    assert created["desc"] == ""
    assert created.get("parentId") is None
    roadmap = await db_session.get(Roadmap, body["id"])
    assert roadmap is not None
    parity = await validate_projection_parity(db_session, roadmap)
    assert parity.ok is True
    assert parity.issues == []


async def test_create_subtask_inserts_after_parent_and_uses_subtask_defaults(client: AsyncClient):
    body = await create_with_phases(client)

    response = await client.post(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks",
        headers=auth(body["owner_session_token"]),
        json={"id": "tk_sub_new", "title": "New child", "parentId": "tk_a1"},
    )

    assert response.status_code == 201, response.text
    phase = response.json()["phases"][0]
    ids = [task["id"] for task in phase["tasks"]]
    assert ids.index("tk_sub_new") == ids.index("tk_a1") + 1
    created = _task(response.json()["phases"], "tk_sub_new")
    assert created["parentId"] == "tk_a1"
    assert created["tags"] == ["subtask"]
    assert created["done"] is False


async def test_create_rejects_duplicate_task_id_and_missing_parent_without_mutation(
    client: AsyncClient,
):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])

    duplicate = await client.post(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks",
        headers=headers,
        json={"id": "tk_b1", "title": "Duplicate across phases"},
    )
    missing_parent = await client.post(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks",
        headers=headers,
        json={"id": "tk_new", "title": "Child", "parentId": "missing"},
    )

    assert duplicate.status_code == 409
    assert duplicate.json() == {"detail": "Task ID already exists"}
    assert missing_parent.status_code == 404
    assert missing_parent.json() == {"detail": "Parent task not found in phase"}
    loaded = await client.get(f"/api/roadmaps/{body['id']}", headers=headers)
    assert loaded.status_code == 200
    assert loaded.json()["phases"] == body["phases"]
    assert loaded.json()["updated_at"] == body["updated_at"]


async def test_task_structure_payloads_reject_extra_duplicate_and_empty_shape(
    client: AsyncClient,
):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])

    create_extra = await client.post(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks",
        headers=headers,
        json={"id": "tk_new", "title": "New", "done": True},
    )
    duplicate_order = await client.put(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks/order",
        headers=headers,
        json={"task_ids": ["tk_a1", "tk_a1"]},
    )
    empty_order = await client.put(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks/order",
        headers=headers,
        json={"task_ids": []},
    )

    assert create_extra.status_code == 422
    assert duplicate_order.status_code == 422
    assert empty_order.status_code == 422


async def test_delete_task_removes_descendants_and_external_dependency_edges(
    client: AsyncClient,
    db_session,
):
    phases = copy.deepcopy(PHASES_WITH_TASKS)
    phases[1]["tasks"][0]["deps"] = ["tk_a1", "tk_a2"]
    created = await client.post(
        "/api/roadmaps",
        json={"name": "Delete task subtree", "owner_display_name": "Owner", "phases": phases},
    )
    assert created.status_code == 201, created.text
    body = created.json()

    response = await client.delete(
        f"/api/roadmaps/{body['id']}/tasks/tk_a1",
        headers=auth(body["owner_session_token"]),
    )

    assert response.status_code == 200, response.text
    next_phases = response.json()["phases"]
    remaining_ids = {
        task["id"] for phase in next_phases for task in phase["tasks"]
    }
    assert "tk_a1" not in remaining_ids
    assert "tk_a2" not in remaining_ids
    assert _task(next_phases, "tk_b1").get("deps") == []

    roadmap = await db_session.get(Roadmap, body["id"])
    assert roadmap is not None
    parity = await validate_projection_parity(db_session, roadmap)
    assert parity.ok is True
    assert parity.issues == []


async def test_delete_required_child_of_very_high_parent_is_rejected_atomically(
    client: AsyncClient,
):
    phases = copy.deepcopy(PHASES_WITH_TASKS)
    phases[0]["tasks"][0]["complexity"] = "very_high"
    phases[0]["tasks"].append(
        {
            "id": "tk_a3",
            "title": "Second direct child",
            "done": False,
            "parentId": "tk_a1",
        }
    )
    created = await client.post(
        "/api/roadmaps",
        json={"name": "Very high delete guard", "owner_display_name": "Owner", "phases": phases},
    )
    assert created.status_code == 201, created.text
    body = created.json()

    response = await client.delete(
        f"/api/roadmaps/{body['id']}/tasks/tk_a2",
        headers=auth(body["owner_session_token"]),
    )

    assert response.status_code == 422
    loaded = await client.get(
        f"/api/roadmaps/{body['id']}",
        headers=auth(body["owner_session_token"]),
    )
    assert loaded.status_code == 200
    assert {task["id"] for task in loaded.json()["phases"][0]["tasks"]} >= {
        "tk_a1",
        "tk_a2",
        "tk_a3",
    }
    assert loaded.json()["updated_at"] == body["updated_at"]


async def test_top_level_reorder_preserves_server_only_tasks_and_subtask_blocks(
    client: AsyncClient,
):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])
    created = await client.post(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks",
        headers=headers,
        json={"id": "tk_server", "title": "Server only"},
    )
    assert created.status_code == 201, created.text

    response = await client.put(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks/order",
        headers=headers,
        json={"task_ids": ["tk_server", "tk_a1", "already-deleted-client-task"]},
    )

    assert response.status_code == 200, response.text
    ids = [task["id"] for task in response.json()["phases"][0]["tasks"]]
    assert ids[:3] == ["tk_server", "tk_a1", "tk_a2"]


async def test_subtask_reorder_is_scoped_to_one_parent_and_preserves_server_only_child(
    client: AsyncClient,
):
    phases = copy.deepcopy(PHASES_WITH_TASKS)
    phases[0]["tasks"].append(
        {
            "id": "tk_a3",
            "title": "Second child",
            "done": False,
            "parentId": "tk_a1",
        }
    )
    created = await client.post(
        "/api/roadmaps",
        json={"name": "Subtask reorder", "owner_display_name": "Owner", "phases": phases},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    headers = auth(body["owner_session_token"])
    added = await client.post(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks",
        headers=headers,
        json={"id": "tk_server_child", "title": "Server child", "parentId": "tk_a1"},
    )
    assert added.status_code == 201, added.text

    response = await client.put(
        f"/api/roadmaps/{body['id']}/tasks/tk_a1/subtasks/order",
        headers=headers,
        json={"task_ids": ["tk_a3", "tk_a2"]},
    )

    assert response.status_code == 200, response.text
    tasks = response.json()["phases"][0]["tasks"]
    direct_children = [task["id"] for task in tasks if task.get("parentId") == "tk_a1"]
    assert direct_children == ["tk_a3", "tk_a2", "tk_server_child"]


async def test_reorder_noop_is_revision_and_activity_neutral(client: AsyncClient, db_session):
    body = await create_with_phases(client)

    response = await client.put(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks/order",
        headers=auth(body["owner_session_token"]),
        json={"task_ids": ["tk_a1"]},
    )

    assert response.status_code == 200, response.text
    assert response.json()["updated_at"] == body["updated_at"]
    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.roadmap_id == body["id"],
            ActivityLog.action == "task.reordered",
        )
    )
    assert result.scalars().all() == []


async def test_dependency_link_unlink_are_idempotent_and_cycle_safe(
    client: AsyncClient,
):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])

    linked = await client.put(
        f"/api/roadmaps/{body['id']}/tasks/tk_b1/dependencies/tk_a1",
        headers=headers,
    )
    assert linked.status_code == 200, linked.text
    assert _task(linked.json()["phases"], "tk_b1")["deps"] == ["tk_a1"]

    linked_again = await client.put(
        f"/api/roadmaps/{body['id']}/tasks/tk_b1/dependencies/tk_a1",
        headers=headers,
    )
    assert linked_again.status_code == 200
    assert linked_again.json()["updated_at"] == linked.json()["updated_at"]

    cycle = await client.put(
        f"/api/roadmaps/{body['id']}/tasks/tk_a1/dependencies/tk_b1",
        headers=headers,
    )
    assert cycle.status_code == 422

    unlinked = await client.delete(
        f"/api/roadmaps/{body['id']}/tasks/tk_b1/dependencies/tk_a1",
        headers=headers,
    )
    assert unlinked.status_code == 200, unlinked.text
    assert _task(unlinked.json()["phases"], "tk_b1").get("deps") == []

    unlinked_again = await client.delete(
        f"/api/roadmaps/{body['id']}/tasks/tk_b1/dependencies/tk_a1",
        headers=headers,
    )
    assert unlinked_again.status_code == 200
    assert unlinked_again.json()["updated_at"] == unlinked.json()["updated_at"]


async def test_viewer_cannot_mutate_task_structure(client: AsyncClient):
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
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks",
        headers=headers,
        json={"id": "forbidden", "title": "Forbidden"},
    )
    delete = await client.delete(
        f"/api/roadmaps/{body['id']}/tasks/tk_a2",
        headers=headers,
    )
    reorder = await client.put(
        f"/api/roadmaps/{body['id']}/phases/ph_a/tasks/order",
        headers=headers,
        json={"task_ids": ["tk_a1"]},
    )
    dependency = await client.put(
        f"/api/roadmaps/{body['id']}/tasks/tk_b1/dependencies/tk_a1",
        headers=headers,
    )

    assert create.status_code == 403
    assert delete.status_code == 403
    assert reorder.status_code == 403
    assert dependency.status_code == 403
