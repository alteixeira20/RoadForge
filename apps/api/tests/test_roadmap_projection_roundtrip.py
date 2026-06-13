"""
RF-1906 — Projection serialization round-trip tests.

Groups:
  A  Phase field ordering and scalar values
  B  Task fields (all mapped fields including relationships)
  C  source_json preserves extra phase/task keys
  D  Invalid dep and parent references normalize consistently
"""

from __future__ import annotations

import pytest

from api.models.roadmap import Roadmap
from api.services.id_service import generate_id
from api.services.roadmap_projection_service import (
    rebuild_roadmap_projection,
    serialize_projection_to_snapshot,
)
from tests.helpers_projection import create_with_phases

pytestmark = pytest.mark.asyncio


def _direct_roadmap(snapshot_phases: list) -> Roadmap:
    """Build a Roadmap model instance directly, bypassing the API."""
    return Roadmap(
        id=generate_id("rm_"),
        name="Direct Roadmap",
        owner_display_name="Owner",
        snapshot_json={"phases": snapshot_phases},
        schema_version="1.0",
        is_password_enabled=False,
    )


# ─── Group A — Phase ordering and scalar values ───────────────────────────────


async def test_round_trip_preserves_phase_ordering_and_scalars(client, db_session):
    body = await create_with_phases(client)
    roadmap_id = body["id"]

    projection = await serialize_projection_to_snapshot(db_session, roadmap_id)
    phases = projection["phases"]

    assert len(phases) == 2

    assert phases[0]["id"] == "ph_a"
    assert phases[0]["num"] == "1"
    assert phases[0]["name"] == "Alpha"
    assert phases[0]["color"] == "blue"
    assert phases[0]["colorMode"] == "auto"
    assert phases[0]["status"] == "active"
    assert phases[0]["progress"] == 50

    assert phases[1]["id"] == "ph_b"
    assert phases[1]["num"] == "2"
    assert phases[1]["name"] == "Beta"
    assert phases[1]["color"] == "green"
    assert phases[1]["status"] == "future"
    assert phases[1]["progress"] == 0


# ─── Group B — Task fields ────────────────────────────────────────────────────


async def test_round_trip_preserves_task_scalars_and_relationships(client, db_session):
    body = await create_with_phases(client)
    roadmap_id = body["id"]

    projection = await serialize_projection_to_snapshot(db_session, roadmap_id)
    tasks_a = projection["phases"][0]["tasks"]
    tasks_b = projection["phases"][1]["tasks"]

    tk_a1 = tasks_a[0]
    assert tk_a1["id"] == "tk_a1"
    assert tk_a1["title"] == "Alpha task one"
    assert tk_a1["done"] is False
    assert tk_a1["next"] is True
    assert tk_a1["est"] == "2d"
    assert tk_a1["desc"] == "First task description"
    assert tk_a1["tags"] == ["tag-a", "tag-b"]
    assert tk_a1["assignees"] == ["Alice", "Bob"]
    assert "deps" not in tk_a1

    tk_a2 = tasks_a[1]
    assert tk_a2["id"] == "tk_a2"
    assert tk_a2["done"] is True
    assert tk_a2["assignees"] == ["Alice"]
    assert set(tk_a2.get("deps", [])) == {"tk_a1"}

    tk_b1 = tasks_b[0]
    assert tk_b1["id"] == "tk_b1"
    assert tk_b1["parentId"] == "tk_a1"
    assert tk_b1["tags"] == ["tag-c"]


# ─── Group C — source_json preserves extra keys ───────────────────────────────


async def test_round_trip_preserves_extra_phase_keys_via_source_json(db_session):
    phase = {
        "id": "ph_x",
        "num": "1",
        "name": "Extra Phase",
        "color": "red",
        "status": "future",
        "progress": 0,
        "tasks": [],
        "custom_phase_flag": True,
        "meta": {"note": "extra"},
    }
    roadmap = _direct_roadmap([phase])
    db_session.add(roadmap)
    await db_session.flush()

    await rebuild_roadmap_projection(db_session, roadmap)

    projection = await serialize_projection_to_snapshot(db_session, roadmap.id)
    result = projection["phases"][0]

    assert result["id"] == "ph_x"
    assert result["custom_phase_flag"] is True
    assert result["meta"] == {"note": "extra"}


