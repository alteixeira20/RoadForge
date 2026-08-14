"""Focused phase deletion must not leave dangling task dependencies."""

from __future__ import annotations

from copy import deepcopy

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from api.models.roadmap import ActivityLog, Roadmap
from api.services.projection import validate_projection_parity
from tests.helpers_projection import PHASES_WITH_TASKS, auth

pytestmark = pytest.mark.asyncio


async def test_delete_phase_cleans_dependencies_to_deleted_tasks(
    client: AsyncClient,
    db_session,
):
    phases = deepcopy(PHASES_WITH_TASKS)
    phases[1]["tasks"][0]["deps"] = ["tk_a1", "tk_a2"]
    created = await client.post(
        "/api/roadmaps",
        json={
            "name": "Phase delete dependency cleanup",
            "owner_display_name": "Owner",
            "phases": phases,
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()

    response = await client.delete(
        f"/api/roadmaps/{body['id']}/phases/ph_a",
        headers=auth(body["owner_session_token"]),
    )

    assert response.status_code == 200, response.text
    surviving = response.json()["phases"]
    assert [phase["id"] for phase in surviving] == ["ph_b"]
    assert surviving[0]["tasks"][0]["deps"] == []

    result = await db_session.execute(
        select(ActivityLog).where(
            ActivityLog.roadmap_id == body["id"],
            ActivityLog.action == "phase.deleted",
        )
    )
    activity = result.scalar_one()
    assert activity.metadata_json["deletedTaskCount"] == 2
    assert activity.metadata_json["removedDependencyCount"] == 2

    roadmap = await db_session.get(Roadmap, body["id"])
    assert roadmap is not None
    parity = await validate_projection_parity(db_session, roadmap)
    assert parity.ok is True
    assert parity.issues == []
