"""Focused agent/client API contracts stay bounded and preserve browser behavior."""

from __future__ import annotations

import json

import pytest
from httpx import AsyncClient

from tests.helpers_projection import PHASES_WITH_TASKS, auth, create_with_phases

pytestmark = pytest.mark.asyncio


async def _join_role(client: AsyncClient, body: dict, role: str) -> dict:
    rotated = await client.post(
        f"/api/roadmaps/{body['id']}/share-links/{role}/rotate",
        headers=auth(body["owner_session_token"]),
    )
    assert rotated.status_code == 200, rotated.text
    token = rotated.json()["url"].split("token=")[-1]
    joined = await client.post(
        "/api/roadmaps/join",
        json={"token": token, "display_name": role.title()},
    )
    assert joined.status_code == 200, joined.text
    return joined.json()


async def test_summary_and_revision_are_small_typed_authenticated_reads(client: AsyncClient):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])

    summary = await client.get(f"/api/roadmaps/{body['id']}/summary", headers=headers)
    revision = await client.get(f"/api/roadmaps/{body['id']}/revision", headers=headers)

    assert summary.status_code == 200, summary.text
    payload = summary.json()
    assert payload["roadmap_id"] == body["id"]
    assert payload["name"] == "Projection Test"
    assert payload["updated_at"] == body["updated_at"]
    assert payload["phase_count"] == 2
    assert payload["total_task_count"] == 3
    assert payload["completed_task_count"] == 1
    assert payload["open_task_count"] == 2
    assert payload["phases"][0]["id"] == "ph_a"
    assert payload["phases"][0]["task_count"] == 2
    assert payload["next_tasks"] == [
        {
            "id": "tk_a1",
            "title": "Alpha task one",
            "phase_id": "ph_a",
            "phase_name": "Alpha",
        }
    ]
    assert "tasks" not in payload["phases"][0]
    assert "owner_display_name" not in payload
    assert "tag_registry" not in payload

    assert revision.status_code == 200, revision.text
    assert revision.json() == {
        "roadmap_id": body["id"],
        "updated_at": body["updated_at"],
    }
    assert len(revision.content) < 256

    anonymous = await client.get(f"/api/roadmaps/{body['id']}/summary")
    assert anonymous.status_code == 401


async def test_task_search_is_server_side_bounded_and_covers_current_mcp_fields(
    client: AsyncClient,
):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])
    base = f"/api/roadmaps/{body['id']}/tasks/search"

    by_description = await client.get(base, headers=headers, params={"query": "First task"})
    by_phase = await client.get(base, headers=headers, params={"query": "Beta"})
    by_tag = await client.get(base, headers=headers, params={"query": "tag-c"})
    by_assignee = await client.get(base, headers=headers, params={"query": "Alice"})
    completed_default = await client.get(base, headers=headers, params={"query": "tk_a2"})
    completed_included = await client.get(
        base,
        headers=headers,
        params={"query": "tk_a2", "include_completed": True},
    )
    limited = await client.get(
        base,
        headers=headers,
        params={"query": "task", "include_completed": True, "limit": 1},
    )

    assert by_description.json()["results"][0]["task"]["id"] == "tk_a1"
    assert by_phase.json()["results"][0]["task"]["id"] == "tk_b1"
    assert by_tag.json()["results"][0]["task"]["id"] == "tk_b1"
    assert by_assignee.json()["results"][0]["task"]["id"] == "tk_a1"
    assert completed_default.json()["returned_task_count"] == 0
    assert completed_included.json()["results"][0]["task"]["id"] == "tk_a2"
    assert "desc" not in by_description.json()["results"][0]["task"]
    assert limited.json()["matching_task_count"] == 3
    assert limited.json()["returned_task_count"] == 1
    assert limited.json()["omitted_task_count"] == 2
    assert limited.json()["truncated"] is True
    assert len(limited.content) < 20_000

    too_large = await client.get(base, headers=headers, params={"query": "task", "limit": 101})
    assert too_large.status_code == 422


