"""RF-302 — task planning-field PATCH endpoint and snapshot helper tests."""

from __future__ import annotations

from copy import deepcopy

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import api.services.roadmap_task_service as task_service
from api.models.roadmap import ActivityLog, Roadmap, RoadmapVersion
from api.schemas.roadmap import PatchTaskRequest
from api.services.roadmap_helpers import _patch_task_fields_in_snapshot
from api.services.roadmap_projection_service import (
    serialize_projection_to_snapshot,
    validate_projection_parity,
)
from tests.helpers_projection import PHASES_WITH_TASKS, auth, create_with_phases


def _snapshot() -> dict:
    phases = deepcopy(PHASES_WITH_TASKS)
    phases[0]["tasks"][0]["deps"] = ["tk_b1"]
    phases[0]["tasks"][0]["claimedBy"] = "Alice"
    phases[0]["tasks"][0]["claimedById"] = "pt_alice"
    phases[0]["tasks"][0]["claimedAt"] = "2026-07-04T10:00:00+00:00"
    return {"phases": phases, "portableExtension": {"kept": True}}


def _updates(**values) -> dict:
    payload = PatchTaskRequest(
        last_updated_at="2026-07-04T10:00:00Z",
        **values,
    )
    return payload.model_dump(exclude={"last_updated_at"}, exclude_unset=True)


def _patched_task(result) -> dict:
    assert result is not None
    return result.snapshot_json["phases"][0]["tasks"][0]


@pytest.mark.parametrize(
    ("updates", "field", "expected"),
    [
        ({"title": "Updated title"}, "title", "Updated title"),
        ({"desc": "Updated description"}, "desc", "Updated description"),
        ({"est": "5d"}, "est", "5d"),
        ({"assignees": ["Carol", "Dan"]}, "assignees", ["Carol", "Dan"]),
        ({"tags": ["backend", "api"]}, "tags", ["backend", "api"]),
    ],
)
def test_snapshot_helper_updates_each_supported_field(updates, field, expected):
    result = _patch_task_fields_in_snapshot(_snapshot(), "tk_a1", _updates(**updates))

    assert result is not None
    assert _patched_task(result)[field] == expected
    assert result.changed_fields == [field]


def test_snapshot_helper_clears_optional_scalar():
    result = _patch_task_fields_in_snapshot(_snapshot(), "tk_a1", _updates(est="  "))

    assert result is not None
    assert "est" not in _patched_task(result)
    assert result.changed_fields == ["est"]


def test_snapshot_helper_applies_multiple_fields_in_stable_order():
    updates = _updates(
        tags=["api"],
        assignees=["Carol"],
        est="3d",
        desc="New description",
        title="New title",
    )

    result = _patch_task_fields_in_snapshot(_snapshot(), "tk_a1", updates)

    assert result is not None
    assert result.changed_fields == ["title", "desc", "est", "assignees", "tags"]
    task = _patched_task(result)
    assert task["title"] == "New title"
    assert task["desc"] == "New description"
    assert task["est"] == "3d"
    assert task["assignees"] == ["Carol"]
    assert task["tags"] == ["api"]


def test_snapshot_helper_normalized_noop_returns_original_snapshot():
    snapshot = _snapshot()

    result = _patch_task_fields_in_snapshot(
        snapshot,
        "tk_a1",
        _updates(title="  Alpha task one  ", desc=" First task description "),
    )

    assert result is not None
    assert result.changed_fields == []
    assert result.snapshot_json is snapshot
    assert result.after_task is result.before_task


def test_snapshot_helper_treats_missing_null_and_empty_optional_values_as_equal():
    snapshot = _snapshot()
    task = snapshot["phases"][1]["tasks"][0]
    assert "assignees" not in task and "est" not in task

    result = _patch_task_fields_in_snapshot(
        snapshot,
        "tk_b1",
        _updates(assignees=[], est=None),
    )

    assert result is not None
    assert result.changed_fields == []
    assert result.snapshot_json is snapshot


def test_snapshot_helper_missing_task_returns_none():
    assert (
        _patch_task_fields_in_snapshot(_snapshot(), "missing", _updates(title="New title"))
        is None
    )


def test_snapshot_helper_preserves_unrelated_fields_and_inputs():
    snapshot = _snapshot()
    original = deepcopy(snapshot)

    result = _patch_task_fields_in_snapshot(snapshot, "tk_a1", _updates(title="New title"))

    assert result is not None
    task = _patched_task(result)
    for field in (
        "id",
        "done",
        "next",
        "est",
        "desc",
        "tags",
        "assignees",
        "deps",
        "claimedBy",
        "claimedById",
        "claimedAt",
    ):
        assert task.get(field) == original["phases"][0]["tasks"][0].get(field)
    assert result.snapshot_json["portableExtension"] == {"kept": True}
    assert snapshot == original
    assert result.snapshot_json["phases"][1] is snapshot["phases"][1]


