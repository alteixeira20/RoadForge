"""
RF-1101 — Backend auth and share-link tests.

Groups:
  A  Create roadmap / auth basics
  B  Join flow
  C  Rotate / revoke share links
  D  Revoke participant
  E  Expired session

PUT /api/roadmaps/{id} tests live in test_roadmap_updates.py.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import api.services.sharing_service as sharing_service
from api.models.roadmap import Participant
from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _join(client: AsyncClient, invite_url: str, display_name: str = "Member") -> dict:
    """Extract the raw token from an invite URL and POST /api/roadmaps/join."""
    token = invite_url.split("token=")[-1]
    resp = await client.post(
        "/api/roadmaps/join",
        json={"token": token, "display_name": display_name},
    )
    return resp


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
    """Rotate a share link and return the fresh join URL."""
    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/share-links/{role}/rotate",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["url"]


# ─── Group A — Create roadmap / auth basics ───────────────────────────────────


async def test_create_roadmap_returns_owner_token(client: AsyncClient):
    body = await create_roadmap(client)
    assert "owner_session_token" in body
    assert body["owner_session_token"]


async def test_create_roadmap_rejects_unknown_change_summary_action(client: AsyncClient):
    resp = await client.post(
        "/api/roadmaps",
        json={
            "name": "Bad Import",
            "owner_display_name": "Owner",
            "phases": [],
            "change_summary": {"action": "roadmap.pwned"},
        },
    )
    assert resp.status_code == 422


async def test_owner_token_can_get_roadmap(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    token = body["owner_session_token"]

    resp = await client.get(f"/api/roadmaps/{roadmap_id}", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["id"] == roadmap_id


async def test_no_token_get_returns_401(client: AsyncClient):
    body = await create_roadmap(client)
    resp = await client.get(f"/api/roadmaps/{body['id']}")
    assert resp.status_code == 401


async def test_garbage_token_get_returns_401(client: AsyncClient):
    body = await create_roadmap(client)
    resp = await client.get(
        f"/api/roadmaps/{body['id']}",
        headers=_auth("not-a-real-token-xyz"),
    )
    assert resp.status_code == 401


# ─── Group B — Join flow ──────────────────────────────────────────────────────


@pytest.mark.parametrize("role", ["editor", "viewer"])
async def test_invite_link_returns_correct_role(client: AsyncClient, role: str):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    # Editor URLs are only returned on rotate (raw token never exposed in list).
    # Viewer URL is available via the list endpoint (public_token stored in DB).
    if role == "editor":
        join_url = await _rotate_link(client, roadmap_id, owner_token, role)
    else:
        links = await _get_share_links(client, roadmap_id, owner_token)
        join_url = links[role]["url"]

    resp = await _join(client, join_url, display_name=f"{role}_user")

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["role"] == role
    assert data["session_token"]
    assert data["roadmap_id"] == roadmap_id


async def test_owner_invite_link_returns_owner_role(client: AsyncClient):
    body = await create_roadmap(client)
    owner_url = next(
        link["url"] for link in body["share_links"] if link["role"] == "owner"
    )

    resp = await _join(client, owner_url, display_name="SecondOwner")

    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "owner"
    assert resp.json()["roadmap_id"] == body["id"]


async def test_invalid_invite_token_returns_401(client: AsyncClient):
    resp = await client.post(
        "/api/roadmaps/join",
        json={"token": "invalid-token-that-does-not-exist", "display_name": "X"},
    )
    assert resp.status_code == 401


async def test_editor_token_can_get_roadmap(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url)
    editor_token = join_resp.json()["session_token"]

    resp = await client.get(f"/api/roadmaps/{roadmap_id}", headers=_auth(editor_token))
    assert resp.status_code == 200


async def test_viewer_token_can_get_roadmap(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    links = await _get_share_links(client, roadmap_id, owner_token)
    join_resp = await _join(client, links["viewer"]["url"])
    viewer_token = join_resp.json()["session_token"]

    resp = await client.get(f"/api/roadmaps/{roadmap_id}", headers=_auth(viewer_token))
    assert resp.status_code == 200


# ─── Group C — Rotate / revoke share links ───────────────────────────────────


async def test_viewer_cannot_rotate_share_links(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    links = await _get_share_links(client, roadmap_id, owner_token)
    join_resp = await _join(client, links["viewer"]["url"])
    viewer_token = join_resp.json()["session_token"]

    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/share-links/editor/rotate",
        headers=_auth(viewer_token),
    )
    assert resp.status_code == 403


async def test_editor_cannot_rotate_share_links(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url)
    editor_token = join_resp.json()["session_token"]

    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/share-links/viewer/rotate",
        headers=_auth(editor_token),
    )
    assert resp.status_code == 403


async def test_rotating_editor_link_invalidates_old_token(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    # Rotate once to get a known token, then rotate again to invalidate it.
    old_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    await _rotate_link(client, roadmap_id, owner_token, "editor")

    # Old token should now be rejected
    resp = await _join(client, old_url, display_name="OldJoiner")
    assert resp.status_code == 401


async def test_new_rotated_token_can_join(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    rotate_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/share-links/editor/rotate",
        headers=_auth(owner_token),
    )
    assert rotate_resp.status_code == 200, rotate_resp.text
    new_url = rotate_resp.json()["url"]

    resp = await _join(client, new_url, display_name="NewEditor")
    assert resp.status_code == 200
    assert resp.json()["role"] == "editor"


async def test_revoked_viewer_link_cannot_join(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    links = await _get_share_links(client, roadmap_id, owner_token)
    viewer_url = links["viewer"]["url"]

    # Revoke the viewer link
    resp = await client.delete(
        f"/api/roadmaps/{roadmap_id}/share-links/viewer",
        headers=_auth(owner_token),
    )
    assert resp.status_code == 204

    # Attempt to join with old URL should fail
    resp = await _join(client, viewer_url, display_name="LateViewer")
    assert resp.status_code == 401


async def test_revoking_invite_does_not_revoke_existing_session(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]
    links = await _get_share_links(client, roadmap_id, owner_token)
    join_resp = await _join(client, links["viewer"]["url"], display_name="ActiveViewer")
    viewer_token = join_resp.json()["session_token"]

    revoke_resp = await client.delete(
        f"/api/roadmaps/{roadmap_id}/share-links/viewer",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(viewer_token),
    )
    assert resp.status_code == 200


# ─── Group D — Revoke participant ────────────────────────────────────────────


async def test_revoked_editor_session_returns_401(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    assert join_resp.status_code == 200, join_resp.text

    editor_data = join_resp.json()
    editor_token = editor_data["session_token"]
    editor_pid = editor_data["participant_id"]

    # Owner revokes the editor
    revoke_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    # Revoked session should now return 401
    resp = await client.get(f"/api/roadmaps/{roadmap_id}", headers=_auth(editor_token))
    assert resp.status_code == 401


async def test_revoke_participant_publishes_sse_event(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditMe")
    assert join_resp.status_code == 200, join_resp.text
    editor_pid = join_resp.json()["participant_id"]

    published_events = []

    async def record_publish(event):
        published_events.append(event)

    monkeypatch.setattr(sharing_service.event_bus, "publish", record_publish)

    revoke_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    assert len(published_events) == 1
    event = published_events[0]
    assert event.action == "participant.revoked"
    assert event.roadmap_id == roadmap_id
    assert event.payload["roadmap_id"] == roadmap_id
    assert event.payload["participant_id"] == editor_pid
    assert event.payload["revoked_at"]


# ─── Group F — Participant list read (owner/editor/viewer) ──────────────────


async def test_owner_gets_full_participant_fields(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    await _join(client, editor_url, display_name="EditorOne")

    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/participants", headers=_auth(owner_token)
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert len(rows) == 2
    editor_row = next(r for r in rows if r["display_name"] == "EditorOne")
    # Full projection includes timestamps and link linkage.
    assert "created_at" in editor_row
    assert "share_link_id" in editor_row
    assert "joined_via_role" in editor_row
    assert "access_source_label" in editor_row


async def test_editor_gets_reduced_participant_fields(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditorOne")
    editor_token = join_resp.json()["session_token"]

    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/participants", headers=_auth(editor_token)
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert len(rows) == 2
    names = {r["display_name"] for r in rows}
    assert names == {"Owner", "EditorOne"}

    for row in rows:
        assert set(row.keys()) == {
            "id",
            "display_name",
            "role",
            "is_current_participant",
        }


async def test_editor_participant_list_excludes_revoked(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="EditorOne")
    editor_pid = join_resp.json()["participant_id"]

    other_editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    other_join_resp = await _join(client, other_editor_url, display_name="EditorTwo")
    other_editor_token = other_join_resp.json()["session_token"]

    revoke_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/{editor_pid}/revoke",
        headers=_auth(owner_token),
    )
    assert revoke_resp.status_code == 204

    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/participants", headers=_auth(other_editor_token)
    )
    assert resp.status_code == 200, resp.text
    names = {r["display_name"] for r in resp.json()}
    assert names == {"Owner", "EditorTwo"}


async def test_editor_participant_list_excludes_expired_session(
    client: AsyncClient,
    db_session: AsyncSession,
):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    expired_editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    expired_join_resp = await _join(client, expired_editor_url, display_name="ExpiredEditor")
    expired_pid = expired_join_resp.json()["participant_id"]

    active_editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    active_join_resp = await _join(client, active_editor_url, display_name="ActiveEditor")
    active_editor_token = active_join_resp.json()["session_token"]

    # Backdating session_expires_at directly via DB session
    result = await db_session.execute(
        select(Participant).where(Participant.id == expired_pid)
    )
    expired_participant = result.scalar_one()
    expired_participant.session_expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    await db_session.commit()

    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/participants", headers=_auth(active_editor_token)
    )
    assert resp.status_code == 200, resp.text
    names = {r["display_name"] for r in resp.json()}
    assert names == {"Owner", "ActiveEditor"}


async def test_viewer_cannot_read_participants(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    links = await _get_share_links(client, roadmap_id, owner_token)
    join_resp = await _join(client, links["viewer"]["url"])
    viewer_token = join_resp.json()["session_token"]

    resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/participants", headers=_auth(viewer_token)
    )
    assert resp.status_code == 403


# ─── Group E — Expired session ───────────────────────────────────────────────


async def test_expired_session_returns_401(client: AsyncClient, db_session: AsyncSession):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    editor_url = await _rotate_link(client, roadmap_id, owner_token, "editor")
    join_resp = await _join(client, editor_url, display_name="Expiring")
    assert join_resp.status_code == 200, join_resp.text

    editor_token = join_resp.json()["session_token"]
    editor_pid = join_resp.json()["participant_id"]

    # Backdating session_expires_at directly via DB session
    result = await db_session.execute(
        select(Participant).where(Participant.id == editor_pid)
    )
    participant = result.scalar_one()
    participant.session_expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    await db_session.flush()
    await db_session.commit()

    resp = await client.get(f"/api/roadmaps/{roadmap_id}", headers=_auth(editor_token))
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Session expired"


async def test_stale_active_session_renews_expiry(
    client: AsyncClient,
    db_session: AsyncSession,
):
    body = await create_roadmap(client)
    owner_token = body["owner_session_token"]
    now = datetime.now(timezone.utc)

    result = await db_session.execute(
        select(Participant).where(
            Participant.roadmap_id == body["id"],
            Participant.role == "owner",
        )
    )
    participant = result.scalar_one()
    participant.last_seen_at = now - timedelta(minutes=2)
    participant.session_expires_at = now + timedelta(days=1)
    await db_session.commit()

    resp = await client.get(
        f"/api/roadmaps/{body['id']}",
        headers=_auth(owner_token),
    )

    assert resp.status_code == 200
    assert participant.last_seen_at >= now
    assert participant.session_expires_at >= now + timedelta(days=29)
