"""
RF-877 — PATCH /api/roadmaps/{roadmap_id}/tasks/{task_id}/done tests.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import Roadmap
from api.services.roadmap_projection_service import validate_projection_parity
from tests.helpers_projection import auth, create_with_phases

pytestmark = pytest.mark.asyncio


async def _patch_done(
    client: AsyncClient,
    roadmap_id: str,
    token: str,
    task_id: str,
    done: bool,
    updated_at: str,
):
    return await client.patch(
        f"/api/roadmaps/{roadmap_id}/tasks/{task_id}/done",
        headers=auth(token),
        json={"done": done, "last_updated_at": updated_at},
    )


async def _share_links(client: AsyncClient, roadmap_id: str, owner_token: str) -> dict:
    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/share-links",
        headers=auth(owner_token),
    )
    assert resp.status_code == 200, resp.text
    return {link["role"]: link for link in resp.json()}


async def _join(client: AsyncClient, invite_url: str, display_name: str) -> dict:
    token = invite_url.split("token=")[-1]
    resp = await client.post(
        "/api/roadmaps/join",
        json={"token": token, "display_name": display_name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _rotate_link(
    client: AsyncClient,
    roadmap_id: str,
    owner_token: str,
    role: str,
) -> str:
    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/share-links/{role}/rotate",
        headers=auth(owner_token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["url"]


def _task_done(roadmap: dict, task_id: str) -> bool:
    for phase in roadmap["phases"]:
        for task in phase["tasks"]:
            if task["id"] == task_id:
                return task["done"]
    raise AssertionError(f"task {task_id} not found")


async def _task_actions(client: AsyncClient, roadmap_id: str, token: str) -> list[dict]:
    resp = await client.get(f"/api/roadmaps/{roadmap_id}/activity", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return [log for log in resp.json()["logs"] if log["entity_type"] == "task"]


async def test_owner_can_mark_task_done(client: AsyncClient):
    body = await create_with_phases(client)

    resp = await _patch_done(
        client,
        body["id"],
        body["owner_session_token"],
        "tk_a1",
        True,
        body["updated_at"],
    )

    assert resp.status_code == 200, resp.text
    assert _task_done(resp.json(), "tk_a1") is True


async def test_editor_can_mark_task_done(client: AsyncClient):
    body = await create_with_phases(client)
    editor_url = await _rotate_link(client, body["id"], body["owner_session_token"], "editor")
    editor = await _join(client, editor_url, "Editor")

    resp = await _patch_done(
        client,
        body["id"],
        editor["session_token"],
        "tk_a1",
        True,
        body["updated_at"],
    )

    assert resp.status_code == 200, resp.text
    assert _task_done(resp.json(), "tk_a1") is True


async def test_viewer_cannot_patch_task_done(client: AsyncClient):
    body = await create_with_phases(client)
    links = await _share_links(client, body["id"], body["owner_session_token"])
    viewer = await _join(client, links["viewer"]["url"], "Viewer")

    resp = await _patch_done(
        client,
        body["id"],
        viewer["session_token"],
        "tk_a1",
        True,
        body["updated_at"],
    )

    assert resp.status_code == 403


async def test_missing_task_returns_404(client: AsyncClient):
    body = await create_with_phases(client)

    resp = await _patch_done(
        client,
        body["id"],
        body["owner_session_token"],
        "tk_missing",
        True,
        body["updated_at"],
    )

    assert resp.status_code == 404


async def test_stale_task_done_patch_returns_409_and_does_not_mutate(client: AsyncClient):
    body = await create_with_phases(client)
    roadmap_id = body["id"]
    token = body["owner_session_token"]
    original_updated_at = body["updated_at"]

    first = await _patch_done(client, roadmap_id, token, "tk_a1", True, original_updated_at)
    assert first.status_code == 200, first.text

    stale = await _patch_done(client, roadmap_id, token, "tk_a1", False, original_updated_at)
    assert stale.status_code == 409
    assert stale.json()["code"] == "roadmap_conflict"

    get_resp = await client.get(f"/api/roadmaps/{roadmap_id}", headers=auth(token))
    assert get_resp.status_code == 200
    assert _task_done(get_resp.json(), "tk_a1") is True


async def test_successful_patch_creates_completed_activity(client: AsyncClient):
    body = await create_with_phases(client)

    resp = await _patch_done(
        client,
        body["id"],
        body["owner_session_token"],
        "tk_a1",
        True,
        body["updated_at"],
    )
    assert resp.status_code == 200, resp.text

    actions = await _task_actions(client, body["id"], body["owner_session_token"])
    completed = [log for log in actions if log["action"] == "task.completed"]
    assert len(completed) == 1
    assert completed[0]["entity_id"] == "tk_a1"
    assert completed[0]["before_json"] == {"done": False}
    assert completed[0]["after_json"] == {"done": True}
    assert completed[0]["metadata_json"]["phase_id"] == "ph_a"
    assert completed[0]["metadata_json"]["task_title"] == "Alpha task one"


async def test_reopening_task_creates_reopened_activity(client: AsyncClient):
    body = await create_with_phases(client)

    resp = await _patch_done(
        client,
        body["id"],
        body["owner_session_token"],
        "tk_a2",
        False,
        body["updated_at"],
    )
    assert resp.status_code == 200, resp.text

    actions = await _task_actions(client, body["id"], body["owner_session_token"])
    reopened = [log for log in actions if log["action"] == "task.reopened"]
    assert len(reopened) == 1
    assert reopened[0]["entity_id"] == "tk_a2"
    assert reopened[0]["before_json"] == {"done": True}
    assert reopened[0]["after_json"] == {"done": False}


async def test_projection_parity_remains_ok_after_task_done_patch(
    client: AsyncClient,
    db_session: AsyncSession,
):
    body = await create_with_phases(client)

    resp = await _patch_done(
        client,
        body["id"],
        body["owner_session_token"],
        "tk_a1",
        True,
        body["updated_at"],
    )
    assert resp.status_code == 200, resp.text

    roadmap = await db_session.get(Roadmap, body["id"])
    assert roadmap is not None
    parity = await validate_projection_parity(db_session, roadmap)
    assert parity.ok is True
    assert parity.issues == []


async def test_noop_same_done_value_returns_200_without_task_activity(client: AsyncClient):
    body = await create_with_phases(client)

    resp = await _patch_done(
        client,
        body["id"],
        body["owner_session_token"],
        "tk_a1",
        False,
        body["updated_at"],
    )

    assert resp.status_code == 200, resp.text
    assert _task_done(resp.json(), "tk_a1") is False
    assert await _task_actions(client, body["id"], body["owner_session_token"]) == []


async def test_patch_task_done_requires_last_updated_at(client: AsyncClient):
    body = await create_with_phases(client)

    resp = await client.patch(
        f"/api/roadmaps/{body['id']}/tasks/tk_a1/done",
        headers=auth(body["owner_session_token"]),
        json={"done": True},
    )

    assert resp.status_code == 422


async def test_patch_task_done_unauthenticated_returns_401(client: AsyncClient):
    body = await create_with_phases(client)

    resp = await client.patch(
        f"/api/roadmaps/{body['id']}/tasks/tk_a1/done",
        json={"done": True, "last_updated_at": body["updated_at"]},
    )

    assert resp.status_code == 401


async def test_patch_task_done_forbids_extra_fields(client: AsyncClient):
    body = await create_with_phases(client)

    resp = await client.patch(
        f"/api/roadmaps/{body['id']}/tasks/tk_a1/done",
        headers=auth(body["owner_session_token"]),
        json={
            "done": True,
            "last_updated_at": body["updated_at"],
            "title": "Not allowed",
        },
    )

    assert resp.status_code == 422