@pytest.mark.parametrize(
    "values",
    [
        {"title": "x" * 161},
        {"desc": "x" * 2_001},
        {"est": "x" * 65},
        {"assignees": ["x"] * 21},
        {"assignees": ["x" * 129]},
        {"tags": ["x"] * 21},
        {"tags": ["x" * 41]},
        {"title": "   "},
        {"title": None},
    ],
)
def test_patch_task_request_validates_existing_task_limits(values):
    with pytest.raises(ValidationError):
        PatchTaskRequest(
            last_updated_at="2026-07-04T10:00:00Z",
            **values,
        )


async def _patch(
    client: AsyncClient,
    roadmap: dict,
    task_id: str = "tk_a1",
    token: str | None = None,
    **fields,
):
    return await client.patch(
        f"/api/roadmaps/{roadmap['id']}/tasks/{task_id}",
        headers=auth(token or roadmap["owner_session_token"]),
        json={"last_updated_at": roadmap["updated_at"], **fields},
    )


async def _rotate_and_join(
    client: AsyncClient,
    roadmap: dict,
    role: str,
    display_name: str,
) -> dict:
    rotate = await client.post(
        f"/api/roadmaps/{roadmap['id']}/share-links/{role}/rotate",
        headers=auth(roadmap["owner_session_token"]),
    )
    assert rotate.status_code == 200, rotate.text
    invite_token = rotate.json()["url"].split("token=")[-1]
    joined = await client.post(
        "/api/roadmaps/join",
        json={"token": invite_token, "display_name": display_name},
    )
    assert joined.status_code == 200, joined.text
    return joined.json()


def _task(response: dict, task_id: str = "tk_a1") -> dict:
    for phase in response["phases"]:
        for task in phase["tasks"]:
            if task["id"] == task_id:
                return task
    raise AssertionError(f"task {task_id} not found")


async def test_owner_can_patch_title_and_preserve_unrelated_fields(client: AsyncClient):
    roadmap = await create_with_phases(client)
    before = deepcopy(_task(roadmap))

    response = await _patch(client, roadmap, title="  Updated title  ")

    assert response.status_code == 200, response.text
    after = _task(response.json())
    assert after["title"] == "Updated title"
    for field in ("done", "next", "est", "desc", "tags", "assignees"):
        assert after.get(field) == before.get(field)


async def test_editor_can_patch_description_and_metadata(client: AsyncClient):
    roadmap = await create_with_phases(client)
    editor = await _rotate_and_join(client, roadmap, "editor", "Editor")

    response = await _patch(
        client,
        roadmap,
        token=editor["session_token"],
        desc="Updated description",
        est="4d",
        assignees=["Editor", "Alice"],
        tags=["backend", "api"],
    )

    assert response.status_code == 200, response.text
    task = _task(response.json())
    assert task["desc"] == "Updated description"
    assert task["est"] == "4d"
    assert task["assignees"] == ["Editor", "Alice"]
    assert task["tags"] == ["backend", "api"]


async def test_viewer_cannot_patch_task(client: AsyncClient):
    roadmap = await create_with_phases(client)
    viewer = await _rotate_and_join(client, roadmap, "viewer", "Viewer")

    response = await _patch(
        client,
        roadmap,
        token=viewer["session_token"],
        title="Forbidden",
    )

    assert response.status_code == 403


async def test_stale_patch_returns_structured_conflict(client: AsyncClient):
    roadmap = await create_with_phases(client)
    first = await _patch(client, roadmap, title="First update")
    assert first.status_code == 200, first.text

    stale = await _patch(client, roadmap, title="Stale update")

    assert stale.status_code == 409
    body = stale.json()
    assert body["code"] == "roadmap_conflict"
    assert body["conflict"]["roadmap_id"] == roadmap["id"]
    assert body["conflict"]["summary"]["phase_ids"] == []
    assert body["conflict"]["summary"]["task_ids"] == []
    assert _task(body["conflict"]["server"])["title"] == "First update"


async def test_missing_task_returns_project_not_found_shape(client: AsyncClient):
    roadmap = await create_with_phases(client)

    response = await _patch(client, roadmap, task_id="missing", title="No task")

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found"}


