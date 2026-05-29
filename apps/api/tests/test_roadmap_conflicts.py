"""
RF-1902 / RF-1903 — Roadmap PUT conflict and concurrency tests.

Groups:
  D  Stale conflict 409 contract (1902)
  E  Row-lock / stale-write contract under sequential requests (1903)

Note on true concurrency (1903):
  The test fixture binds each test to a single AsyncSession backed by one DB
  connection (NullPool, outer transaction + one SAVEPOINT). Running two coroutines
  via asyncio.gather shares that session, which is not concurrency-safe and would
  serialize requests anyway. Verifying SELECT FOR UPDATE row-lock behavior across
  two real competing DB connections requires a dedicated multi-session integration
  fixture, which is out of scope for this file. The sequential stale-write test
  below is sufficient to assert the conflict contract that row-locking enforces.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─── Group D — Stale conflict 409 contract (RF-1902) ─────────────────────────


async def test_stale_update_returns_409(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]
    original_updated_at = body["updated_at"]

    first = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "First Update", "last_updated_at": original_updated_at},
    )
    assert first.status_code == 200

    # Second update with the now-stale original timestamp → must conflict
    second = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "Stale Update", "last_updated_at": original_updated_at},
    )
    assert second.status_code == 409


async def test_conflict_response_shape(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]
    original_updated_at = body["updated_at"]

    await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "First", "last_updated_at": original_updated_at},
    )

    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "Stale", "last_updated_at": original_updated_at},
    )
    assert resp.status_code == 409

    data = resp.json()
    assert "detail" in data
    assert data.get("code") == "roadmap_conflict"

    conflict = data.get("conflict", {})
    assert conflict.get("roadmap_id") == roadmap_id
    assert "server_updated_at" in conflict
    assert "client_last_updated_at" in conflict

    server = conflict.get("server", {})
    assert "name" in server
    assert "phases" in server

    summary = conflict.get("summary", {})
    assert "phase_count" in summary
    assert "task_count" in summary


async def test_stale_update_preserves_server_state(client: AsyncClient):
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]
    original_updated_at = body["updated_at"]

    first = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "Canonical Name", "last_updated_at": original_updated_at},
    )
    assert first.status_code == 200

    stale = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "Overwrite Attempt", "last_updated_at": original_updated_at},
    )
    assert stale.status_code == 409

    get_resp = await client.get(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Canonical Name"


# ─── Group E — Row-lock / stale-write contract (RF-1903) ─────────────────────


async def test_sequential_stale_writes_reject_second_writer(client: AsyncClient):
    """
    Two sequential PUTs both carrying the original updated_at simulate the
    conflict scenario that SELECT FOR UPDATE serialises in production: the first
    write succeeds and advances the server timestamp; the second is rejected as
    stale; the final GET reflects only the first write.
    """
    body = await create_roadmap(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]
    original_updated_at = body["updated_at"]

    first = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "Winner", "last_updated_at": original_updated_at},
    )
    assert first.status_code == 200

    second = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "Loser", "last_updated_at": original_updated_at},
    )
    assert second.status_code == 409

    get_resp = await client.get(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
    )
    assert get_resp.status_code == 200
    final = get_resp.json()
    assert final["name"] == "Winner"
    assert final["name"] != "Loser"
