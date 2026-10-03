"""
Backend tests for owner password management:
PUT /api/roadmaps/{roadmap_id}/password
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Roadmap
from api.services.event_bus import event_bus
from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _rotate_link(client: AsyncClient, roadmap_id: str, owner_token: str, role: str) -> str:
    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/share-links/{role}/rotate",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["url"]


async def _join(client: AsyncClient, invite_url: str, password: str | None = None, display_name: str = "Member") -> dict:
    token = invite_url.split("token=")[-1]
    payload = {"token": token, "display_name": display_name}
    if password is not None:
        payload["password"] = password
    return await client.post("/api/roadmaps/join", json=payload)


async def test_owner_can_enable_replace_and_disable_password(client: AsyncClient):
    # Create roadmap without password
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]
    assert body["is_password_enabled"] is False

    # 1. Owner enables password
    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}/password",
        headers=_auth(owner_token),
        json={"password": "initial_password_123"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"is_password_enabled": True}

    # Verify GET reflects enabled state
    get_resp = await client.get(f"/api/roadmaps/{roadmap_id}", headers=_auth(owner_token))
    assert get_resp.status_code == 200
    assert get_resp.json()["is_password_enabled"] is True

    # Rotate editor link and test join requires password
    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")

    # Join without password fails
    fail_join = await _join(client, editor_url, password=None, display_name="NoPW")
    assert fail_join.status_code == 401

    # Join with wrong password fails
    fail_join2 = await _join(client, editor_url, password="wrong_password", display_name="WrongPW")
    assert fail_join2.status_code == 401

    # Join with correct password succeeds
    succ_join = await _join(client, editor_url, password="initial_password_123", display_name="CorrectPW")
    assert succ_join.status_code == 200
    editor_token = succ_join.json()["session_token"]

    # 2. Owner changes password
    change_resp = await client.put(
        f"/api/roadmaps/{roadmap_id}/password",
        headers=_auth(owner_token),
        json={"password": "updated_password_456"},
    )
    assert change_resp.status_code == 200
    assert change_resp.json() == {"is_password_enabled": True}

    # New join with old password now fails
    fail_old = await _join(client, editor_url, password="initial_password_123", display_name="OldPW")
    assert fail_old.status_code == 401

    # New join with new password succeeds
    succ_new = await _join(client, editor_url, password="updated_password_456", display_name="NewPW")
    assert succ_new.status_code == 200

    # 3. Existing participant session remains valid after password change
    editor_check = await client.get(f"/api/roadmaps/{roadmap_id}", headers=_auth(editor_token))
    assert editor_check.status_code == 200

    # 4. Owner disables password with null
    disable_resp = await client.put(
        f"/api/roadmaps/{roadmap_id}/password",
        headers=_auth(owner_token),
        json={"password": None},
    )
    assert disable_resp.status_code == 200
    assert disable_resp.json() == {"is_password_enabled": False}

    # Verify GET reflects disabled state
    get_resp2 = await client.get(f"/api/roadmaps/{roadmap_id}", headers=_auth(owner_token))
    assert get_resp2.json()["is_password_enabled"] is False

    # New join succeeds without password
    succ_nopw = await _join(client, editor_url, password=None, display_name="FreeJoiner")
    assert succ_nopw.status_code == 200


async def test_editor_and_viewer_cannot_update_password(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    viewer_url = await _rotate_link(client, roadmap_id, owner_token, "viewer")

    ed_join = await _join(client, editor_url, display_name="Ed")
    assert ed_join.status_code == 200
    editor_token = ed_join.json()["session_token"]

    vi_join = await _join(client, viewer_url, display_name="Vi")
    assert vi_join.status_code == 200
    viewer_token = vi_join.json()["session_token"]

    # Editor attempt
    ed_put = await client.put(
        f"/api/roadmaps/{roadmap_id}/password",
        headers=_auth(editor_token),
        json={"password": "editor_attempt_123"},
    )
    assert ed_put.status_code == 403

    # Viewer attempt
    vi_put = await client.put(
        f"/api/roadmaps/{roadmap_id}/password",
        headers=_auth(viewer_token),
        json={"password": "viewer_attempt_123"},
    )
    assert vi_put.status_code == 403


async def test_password_validation_limits(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    # Too short (< 6 chars)
    resp_short = await client.put(
        f"/api/roadmaps/{roadmap_id}/password",
        headers=_auth(owner_token),
        json={"password": "12345"},
    )
    assert resp_short.status_code == 422

    # Blank / whitespace only
    resp_blank = await client.put(
        f"/api/roadmaps/{roadmap_id}/password",
        headers=_auth(owner_token),
        json={"password": "      "},
    )
    assert resp_blank.status_code == 422

    # Too long (> 128 chars)
    resp_long = await client.put(
        f"/api/roadmaps/{roadmap_id}/password",
        headers=_auth(owner_token),
        json={"password": "a" * 129},
    )
    assert resp_long.status_code == 422


async def test_password_material_never_exposed_in_db_or_activity(client: AsyncClient, db_session: AsyncSession):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]
    raw_secret = "sensitive_password_xyz_789"

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}/password",
        headers=_auth(owner_token),
        json={"password": raw_secret},
    )
    assert resp.status_code == 200

    # Inspect ActivityLog in database
    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.roadmap_id == roadmap_id,
            ActivityLog.action == "roadmap.password_changed",
        )
    )
    log_entry = result.scalar_one_or_none()
    assert log_entry is not None
    assert log_entry.metadata_json == {"enabled": True}
    assert log_entry.before_json is None
    assert log_entry.after_json is None

    # Verify raw password does NOT appear anywhere in the log entry
    log_dump = f"{log_entry.action} {log_entry.metadata_json} {log_entry.before_json} {log_entry.after_json}"
    assert raw_secret not in log_dump

    # Inspect roadmap record: raw password must not equal stored hash
    rm_result = await db_session.execute(select(Roadmap).where(Roadmap.id == roadmap_id))
    roadmap = rm_result.scalar_one()
    assert roadmap.password_hash is not None
    assert roadmap.password_hash != raw_secret
    assert raw_secret not in roadmap.password_hash