async def test_timestamp_only_patch_returns_422(client: AsyncClient):
    roadmap = await create_with_phases(client)

    response = await _patch(client, roadmap)

    assert response.status_code == 422


async def test_unknown_patch_field_returns_422(client: AsyncClient):
    roadmap = await create_with_phases(client)

    response = await _patch(client, roadmap, done=True)

    assert response.status_code == 422


async def test_same_value_patch_has_no_write_side_effects(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    roadmap = await create_with_phases(client)
    projection_calls = []
    published_events = []

    async def record_projection(*args, **kwargs):
        projection_calls.append((args, kwargs))

    async def record_publish(event):
        published_events.append(event)

    monkeypatch.setattr(task_service, "sync_roadmap_projection_best_effort", record_projection)
    monkeypatch.setattr(task_service.event_bus, "publish", record_publish)

    response = await _patch(client, roadmap, title="  Alpha task one  ")

    assert response.status_code == 200, response.text
    assert response.json()["updated_at"] == roadmap["updated_at"]
    assert projection_calls == []
    assert published_events == []
    activity_count = await db_session.scalar(
        select(func.count())
        .select_from(ActivityLog)
        .where(
            ActivityLog.roadmap_id == roadmap["id"],
            ActivityLog.action == "task.updated",
        )
    )
    assert activity_count == 0


async def test_task_updated_activity_has_precise_changed_fields(client: AsyncClient):
    roadmap = await create_with_phases(client)

    response = await _patch(
        client,
        roadmap,
        title="Updated title",
        est=None,
        tags=["tag-a", "api"],
    )
    assert response.status_code == 200, response.text

    activity = await client.get(
        f"/api/roadmaps/{roadmap['id']}/activity",
        headers=auth(roadmap["owner_session_token"]),
    )
    assert activity.status_code == 200, activity.text
    updated = [log for log in activity.json()["logs"] if log["action"] == "task.updated"]
    assert len(updated) == 1
    log = updated[0]
    assert log["before_json"] == {
        "title": "Alpha task one",
        "est": "2d",
        "tags": ["tag-a", "tag-b"],
    }
    assert log["after_json"] == {
        "title": "Updated title",
        "est": None,
        "tags": ["tag-a", "api"],
    }
    assert log["metadata_json"] == {
        "taskId": "tk_a1",
        "taskTitle": "Updated title",
        "phaseId": "ph_a",
        "phaseName": "Alpha",
        "changedFields": ["title", "est", "tags"],
    }


async def test_projection_matches_scalar_tags_and_assignees_after_patch(
    client: AsyncClient,
    db_session: AsyncSession,
):
    roadmap = await create_with_phases(client)

    response = await _patch(
        client,
        roadmap,
        title="Projected title",
        desc="Projected description",
        est="8h",
        tags=["api"],
        assignees=["Carol", "Dan"],
    )
    assert response.status_code == 200, response.text

    model = await db_session.get(Roadmap, roadmap["id"])
    assert model is not None
    parity = await validate_projection_parity(db_session, model)
    assert parity.ok is True
    projection = await serialize_projection_to_snapshot(db_session, roadmap["id"])
    projected = _task(projection)
    assert projected["title"] == "Projected title"
    assert projected["desc"] == "Projected description"
    assert projected["est"] == "8h"
    assert projected["tags"] == ["api"]
    assert projected["assignees"] == ["Carol", "Dan"]


async def test_successful_patch_publishes_changed_fields(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    roadmap = await create_with_phases(client)
    published_events = []

    async def record_publish(event):
        published_events.append(event)

    monkeypatch.setattr(task_service.event_bus, "publish", record_publish)

    response = await _patch(client, roadmap, desc="Changed")

    assert response.status_code == 200, response.text
    assert len(published_events) == 1
    event = published_events[0]
    assert event.action == "roadmap.updated"
    assert event.payload["action"] == "task.updated"
    assert event.payload["changed_fields"] == ["desc"]


async def test_routine_task_patch_does_not_create_version(
    client: AsyncClient,
    db_session: AsyncSession,
):
    roadmap = await create_with_phases(client)
    before = await db_session.scalar(
        select(func.count())
        .select_from(RoadmapVersion)
        .where(RoadmapVersion.roadmap_id == roadmap["id"])
    )

    response = await _patch(client, roadmap, title="No checkpoint")

    assert response.status_code == 200, response.text
    after = await db_session.scalar(
        select(func.count())
        .select_from(RoadmapVersion)
        .where(RoadmapVersion.roadmap_id == roadmap["id"])
    )
    assert after == before
