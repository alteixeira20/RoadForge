"""
RF-1904 — Roadmap version checkpoint / list / detail tests.
RF-1905 — Roadmap version restore tests.

Groups:
  A  Checkpoint creation
  B  Version list
  C  Version detail
  D  Non-owner access denied (covers both 1904 and 1905)
  E  Restore
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _viewer_token_from_body(body: dict) -> str:
    """Extract the raw viewer invite token from a CreateRoadmapResponse body."""
    viewer_link = next(sl for sl in body["share_links"] if sl["role"] == "viewer")
    return viewer_link["url"].split("token=")[-1]


async def _join_as_viewer(client: AsyncClient, body: dict) -> str:
    """Join the roadmap as a viewer; return the viewer session token."""
    raw_token = _viewer_token_from_body(body)
    resp = await client.post(
        "/api/roadmaps/join",
        json={"token": raw_token, "display_name": "Viewer"},
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


# ─── Group D — Non-owner access denied (RF-1904 + RF-1905) ───────────────────


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

    updated = await _update_name(
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