async def test_one_task_lookup_returns_only_one_full_task_and_phase_context(client: AsyncClient):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])

    response = await client.get(
        f"/api/roadmaps/{body['id']}/tasks/tk_a1",
        headers=headers,
    )
    missing = await client.get(
        f"/api/roadmaps/{body['id']}/tasks/missing",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["roadmap_id"] == body["id"]
    assert payload["phase"] == {
        "id": "ph_a",
        "num": "1",
        "name": "Alpha",
        "status": "active",
        "progress": 50,
    }
    assert payload["task"]["id"] == "tk_a1"
    assert payload["task"]["desc"] == "First task description"
    assert "tasks" not in payload["phase"]
    assert "phases" not in payload
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Task not found"}


async def test_compact_context_is_bounded_and_descriptions_are_opt_in(client: AsyncClient):
    phases = [dict(phase) for phase in PHASES_WITH_TASKS]
    phases[0] = dict(phases[0])
    phases[0]["tasks"] = [dict(task) for task in phases[0]["tasks"]]
    phases[0]["tasks"][0]["desc"] = "  long   context  " + ("x" * 500)
    created = await client.post(
        "/api/roadmaps",
        json={"name": "Context", "owner_display_name": "Owner", "phases": phases},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    headers = auth(body["owner_session_token"])
    url = f"/api/roadmaps/{body['id']}/context"

    default = await client.get(url, headers=headers, params={"limit": 1})
    described = await client.get(
        url,
        headers=headers,
        params={"task_id": "tk_a1", "include_descriptions": True},
    )

    assert default.status_code == 200, default.text
    assert default.json()["matching_task_count"] == 3
    assert default.json()["returned_task_count"] == 1
    assert default.json()["omitted_task_count"] == 2
    assert default.json()["truncated"] is True
    assert default.json()["results"][0]["task"]["description_preview"] is None

    preview = described.json()["results"][0]["task"]["description_preview"]
    assert preview.startswith("long context")
    assert preview.endswith("…")
    assert len(preview) <= 240
    assert "phases" not in described.json()

    phase_overflow = [("phase_id", str(index)) for index in range(51)]
    overflow = await client.get(url, headers=headers, params=phase_overflow)
    assert overflow.status_code == 422


async def test_client_task_patch_is_compact_and_browser_route_stays_unchanged(
    client: AsyncClient,
):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])
    compact_url = f"/api/roadmaps/{body['id']}/client/tasks/tk_a1"
    browser_url = f"/api/roadmaps/{body['id']}/tasks/tk_a1"

    compact = await client.patch(
        compact_url,
        headers=headers,
        json={"title": "Focused title", "last_updated_at": body["updated_at"]},
    )
    assert compact.status_code == 200, compact.text
    compact_payload = compact.json()
    assert compact_payload["affected_entity_type"] == "task"
    assert compact_payload["affected_entity_id"] == "tk_a1"
    assert compact_payload["task"]["title"] == "Focused title"
    assert compact_payload["phase"]["id"] == "ph_a"
    assert "phases" not in compact_payload
    assert len(compact.content) < 5_000

    browser = await client.patch(
        browser_url,
        headers=headers,
        json={"est": "3d", "last_updated_at": compact_payload["updated_at"]},
    )
    assert browser.status_code == 200, browser.text
    assert browser.json()["phases"][0]["tasks"][0]["est"] == "3d"
    assert "affected_entity_type" not in browser.json()

    conflict = await client.patch(
        compact_url,
        headers=headers,
        json={"title": "Stale", "last_updated_at": body["updated_at"]},
    )
    assert conflict.status_code == 409, conflict.text
    conflict_payload = conflict.json()
    assert conflict_payload["code"] == "roadmap_conflict"
    assert conflict_payload["conflict"]["roadmap_id"] == body["id"]
    assert conflict_payload["conflict"]["server_updated_at"] == browser.json()["updated_at"]
    assert conflict_payload["conflict"]["client_last_updated_at"] == body["updated_at"]
    assert "summary" in conflict_payload["conflict"]
    assert "server" not in conflict_payload["conflict"]


async def test_client_openapi_contract_is_unambiguous_and_typed(client: AsyncClient):
    document = (await client.get("/openapi.json")).json()
    paths = document["paths"]

    browser = paths["/api/roadmaps/{roadmap_id}/tasks/{task_id}"]["patch"]
    browser_schema = browser["responses"]["200"]["content"]["application/json"]["schema"]
    assert browser_schema["$ref"].endswith("/RoadmapResponse")

    focused = paths["/api/roadmaps/{roadmap_id}/client/tasks/{task_id}"]["patch"]
    focused_success = focused["responses"]["200"]["content"]["application/json"]["schema"]
    focused_conflict = focused["responses"]["409"]["content"]["application/json"]["schema"]
    assert focused_success["$ref"].endswith("/CompactMutationResponse")
    assert focused_conflict["$ref"].endswith("/CompactRoadmapConflictResponse")


