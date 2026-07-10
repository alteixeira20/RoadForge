"""
RF-1901 — Roadmap PUT /api/roadmaps/{roadmap_id} tests.

Groups:
  A  Role restrictions on PUT
  B  Validation rejections
  C  Owner update success paths
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _join(client: AsyncClient, invite_url: str, display_name: str = "Member"):
    token = invite_url.split("token=")[-1]
    return await client.post(
        "/api/roadmaps/join",
        json={"token": token, "display_name": display_name},
    )


async def _get_share_links(client: AsyncClient, roadmap_id: str, owner_token: str) -> dict:
    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/share-links",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200, resp.text
    return {link["role"]: link for link in resp.json()}


async def _rotate_link(
    client: AsyncClient, roadmap_id: str, owner_token: str, role: str
) -> str:
    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/share-links/{role}/rotate",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["url"]


# ─── Group A — Role restrictions on PUT ──────────────────────────────────────


async def test_viewer_cannot_put_roadmap(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    links = await _get_share_links(client, roadmap_id, owner_token)
    join_resp = await _join(client, links["viewer"]["url"])
    viewer_token = join_resp.json()["session_token"]

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(viewer_token),
        json={"name": "Hacked", "last_updated_at": body["updated_at"]},
    )
    assert resp.status_code == 403


async def test_editor_can_put_roadmap(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url)
    editor_token = join_resp.json()["session_token"]

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(editor_token),
        json={"name": "Editor Renamed", "last_updated_at": body["updated_at"]},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Editor Renamed"


# ─── Group B — Validation rejections ─────────────────────────────────────────


async def test_put_roadmap_requires_last_updated_at(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "Missing Timestamp"},
    )
    assert resp.status_code == 422


async def test_put_roadmap_rejects_unknown_change_summary_action(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={
            "name": "Unknown Action",
            "last_updated_at": body["updated_at"],
            "change_summary": {"action": "roadmap.pwned"},
        },
    )
    assert resp.status_code == 422


# ─── Group C — Owner update success paths ────────────────────────────────────


async def test_owner_can_update_roadmap_name(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "Renamed Roadmap", "last_updated_at": body["updated_at"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Renamed Roadmap"
    assert "updated_at" in data


async def test_owner_can_update_phases(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    new_phases = [
        {
            "id": "ph-1",
            "num": "1",
            "name": "Phase One",
            "color": "#4f46e5",
            "status": "active",
            "progress": 0,
            "tasks": [
                {"id": "t-1", "title": "First task", "done": False},
            ],
        }
    ]

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"phases": new_phases, "last_updated_at": body["updated_at"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["phases"]) == 1
    assert data["phases"][0]["id"] == "ph-1"
    assert data["phases"][0]["tasks"][0]["title"] == "First task"


async def test_valid_change_summary_action_is_accepted(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={
            "name": "Summary Test",
            "last_updated_at": body["updated_at"],
            "change_summary": {"action": "roadmap.updated"},
        },
    )
    assert resp.status_code == 200

    activity_resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/activity",
        headers=_auth(owner_token),
    )
    assert activity_resp.status_code == 200
    actions = [log["action"] for log in activity_resp.json()["logs"]]
    assert "roadmap.updated" in actions


async def test_owner_can_update_name_and_phases_together(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    new_phases = [
        {
            "id": "ph-2",
            "num": "1",
            "name": "Combined Phase",
            "color": "#10b981",
            "status": "future",
            "progress": 0,
            "tasks": [],
        }
    ]

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={
            "name": "Combined Update",
            "phases": new_phases,
            "last_updated_at": body["updated_at"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Combined Update"
    assert len(data["phases"]) == 1
    assert data["phases"][0]["id"] == "ph-2"


async def test_owner_can_save_task_with_legacy_null_done(client: AsyncClient):
    """Reproduces the reported PUT 422: an imported/legacy roadmap can still
    carry a null `done` on a task. The backend must tolerate it the same way
    apps/web/src/lib/roadmap-upgrade.ts already does (`task.done === true`),
    coercing null to False instead of rejecting the save."""
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    legacy_phases = [
        {
            "id": "ph-1",
            "num": "1",
            "name": "Phase",
            "color": "#4f46e5",
            "status": "active",
            "progress": 0,
            "tasks": [{"id": "t-1", "title": "Task", "done": None}],
        }
    ]

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"phases": legacy_phases, "last_updated_at": body["updated_at"]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["phases"][0]["tasks"][0]["done"] is False


async def test_get_response_can_be_resubmitted_unchanged(client: AsyncClient):
    """Contract test: a roadmap returned by GET (RoadmapResponse) must be
    submittable through PUT (UpdateRoadmapRequest) unchanged, mapping the
    response's `updated_at` into the request's `last_updated_at` the same
    way apps/web/src/services/roadmap-crud.service.ts does."""
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    get_resp = await client.get(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
    )
    assert get_resp.status_code == 200, get_resp.text
    fetched = get_resp.json()

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={
            "name": fetched["name"],
            "phases": fetched["phases"],
            "tag_registry": fetched["tag_registry"],
            "last_updated_at": fetched["updated_at"],
        },
    )
    assert resp.status_code == 200, resp.text
