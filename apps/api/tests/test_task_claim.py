"""
RF-2504 — PATCH/DELETE /api/roadmaps/{roadmap_id}/tasks/{task_id}/claim tests.
"""

from __future__ import annotations

from copy import deepcopy

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import Roadmap
from api.services.roadmap_projection_service import validate_projection_parity
from tests.helpers_projection import PHASES_WITH_TASKS, auth, create_with_phases

pytestmark = pytest.mark.asyncio


async def _claim(
    client: AsyncClient,
    roadmap_id: str,
    token: str,
    task_id: str,
    *,
    override: bool = False,
):
    query = "?override=true" if override else ""
    return await client.patch(
        f"/api/roadmaps/{roadmap_id}/tasks/{task_id}/claim{query}",
        headers=auth(token),
    )


async def _unclaim(
    client: AsyncClient,
    roadmap_id: str,
    token: str,
    task_id: str,
    *,
    override: bool = False,
):
    query = "?override=true" if override else ""
    return await client.delete(
        f"/api/roadmaps/{roadmap_id}/tasks/{task_id}/claim{query}",
        headers=auth(token),
    )


async def _rotate_link(client: AsyncClient, roadmap_id: str, owner_token: str, role: str) -> str:
    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/share-links/{role}/rotate",
        headers=auth(owner_token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["url"]


async def _join(client: AsyncClient, invite_url: str, display_name: str) -> dict:
    token = invite_url.split("token=")[-1]
    resp = await client.post(
        "/api/roadmaps/join",
        json={"token": token, "display_name": display_name},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _task_field(roadmap: dict, task_id: str, field: str):
    for phase in roadmap["phases"]:
        for task in phase["tasks"]:
            if task["id"] == task_id:
                return task.get(field)
    raise AssertionError(f"task {task_id} not found")


async def _share_links(client: AsyncClient, roadmap_id: str, owner_token: str) -> dict:
    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/share-links",
        headers=auth(owner_token),
    )
    assert resp.status_code == 200, resp.text
    return {link["role"]: link for link in resp.json()}


async def test_owner_can_claim_task(client: AsyncClient):
    body = await create_with_phases(client)
    resp = await _claim(client, body["id"], body["owner_session_token"], "tk_a1")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert _task_field(data, "tk_a1", "claimedBy") == "Owner"
    assert _task_field(data, "tk_a1", "claimedAt") is not None
    assert _task_field(data, "tk_a1", "assignees") == ["Alice", "Bob", "Owner"]

    refreshed = await _claim(client, body["id"], body["owner_session_token"], "tk_a1")
    assert refreshed.status_code == 200, refreshed.text
    assert _task_field(refreshed.json(), "tk_a1", "assignees").count("Owner") == 1


async def test_claim_preserves_legacy_assignment_tag_names(client: AsyncClient):
    phases = deepcopy(PHASES_WITH_TASKS)
    task = phases[0]["tasks"][0]
    task.pop("assignees")
    task["tags"] = ["owner:Legacy Assignee", "tag-a"]
    create_resp = await client.post(
        "/api/roadmaps",
        json={
            "name": "Legacy Assignment Test",
            "owner_display_name": "Owner",
            "phases": phases,
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    body = create_resp.json()

    resp = await _claim(client, body["id"], body["owner_session_token"], "tk_a1")

    assert resp.status_code == 200, resp.text
    assert _task_field(resp.json(), "tk_a1", "assignees") == ["Legacy Assignee", "Owner"]


async def test_editor_cannot_replace_existing_claim(client: AsyncClient):
    body = await create_with_phases(client)
    editor_url = await _rotate_link(client, body["id"], body["owner_session_token"], "editor")
    editor = await _join(client, editor_url, "Editor")

    # Owner claims first
    resp = await _claim(client, body["id"], body["owner_session_token"], "tk_a1")
    assert resp.status_code == 200
    assert _task_field(resp.json(), "tk_a1", "claimedBy") == "Owner"

    # Editor cannot silently take over.
    resp = await _claim(client, body["id"], editor["session_token"], "tk_a1")
    assert resp.status_code == 409, resp.text
    assert "Owner" in resp.json()["detail"]


async def test_owner_can_explicitly_override_existing_claim(client: AsyncClient):
    body = await create_with_phases(client)
    editor_url = await _rotate_link(client, body["id"], body["owner_session_token"], "editor")
    editor = await _join(client, editor_url, "Editor")
    await _claim(client, body["id"], editor["session_token"], "tk_a1")

    resp = await _claim(
        client,
        body["id"],
        body["owner_session_token"],
        "tk_a1",
        override=True,
    )

    assert resp.status_code == 200, resp.text
    assert _task_field(resp.json(), "tk_a1", "claimedBy") == "Owner"


async def test_editor_cannot_clear_another_participants_claim(client: AsyncClient):
    body = await create_with_phases(client)
    editor_url = await _rotate_link(client, body["id"], body["owner_session_token"], "editor")
    editor = await _join(client, editor_url, "Editor")
    await _claim(client, body["id"], body["owner_session_token"], "tk_a1")

    resp = await _unclaim(client, body["id"], editor["session_token"], "tk_a1")

    assert resp.status_code == 409, resp.text


async def test_owner_can_explicitly_clear_another_participants_claim(client: AsyncClient):
    body = await create_with_phases(client)
    editor_url = await _rotate_link(client, body["id"], body["owner_session_token"], "editor")
    editor = await _join(client, editor_url, "Editor")
    await _claim(client, body["id"], editor["session_token"], "tk_a1")

    resp = await _unclaim(
        client,
        body["id"],
        body["owner_session_token"],
        "tk_a1",
        override=True,
    )

    assert resp.status_code == 200, resp.text
    assert _task_field(resp.json(), "tk_a1", "claimedBy") is None


async def test_viewer_cannot_claim(client: AsyncClient):
    body = await create_with_phases(client)
    links = await _share_links(client, body["id"], body["owner_session_token"])
    viewer = await _join(client, links["viewer"]["url"], "Viewer")

    resp = await _claim(client, body["id"], viewer["session_token"], "tk_a1")
    assert resp.status_code == 403


async def test_viewer_cannot_unclaim(client: AsyncClient):
    body = await create_with_phases(client)
    links = await _share_links(client, body["id"], body["owner_session_token"])
    viewer = await _join(client, links["viewer"]["url"], "Viewer")

    # Owner claims
    await _claim(client, body["id"], body["owner_session_token"], "tk_a1")

    resp = await _unclaim(client, body["id"], viewer["session_token"], "tk_a1")
    assert resp.status_code == 403


async def test_unauthenticated_cannot_claim(client: AsyncClient):
    body = await create_with_phases(client)
    resp = await client.patch(f"/api/roadmaps/{body['id']}/tasks/tk_a1/claim")
    assert resp.status_code == 401


async def test_claim_missing_task_returns_404(client: AsyncClient):
    body = await create_with_phases(client)
    resp = await _claim(client, body["id"], body["owner_session_token"], "tk_missing")
    assert resp.status_code == 404


async def test_claim_done_task_returns_400(client: AsyncClient):
    body = await create_with_phases(client)
    # tk_a2 is already done in PHASES_WITH_TASKS
    resp = await _claim(client, body["id"], body["owner_session_token"], "tk_a2")
    assert resp.status_code == 400
    assert "completed" in resp.json()["detail"].lower()


async def test_unclaim_clears_claim_fields(client: AsyncClient):
    body = await create_with_phases(client)

    await _claim(client, body["id"], body["owner_session_token"], "tk_a1")

    resp = await _unclaim(client, body["id"], body["owner_session_token"], "tk_a1")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert _task_field(data, "tk_a1", "claimedBy") is None
    assert _task_field(data, "tk_a1", "claimedAt") is None
    assert "Owner" in _task_field(data, "tk_a1", "assignees")


async def test_unclaim_noop_when_not_claimed(client: AsyncClient):
    body = await create_with_phases(client)
    resp = await _unclaim(client, body["id"], body["owner_session_token"], "tk_a1")
    assert resp.status_code == 200


async def test_marking_done_clears_claim(client: AsyncClient):
    body = await create_with_phases(client)

    claim_resp = await _claim(client, body["id"], body["owner_session_token"], "tk_a1")
    assert claim_resp.status_code == 200, claim_resp.text
    updated_at = claim_resp.json()["updated_at"]

    resp = await client.patch(
        f"/api/roadmaps/{body['id']}/tasks/tk_a1/done",
        headers=auth(body["owner_session_token"]),
        json={"done": True, "last_updated_at": updated_at},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert _task_field(data, "tk_a1", "done") is True
    assert _task_field(data, "tk_a1", "claimedBy") is None


async def test_claim_creates_activity_log(client: AsyncClient):
    body = await create_with_phases(client)
    await _claim(client, body["id"], body["owner_session_token"], "tk_a1")

    resp = await client.get(
        f"/api/roadmaps/{body['id']}/activity",
        headers=auth(body["owner_session_token"]),
    )
    assert resp.status_code == 200
    logs = resp.json()["logs"]
    claimed = [log for log in logs if log["action"] == "task.claimed"]
    assert len(claimed) == 1
    assert claimed[0]["entity_id"] == "tk_a1"
    assert claimed[0]["metadata_json"]["claimed_by"] == "Owner"


async def test_unclaim_creates_activity_log(client: AsyncClient):
    body = await create_with_phases(client)
    await _claim(client, body["id"], body["owner_session_token"], "tk_a1")
    await _unclaim(client, body["id"], body["owner_session_token"], "tk_a1")

    resp = await client.get(
        f"/api/roadmaps/{body['id']}/activity",
        headers=auth(body["owner_session_token"]),
    )
    assert resp.status_code == 200
    logs = resp.json()["logs"]
    unclaimed = [log for log in logs if log["action"] == "task.unclaimed"]
    assert len(unclaimed) == 1
    assert unclaimed[0]["metadata_json"]["was_claimed_by"] == "Owner"


async def test_projection_parity_after_claim(client: AsyncClient, db_session: AsyncSession):
    body = await create_with_phases(client)
    await _claim(client, body["id"], body["owner_session_token"], "tk_a1")

    roadmap = await db_session.get(Roadmap, body["id"])
    assert roadmap is not None
    parity = await validate_projection_parity(db_session, roadmap)
    assert parity.ok is True


async def test_projection_parity_after_unclaim(client: AsyncClient, db_session: AsyncSession):
    body = await create_with_phases(client)
    await _claim(client, body["id"], body["owner_session_token"], "tk_a1")
    await _unclaim(client, body["id"], body["owner_session_token"], "tk_a1")

    roadmap = await db_session.get(Roadmap, body["id"])
    assert roadmap is not None
    parity = await validate_projection_parity(db_session, roadmap)
    assert parity.ok is True
