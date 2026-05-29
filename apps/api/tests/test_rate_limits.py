"""
RF-1911 — Rate limit regression tests.

Groups:
  A  Unauthenticated IP-scoped rate limit (join)
  B  Share-link mutation rate limit (rotate)
  C  Version checkpoint rate limit
  D  Roadmap update write rate limit
  E  Participant revoke rate limit
  F  Task done patch rate limit
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import create_roadmap
from tests.helpers_projection import create_with_phases

pytestmark = pytest.mark.asyncio

# Mirrors the limits declared in routers/roadmaps.py.
_JOIN_LIMIT = 20
_ROTATE_LIMIT = 5
_CHECKPOINT_LIMIT = 10
_UPDATE_LIMIT = 60
_REVOKE_PARTICIPANT_LIMIT = 10
_TASK_DONE_PATCH_LIMIT = 120


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _expect_exhausted(resp) -> None:
    assert resp.status_code == 429, f"expected 429, got {resp.status_code}: {resp.text}"


# ─── Group A — Unauthenticated join rate limit ────────────────────────────────


async def test_join_ip_rate_limit(client: AsyncClient):
    # Schema-valid but nonexistent token — passes validation, hits business logic
    # (non-429), but the rate limiter counter still increments on every request.
    invalid_token = "invalid-token-00000000"
    for _ in range(_JOIN_LIMIT):
        await client.post(
            "/api/roadmaps/join",
            json={"token": invalid_token, "display_name": "X"},
        )

    resp = await client.post(
        "/api/roadmaps/join",
        json={"token": invalid_token, "display_name": "X"},
    )
    _expect_exhausted(resp)


# ─── Group B — Share-link rotate rate limit ───────────────────────────────────


async def test_rotate_share_link_rate_limit(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    for _ in range(_ROTATE_LIMIT):
        resp = await client.post(
            f"/api/roadmaps/{roadmap_id}/share-links/viewer/rotate",
            headers=_auth(owner_token),
        )
        assert resp.status_code == 200, resp.text

    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/share-links/viewer/rotate",
        headers=_auth(owner_token),
    )
    _expect_exhausted(resp)


# ─── Group C — Version checkpoint rate limit ──────────────────────────────────


async def test_checkpoint_rate_limit(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    for _ in range(_CHECKPOINT_LIMIT):
        resp = await client.post(
            f"/api/roadmaps/{roadmap_id}/versions/checkpoint",
            headers=_auth(owner_token),
        )
        assert resp.status_code == 200, resp.text

    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/versions/checkpoint",
        headers=_auth(owner_token),
    )
    _expect_exhausted(resp)


# ─── Group D — Roadmap update write rate limit ────────────────────────────────


async def test_roadmap_update_rate_limit(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]
    updated_at = body["updated_at"]

    # Reuse the same updated_at for all warmup requests.  The first PUT succeeds
    # (200) and subsequent ones return 409 conflict, but every request still
    # increments the rate limiter counter for this participant+roadmap bucket.
    for _ in range(_UPDATE_LIMIT):
        await client.put(
            f"/api/roadmaps/{roadmap_id}",
            headers=_auth(owner_token),
            json={"name": "Test Roadmap", "last_updated_at": updated_at},
        )

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "Test Roadmap", "last_updated_at": updated_at},
    )
    _expect_exhausted(resp)


# ─── Group E — Participant revoke rate limit ──────────────────────────────────


async def test_revoke_participant_rate_limit(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    # Requests use a nonexistent participant_id — they return 404 from business
    # logic, but the rate limiter counter still increments on each request.
    for _ in range(_REVOKE_PARTICIPANT_LIMIT):
        await client.post(
            f"/api/roadmaps/{roadmap_id}/participants/pt_nonexistent/revoke",
            headers=_auth(owner_token),
        )

    resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/participants/pt_nonexistent/revoke",
        headers=_auth(owner_token),
    )
    _expect_exhausted(resp)


# ─── Group F — Task done patch rate limit ────────────────────────────────────


async def test_task_done_patch_rate_limit(client: AsyncClient):
    body = await create_with_phases(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    first = await client.patch(
        f"/api/roadmaps/{roadmap_id}/tasks/tk_a1/done",
        headers=_auth(owner_token),
        json={"done": True, "last_updated_at": body["updated_at"]},
    )
    assert first.status_code == 200, first.text
    updated_at = first.json()["updated_at"]

    for _ in range(_TASK_DONE_PATCH_LIMIT - 1):
        resp = await client.patch(
            f"/api/roadmaps/{roadmap_id}/tasks/tk_a1/done",
            headers=_auth(owner_token),
            json={"done": True, "last_updated_at": updated_at},
        )
        assert resp.status_code == 200, resp.text

    resp = await client.patch(
        f"/api/roadmaps/{roadmap_id}/tasks/tk_a1/done",
        headers=_auth(owner_token),
        json={"done": True, "last_updated_at": updated_at},
    )
    _expect_exhausted(resp)
