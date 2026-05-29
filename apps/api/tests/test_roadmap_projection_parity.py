"""
RF-1907 — Projection parity tests across create, update, and restore.

Groups:
  E  Parity after create
  F  Parity after update
  G  Parity after restore
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import Roadmap
from api.services.roadmap_projection_service import validate_projection_parity
from tests.helpers_projection import auth, create_with_phases

pytestmark = pytest.mark.asyncio


async def _put_phases(client, roadmap_id, token, phases, updated_at):
    resp = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=auth(token),
        json={"phases": phases, "last_updated_at": updated_at},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ─── Group E — Parity after create ───────────────────────────────────────────


async def test_parity_ok_after_create(client, db_session: AsyncSession):
    body = await create_with_phases(client)
    roadmap_id = body["id"]

    roadmap = await db_session.get(Roadmap, roadmap_id)
    assert roadmap is not None

    parity = await validate_projection_parity(db_session, roadmap)

    assert parity.ok is True
    assert parity.issues == []
    assert parity.phase_count_snapshot == 2
    assert parity.phase_count_projection == 2
    assert parity.task_count_snapshot == 3
    assert parity.task_count_projection == 3


# ─── Group F — Parity after update ───────────────────────────────────────────


async def test_parity_ok_after_update(client, db_session: AsyncSession):
    body = await create_with_phases(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    new_phases = [
        {
            "id": "ph_a",
            "num": "1",
            "name": "Alpha Updated",
            "color": "blue",
            "status": "done",
            "progress": 100,
            "tasks": [{"id": "tk_a1", "title": "Task Updated", "done": True}],
        }
    ]
    await _put_phases(client, roadmap_id, owner_token, new_phases, body["updated_at"])

    roadmap = await db_session.get(Roadmap, roadmap_id)
    assert roadmap is not None

    parity = await validate_projection_parity(db_session, roadmap)

    assert parity.ok is True
    assert parity.issues == []
    assert parity.phase_count_snapshot == 1
    assert parity.task_count_snapshot == 1


# ─── Group G — Parity after restore ──────────────────────────────────────────


async def test_parity_ok_after_restore(client, db_session: AsyncSession):
    body = await create_with_phases(client)
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    # v1 is the "roadmap.created" entry (versions list is newest-first)
    versions_resp = await client.get(
        f"/api/roadmaps/{roadmap_id}/versions",
        headers=auth(owner_token),
    )
    assert versions_resp.status_code == 200
    v1_id = versions_resp.json()[0]["id"]

    # Replace with a single empty phase
    await _put_phases(
        client,
        roadmap_id,
        owner_token,
        [
            {
                "id": "ph_new",
                "num": "1",
                "name": "Replacement",
                "color": "purple",
                "status": "active",
                "progress": 0,
                "tasks": [],
            }
        ],
        body["updated_at"],
    )

    # Restore to v1 (original two-phase snapshot)
    restore_resp = await client.post(
        f"/api/roadmaps/{roadmap_id}/versions/{v1_id}/restore",
        headers=auth(owner_token),
    )
    assert restore_resp.status_code == 200

    roadmap = await db_session.get(Roadmap, roadmap_id)
    assert roadmap is not None

    parity = await validate_projection_parity(db_session, roadmap)

    assert parity.ok is True
    assert parity.issues == []
    assert parity.phase_count_snapshot == 2
    assert parity.task_count_snapshot == 3
