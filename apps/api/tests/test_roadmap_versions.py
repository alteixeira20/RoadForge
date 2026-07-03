"""
RF-1904 — Roadmap version checkpoint / list / detail tests.
RF-1905 — Roadmap version restore tests.

Groups:
  A  Checkpoint creation
  B  Version list
  C  Version detail
  D  Viewer access denied (covers both 1904 and 1905)
  E  Restore
  F  Version trim boundary (PS-008)
  G  Restore design contract — no stale check (PS-010)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import Participant, Roadmap, RoadmapVersion
from api.services.id_service import generate_id
from api.services.roadmap_service import _MAX_ROADMAP_VERSIONS, _trim_old_versions
from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _viewer_token_from_body(body: dict) -> str:
    """Extract the raw viewer invite token from a CreateRoadmapResponse body."""
    viewer_link = next(sl for sl in body["share_links"] if sl["role"] == "viewer")
    return viewer_link["url"].split("token=")[-1]


def _editor_token_from_body(body: dict) -> str:
    """Extract the raw editor invite token from a CreateRoadmapResponse body."""
    editor_link = next(sl for sl in body["share_links"] if sl["role"] == "editor")
    return editor_link["url"].split("token=")[-1]


async def _join_as_viewer(client: AsyncClient, body: dict) -> str:
    """Join the roadmap as a viewer; return the viewer session token."""
    raw_token = _viewer_token_from_body(body)
    resp = await client.post(
        "/api/roadmaps/join",
        json={"token": raw_token, "display_name": "Viewer"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["session_token"]


async def _join_as_editor(client: AsyncClient, body: dict) -> str:
    """Join the roadmap as an editor; return the editor session token."""
    resp = await client.post(
        "/api/roadmaps/join",
        json={"token": _editor_token_from_body(body), "display_name": "Editor"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["session_token"]


async def _update_name(
    client: AsyncClient, roadmap_id: str, owner_token: str, name: str, updated_at: str
) -> dict:
    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": name, "last_updated_at": updated_at},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _post_checkpoint(client: AsyncClient, roadmap_id: str, owner_token: str) -> dict:
    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/versions/checkpoint",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _list_versions(client: AsyncClient, roadmap_id: str, owner_token: str) -> list:
    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/versions",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ─── Group A — Checkpoint creation (RF-1904) ─────────────────────────────────


async def test_owner_can_create_manual_checkpoint(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    # Mutate name so state differs from the initial "roadmap.created" version
    await _update_name(client, roadmap_id, owner_token, "After Update", body["updated_at"])

    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/versions/checkpoint",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["created"] is True
    version = data["version"]
    assert version["action"] == "roadmap.checkpoint"
    assert "id" in version
    assert "version_number" in version
    assert "created_at" in version
    assert "phase_count" in version
    assert "task_count" in version


async def test_editor_can_create_replacement_checkpoint(client: AsyncClient):
    body = await create_roadmap(client)
    editor_token = await _join_as_editor(client, body)

    resp = await client.post(
        f"/api/roadmaps/{body['id']}/versions/checkpoint",
        headers=_auth(editor_token),
    )

    assert resp.status_code == 200
    assert "version" in resp.json()


async def test_checkpoint_is_idempotent_when_state_unchanged(client: AsyncClient):
    # A freshly created roadmap already has a matching version (roadmap.created),
    # so the checkpoint call should return created=False and reflect the existing entry.
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    data = await _post_checkpoint(client, roadmap_id, owner_token)

    assert data["created"] is False
    version = data["version"]
    assert "id" in version
    assert "version_number" in version
    assert isinstance(version["phase_count"], int)
    assert isinstance(version["task_count"], int)


# ─── Group B — Version list (RF-1904) ────────────────────────────────────────


async def test_owner_can_list_versions(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    versions = await _list_versions(client, roadmap_id, owner_token)

    assert isinstance(versions, list)
    assert len(versions) >= 1
    v = versions[0]
    assert "id" in v
    assert "version_number" in v
    assert "created_at" in v
    assert "action" in v
    assert "phase_count" in v
    assert "task_count" in v


async def test_editor_can_list_versions(client: AsyncClient):
    body = await create_roadmap(client)
    editor_token = await _join_as_editor(client, body)

    versions = await _list_versions(client, body["id"], editor_token)

    assert len(versions) >= 1
    assert versions[0]["action"] == "roadmap.created"


async def test_version_list_includes_manual_checkpoint(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    await _update_name(client, roadmap_id, owner_token, "Checkpoint State", body["updated_at"])
    cp_data = await _post_checkpoint(client, roadmap_id, owner_token)
    cp_id = cp_data["version"]["id"]

    versions = await _list_versions(client, roadmap_id, owner_token)
    ids = [v["id"] for v in versions]
    assert cp_id in ids


async def test_version_list_ordered_descending_by_version_number(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    await _update_name(client, roadmap_id, owner_token, "v2 State", body["updated_at"])
    await _post_checkpoint(client, roadmap_id, owner_token)

    versions = await _list_versions(client, roadmap_id, owner_token)
    numbers = [v["version_number"] for v in versions]
    assert numbers == sorted(numbers, reverse=True)


# ─── Group C — Version detail (RF-1904) ──────────────────────────────────────


async def test_owner_can_fetch_version_detail(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    versions = await _list_versions(client, roadmap_id, owner_token)
    v1_id = versions[0]["id"]

    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/versions/{v1_id}",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200
    detail = resp.json()

    assert detail["id"] == v1_id
    assert "version_number" in detail
    assert "roadmap_name" in detail
    assert isinstance(detail["phases"], list)
    assert "created_at" in detail
    assert "action" in detail
    assert "phase_count" in detail
    assert "task_count" in detail


async def test_editor_can_fetch_version_detail(client: AsyncClient):
    body = await create_roadmap(client)
    editor_token = await _join_as_editor(client, body)
    versions = await _list_versions(client, body["id"], editor_token)

    resp = await client.get(
        f"/api/roadmaps/{body['id']}/versions/{versions[0]['id']}",
        headers=_auth(editor_token),
    )

    assert resp.status_code == 200
    assert resp.json()["roadmap_name"] == body["name"]


async def test_version_detail_snapshot_matches_creation_state(client: AsyncClient):
    body = await create_roadmap(client, name="Snapshot Test")
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    versions = await _list_versions(client, roadmap_id, owner_token)
    v1_id = versions[0]["id"]

    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/versions/{v1_id}",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200
    detail = resp.json()

    assert detail["roadmap_name"] == "Snapshot Test"
    assert isinstance(detail["phases"], list)
    # Created with no phases → snapshot must reflect that
    assert detail["phase_count"] == 0
    assert detail["task_count"] == 0


async def test_version_detail_returns_404_for_unknown_version(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/versions/rv_nonexistent",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 404


# ─── Group D — Viewer access denied (RF-1904 + RF-1905) ──────────────────────


async def test_viewer_cannot_checkpoint(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    viewer_token = await _join_as_viewer(client, body)

    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/versions/checkpoint",
        headers=_auth(viewer_token),
    )
    assert resp.status_code == 403


async def test_viewer_cannot_list_versions(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    viewer_token = await _join_as_viewer(client, body)

    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/versions",
        headers=_auth(viewer_token),
    )
    assert resp.status_code == 403


async def test_viewer_cannot_fetch_version_detail(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    versions = await _list_versions(client, roadmap_id, owner_token)
    v1_id = versions[0]["id"]

    viewer_token = await _join_as_viewer(client, body)

    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/versions/{v1_id}",
        headers=_auth(viewer_token),
    )
    assert resp.status_code == 403


async def test_viewer_cannot_restore(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    versions = await _list_versions(client, roadmap_id, owner_token)
    v1_id = versions[0]["id"]

    viewer_token = await _join_as_viewer(client, body)

    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/versions/{v1_id}/restore",
        headers=_auth(viewer_token),
    )
    assert resp.status_code == 403


async def test_editor_cannot_restore(client: AsyncClient):
    body = await create_roadmap(client)
    owner_token = body["owner_session_token"]
    versions = await _list_versions(client, body["id"], owner_token)
    editor_token = await _join_as_editor(client, body)

    resp = await client.post(
        f"/api/roadmaps/{body['id']}/versions/{versions[0]['id']}/restore",
        headers=_auth(editor_token),
    )

    assert resp.status_code == 403


async def test_revoked_editor_cannot_list_versions(client: AsyncClient):
    body = await create_roadmap(client)
    owner_token = body["owner_session_token"]
    editor_token = await _join_as_editor(client, body)
    participants_resp = await client.get(
        f"/api/roadmaps/{body['id']}/participants",
        headers=_auth(owner_token),
    )
    editor = next(
        participant
        for participant in participants_resp.json()
        if participant["display_name"] == "Editor"
    )
    revoke_resp = await client.post(
        f"/api/roadmaps/{body['id']}/participants/{editor['id']}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    resp = await client.get(
        f"/api/roadmaps/{body['id']}/versions",
        headers=_auth(editor_token),
    )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Session revoked"


async def test_expired_editor_cannot_list_versions(
    client: AsyncClient,
    db_session: AsyncSession,
):
    body = await create_roadmap(client)
    editor_token = await _join_as_editor(client, body)
    result = await db_session.execute(
        select(Participant).where(
            Participant.roadmap_id == body["id"],
            Participant.display_name == "Editor",
        )
    )
    editor = result.scalar_one()
    editor.session_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()

    resp = await client.get(
        f"/api/roadmaps/{body['id']}/versions",
        headers=_auth(editor_token),
    )

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Session expired"


# ─── Group E — Restore (RF-1905) ─────────────────────────────────────────────


async def test_owner_can_restore_older_version(client: AsyncClient):
    body = await create_roadmap(client, name="Original Name")
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    # v1 is the "roadmap.created" version with name "Original Name"
    versions = await _list_versions(client, roadmap_id, owner_token)
    v1_id = versions[0]["id"]

    # Update name (no new version created — roadmap.updated is not version-worthy)
    await _update_name(client, roadmap_id, owner_token, "Modified Name", body["updated_at"])

    # Restore to v1
    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/versions/{v1_id}/restore",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200
    restored = resp.json()
    assert restored["name"] == "Original Name"


async def test_restore_persists_state_on_subsequent_get(client: AsyncClient):
    body = await create_roadmap(client, name="Persist Test")
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    versions = await _list_versions(client, roadmap_id, owner_token)
    v1_id = versions[0]["id"]

    await _update_name(
        client, roadmap_id, owner_token, "Before Restore", body["updated_at"]
    )

    await client.post(
        f"/api/roadmaps/{roadmap_id}/versions/{v1_id}/restore",
        headers=_auth(owner_token),
    )

    get_resp = await client.get(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Persist Test"


async def test_restore_creates_version_entry_with_restored_action(client: AsyncClient):
    body = await create_roadmap(client, name="Version Entry Test")
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    versions_before = await _list_versions(client, roadmap_id, owner_token)
    v1_id = versions_before[0]["id"]

    await _update_name(client, roadmap_id, owner_token, "Before Restore", body["updated_at"])

    await client.post(
        f"/api/roadmaps/{roadmap_id}/versions/{v1_id}/restore",
        headers=_auth(owner_token),
    )

    versions_after = await _list_versions(client, roadmap_id, owner_token)
    assert len(versions_after) > len(versions_before)
    actions = [v["action"] for v in versions_after]
    assert "roadmap.restored" in actions


async def test_restore_nonexistent_version_returns_404(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/versions/rv_nonexistent/restore",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 404


async def test_import_replace_has_distinct_activity_and_version(client: AsyncClient):
    body = await create_roadmap(client)
    owner_token = body["owner_session_token"]

    update_resp = await client.put(
        f"/api/roadmaps/{body['id']}",
        headers=_auth(owner_token),
        json={
            "name": "Imported Replacement",
            "last_updated_at": body["updated_at"],
            "change_summary": {
                "action": "import.replaced",
                "entity_type": "roadmap",
                "phase_count": 0,
                "task_count": 0,
            },
        },
    )
    assert update_resp.status_code == 200, update_resp.text

    versions = await _list_versions(client, body["id"], owner_token)
    assert versions[0]["action"] == "import.replaced"

    activity_resp = await client.get(
        f"/api/roadmaps/{body['id']}/activity",
        headers=_auth(owner_token),
    )
    assert activity_resp.status_code == 200
    actions = [log["action"] for log in activity_resp.json()["logs"]]
    assert "import.replaced" in actions


# ─── Group F — Version trim boundary (PS-008) ────────────────────────────────


async def test_version_trim_removes_oldest_beyond_cap(db_session: AsyncSession):
    """_trim_old_versions keeps the newest _MAX_ROADMAP_VERSIONS and deletes older ones."""
    roadmap = Roadmap(
        id=generate_id("rm_"),
        name="Trim Boundary",
        owner_display_name="Owner",
        snapshot_json={"phases": []},
        schema_version="1.0",
        is_password_enabled=False,
    )
    db_session.add(roadmap)
    await db_session.flush()

    over_cap = _MAX_ROADMAP_VERSIONS + 1
    for i in range(1, over_cap + 1):
        db_session.add(RoadmapVersion(
            id=generate_id("rv_"),
            roadmap_id=roadmap.id,
            version_number=i,
            roadmap_name="Trim Boundary",
            snapshot_json={"phases": [], "v": i},
            action="roadmap.checkpoint",
        ))
    await db_session.flush()

    await _trim_old_versions(db_session, roadmap.id)

    count_result = await db_session.execute(
        select(func.count()).where(RoadmapVersion.roadmap_id == roadmap.id)
    )
    assert count_result.scalar_one() == _MAX_ROADMAP_VERSIONS

    # Version 1 (oldest) must be gone; the newest version must survive.
    min_result = await db_session.execute(
        select(func.min(RoadmapVersion.version_number)).where(
            RoadmapVersion.roadmap_id == roadmap.id
        )
    )
    max_result = await db_session.execute(
        select(func.max(RoadmapVersion.version_number)).where(
            RoadmapVersion.roadmap_id == roadmap.id
        )
    )
    assert min_result.scalar_one() == 2  # oldest (version_number=1) was trimmed
    assert max_result.scalar_one() == over_cap


# ─── Group G — Restore design contract — no stale check (PS-010) ─────────────


async def test_restore_does_not_require_last_updated_at(client: AsyncClient):
    """Restore is owner-authoritative and intentionally has no stale-check.

    The restore endpoint accepts no request body — there is no last_updated_at
    field.  This is by design: restore is a destructive owner action, not a
    concurrent save.  It must succeed even when the roadmap has been updated
    since the version was created.
    """
    body = await create_roadmap(client, name="Restore Contract Test")
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    versions = await _list_versions(client, roadmap_id, owner_token)
    v1_id = versions[0]["id"]

    # Advance roadmap state so v1 is now "stale" relative to the current snapshot.
    await _update_name(client, roadmap_id, owner_token, "Updated Name", body["updated_at"])

    # Restore to v1 — no body, no last_updated_at.  Must return 200.
    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/versions/{v1_id}/restore",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Restore Contract Test"