async def test_client_structure_mutations_cover_daily_agent_operations(client: AsyncClient):
    body = await create_with_phases(client)
    headers = auth(body["owner_session_token"])
    root = f"/api/roadmaps/{body['id']}/client"

    created_task = await client.post(
        f"{root}/phases/ph_b/tasks",
        headers=headers,
        json={"id": "tk_new", "title": "Created by agent"},
    )
    assert created_task.status_code == 201, created_task.text
    assert created_task.json()["task"]["id"] == "tk_new"
    assert "phases" not in created_task.json()

    linked = await client.put(
        f"{root}/tasks/tk_new/dependencies/tk_a1",
        headers=headers,
    )
    assert linked.status_code == 200, linked.text
    assert linked.json()["dependency_id"] == "tk_a1"
    assert linked.json()["task"]["deps"] == ["tk_a1"]

    unlinked = await client.delete(
        f"{root}/tasks/tk_new/dependencies/tk_a1",
        headers=headers,
    )
    assert unlinked.status_code == 200, unlinked.text
    assert unlinked.json()["removed"] is True
    assert unlinked.json()["task"]["deps"] == []

    phase = await client.post(
        f"{root}/phases",
        headers=headers,
        json={"id": "ph_new", "name": "Agent phase", "color": "purple"},
    )
    assert phase.status_code == 201, phase.text
    assert phase.json()["phase"]["id"] == "ph_new"

    phase_updated = await client.patch(
        f"{root}/phases/ph_new",
        headers=headers,
        json={"name": "Renamed phase"},
    )
    assert phase_updated.status_code == 200, phase_updated.text
    assert phase_updated.json()["phase"]["name"] == "Renamed phase"

    renamed = await client.patch(
        f"{root}/name",
        headers=headers,
        json={"name": "Agent roadmap"},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["affected_entity_type"] == "roadmap"
    assert "phases" not in renamed.json()

    tag = await client.post(
        f"{root}/tags",
        headers=headers,
        json={
            "id": "agent-tag",
            "label": "Agent Tag",
            "last_updated_at": renamed.json()["updated_at"],
        },
    )
    assert tag.status_code == 201, tag.text
    assert tag.json()["tag"]["id"] == "agent-tag"

    deleted_task = await client.delete(f"{root}/tasks/tk_new", headers=headers)
    assert deleted_task.status_code == 200, deleted_task.text
    assert deleted_task.json()["affected_entity_id"] == "tk_new"
    assert deleted_task.json()["removed"] is True

    deleted_phase = await client.delete(f"{root}/phases/ph_new", headers=headers)
    assert deleted_phase.status_code == 200, deleted_phase.text
    assert deleted_phase.json()["affected_entity_id"] == "ph_new"
    assert deleted_phase.json()["removed"] is True


async def test_focused_permissions_allow_viewer_reads_but_require_editor_for_writes(
    client: AsyncClient,
):
    body = await create_with_phases(client)
    viewer = await _join_role(client, body, "viewer")
    editor = await _join_role(client, body, "editor")

    viewer_headers = auth(viewer["session_token"])
    summary = await client.get(f"/api/roadmaps/{body['id']}/summary", headers=viewer_headers)
    search = await client.get(
        f"/api/roadmaps/{body['id']}/tasks/search",
        headers=viewer_headers,
        params={"query": "Alpha"},
    )
    forbidden = await client.patch(
        f"/api/roadmaps/{body['id']}/client/tasks/tk_a1",
        headers=viewer_headers,
        json={"title": "Forbidden", "last_updated_at": summary.json()["updated_at"]},
    )

    assert summary.status_code == 200
    assert search.status_code == 200
    assert forbidden.status_code == 403

    editor_summary = await client.get(
        f"/api/roadmaps/{body['id']}/summary",
        headers=auth(editor["session_token"]),
    )
    allowed = await client.patch(
        f"/api/roadmaps/{body['id']}/client/tasks/tk_a1",
        headers=auth(editor["session_token"]),
        json={
            "title": "Editor update",
            "last_updated_at": editor_summary.json()["updated_at"],
        },
    )
    assert allowed.status_code == 200, allowed.text


def test_compact_example_serializes_well_under_target():
    sample = {
        "roadmap_id": "rm_test",
        "updated_at": "2026-09-01T10:00:00Z",
        "affected_entity_type": "task",
        "affected_entity_id": "tk_test",
        "task": {"id": "tk_test", "title": "Task", "done": False},
    }
    assert len(json.dumps(sample).encode()) < 5_000