async def test_round_trip_preserves_extra_task_keys_via_source_json(db_session):
    phase = {
        "id": "ph_y",
        "num": "1",
        "name": "Phase Y",
        "color": "red",
        "status": "future",
        "progress": 0,
        "tasks": [
            {
                "id": "tk_y1",
                "title": "Task with extras",
                "done": False,
                "custom_field": "preserved",
                "priority": 3,
            },
        ],
    }
    roadmap = _direct_roadmap([phase])
    db_session.add(roadmap)
    await db_session.flush()

    await rebuild_roadmap_projection(db_session, roadmap)

    projection = await serialize_projection_to_snapshot(db_session, roadmap.id)
    task = projection["phases"][0]["tasks"][0]

    assert task["id"] == "tk_y1"
    assert task["custom_field"] == "preserved"
    assert task["priority"] == 3


# ─── Group D — Invalid dep/parent refs normalize consistently ─────────────────


async def test_self_dep_is_silently_dropped_during_rebuild(db_session):
    phase = {
        "id": "ph_d1",
        "num": "1",
        "name": "D1",
        "color": "red",
        "status": "future",
        "progress": 0,
        "tasks": [{"id": "tk_d1", "title": "T", "done": False, "deps": ["tk_d1"]}],
    }
    roadmap = _direct_roadmap([phase])
    db_session.add(roadmap)
    await db_session.flush()

    await rebuild_roadmap_projection(db_session, roadmap)

    projection = await serialize_projection_to_snapshot(db_session, roadmap.id)
    task = projection["phases"][0]["tasks"][0]

    assert "deps" not in task or task.get("deps") == []


async def test_missing_dep_ref_is_silently_dropped_during_rebuild(db_session):
    phase = {
        "id": "ph_d2",
        "num": "1",
        "name": "D2",
        "color": "red",
        "status": "future",
        "progress": 0,
        "tasks": [
            {"id": "tk_d2", "title": "T", "done": False, "deps": ["tk_nonexistent"]},
        ],
    }
    roadmap = _direct_roadmap([phase])
    db_session.add(roadmap)
    await db_session.flush()

    await rebuild_roadmap_projection(db_session, roadmap)

    projection = await serialize_projection_to_snapshot(db_session, roadmap.id)
    task = projection["phases"][0]["tasks"][0]

    assert "deps" not in task or task.get("deps") == []


async def test_invalid_parent_ref_is_silently_dropped_during_rebuild(db_session):
    phase = {
        "id": "ph_d3",
        "num": "1",
        "name": "D3",
        "color": "red",
        "status": "future",
        "progress": 0,
        "tasks": [
            {"id": "tk_d3", "title": "T", "done": False, "parentId": "tk_nowhere"},
        ],
    }
    roadmap = _direct_roadmap([phase])
    db_session.add(roadmap)
    await db_session.flush()

    await rebuild_roadmap_projection(db_session, roadmap)

    projection = await serialize_projection_to_snapshot(db_session, roadmap.id)
    task = projection["phases"][0]["tasks"][0]

    assert "parentId" not in task


# ─── Group E — Claim fields round-trip ────────────────────────────────────────


async def test_round_trip_preserves_claim_fields(db_session):
    phase = {
        "id": "ph_e1",
        "num": "1",
        "name": "E1",
        "color": "red",
        "status": "future",
        "progress": 0,
        "tasks": [
            {
                "id": "tk_e1",
                "title": "Claimed task",
                "done": False,
                "claimedBy": "Alice",
                "claimedById": "p_abc123",
                "claimedAt": "2026-06-01T10:00:00Z",
            },
        ],
    }
    roadmap = _direct_roadmap([phase])
    db_session.add(roadmap)
    await db_session.flush()

    await rebuild_roadmap_projection(db_session, roadmap)

    projection = await serialize_projection_to_snapshot(db_session, roadmap.id)
    task = projection["phases"][0]["tasks"][0]

    assert task["claimedBy"] == "Alice"
    assert task["claimedById"] == "p_abc123"
    assert "claimedAt" in task
    assert "2026-06-01" in task["claimedAt"]


async def test_round_trip_task_without_claim_fields_has_no_claim_keys(db_session):
    phase = {
        "id": "ph_e2",
        "num": "1",
        "name": "E2",
        "color": "red",
        "status": "future",
        "progress": 0,
        "tasks": [{"id": "tk_e2", "title": "Unclaimed", "done": False}],
    }
    roadmap = _direct_roadmap([phase])
    db_session.add(roadmap)
    await db_session.flush()

    await rebuild_roadmap_projection(db_session, roadmap)

    projection = await serialize_projection_to_snapshot(db_session, roadmap.id)
    task = projection["phases"][0]["tasks"][0]

    assert "claimedBy" not in task
    assert "claimedById" not in task
    assert "claimedAt" not in task
