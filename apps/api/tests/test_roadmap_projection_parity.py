"""
RF-1907 — Projection parity tests across create, update, and restore.

Groups:
  E  Parity after create
  F  Parity after update
  G  Parity after restore
  H  Multi-roadmap rebuild isolation (PS-009)
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import Roadmap
from api.services.id_service import generate_id
from api.services.roadmap_projection_service import (
    clear_roadmap_projection,
    rebuild_roadmap_projection,
    validate_projection_parity,
)
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


# ─── Group H — Multi-roadmap rebuild isolation (PS-009) ──────────────────────


async def test_rebuild_projection_for_multiple_roadmaps_is_isolated(
    db_session: AsyncSession,
):
    """rebuild_roadmap_projection rebuilds each roadmap independently.

    Clearing and rebuilding one roadmap must not disturb another.
    This covers the per-roadmap loop in backfill_all_roadmap_projections.
    """

    def _make_roadmap(name: str, n_phases: int) -> Roadmap:
        phases = [
            {
                "id": f"ph_{name}_{i}",
                "num": str(i + 1),
                "name": f"Phase {i + 1}",
                "color": "blue",
                "status": "future",
                "progress": 0,
                "tasks": [{"id": f"tk_{name}_{i}", "title": "T", "done": False}],
            }
            for i in range(n_phases)
        ]
        return Roadmap(
            id=generate_id("rm_"),
            name=name,
            owner_display_name="Owner",
            snapshot_json={"phases": phases},
            schema_version="1.0",
            is_password_enabled=False,
        )

    rm_a = _make_roadmap("Alpha", 2)
    rm_b = _make_roadmap("Beta", 3)
    db_session.add_all([rm_a, rm_b])
    await db_session.flush()

    await rebuild_roadmap_projection(db_session, rm_a)
    await rebuild_roadmap_projection(db_session, rm_b)

    parity_a = await validate_projection_parity(db_session, rm_a)
    parity_b = await validate_projection_parity(db_session, rm_b)
    assert parity_a.ok is True
    assert parity_a.phase_count_snapshot == 2
    assert parity_b.ok is True
    assert parity_b.phase_count_snapshot == 3

    # Clear and rebuild only rm_a; rm_b must remain intact.
    await clear_roadmap_projection(db_session, rm_a.id)
    await rebuild_roadmap_projection(db_session, rm_a)

    parity_a_after = await validate_projection_parity(db_session, rm_a)
    parity_b_after = await validate_projection_parity(db_session, rm_b)
    assert parity_a_after.ok is True
    assert parity_b_after.ok is True
    assert parity_b_after.phase_count_snapshot == 3
