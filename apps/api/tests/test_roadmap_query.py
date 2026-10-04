"""Regression tests for roadmap query services and identity-map row lock freshness."""

from __future__ import annotations

from datetime import datetime, timezone
import pytest
from sqlalchemy import delete, select

from api.models.roadmap import Roadmap
from api.services.roadmap_query import (
    fetch_active_roadmap,
    fetch_active_roadmap_for_update,
)
from tests.conftest import _test_session_factory

pytestmark = pytest.mark.asyncio


async def test_fetch_active_roadmap_for_update_populates_stale_identity_map_under_lock() -> None:
    """
    Prove that fetch_active_roadmap_for_update refreshes existing identity-map state.

    Scenario:
    1. Roadmap R is created in database.
    2. Session A loads Roadmap R into memory and keeps a strong ORM reference.
    3. Session B acquires lock on R, modifies its canonical snapshot and name, and commits.
    4. Session A invokes fetch_active_roadmap_for_update(session_a, R.id).
    5. With populate_existing=True, the returned ORM entity (even with identical Python id)
       is repopulated from PostgreSQL under the row lock.
    6. Session A performs a subsequent focused mutation and commits.
    7. A subsequent query verifies Session B's canonical change was preserved alongside
       Session A's focused mutation without stale overwrite.
    """
    roadmap_id = "rm_freshness_test"
    initial_snapshot = {
        "phases": [
            {
                "id": "ph_1",
                "name": "Phase One",
                "tasks": [{"id": "tk_1", "title": "Initial Task", "done": False}],
            }
        ]
    }

    async with _test_session_factory() as setup_session:
        await setup_session.execute(delete(Roadmap).where(Roadmap.id == roadmap_id))
        roadmap = Roadmap(
            id=roadmap_id,
            name="Initial Name",
            owner_display_name="Owner",
            snapshot_json=initial_snapshot,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        setup_session.add(roadmap)
        await setup_session.commit()

    try:
        # Session A: Loads roadmap into memory and keeps a strong reference in identity map
        async with _test_session_factory() as session_a:
            roadmap_a = await fetch_active_roadmap(session_a, roadmap_id)
            assert roadmap_a.name == "Initial Name"
            assert roadmap_a.snapshot_json["phases"][0]["tasks"][0]["title"] == "Initial Task"

            # Session B: Independent transaction modifies canonical row in PostgreSQL and commits
            async with _test_session_factory() as session_b:
                roadmap_b = await fetch_active_roadmap_for_update(session_b, roadmap_id)
                roadmap_b.name = "Updated by Session B"
                updated_b_snapshot = {
                    "phases": [
                        {
                            "id": "ph_1",
                            "name": "Phase One",
                            "tasks": [
                                {"id": "tk_1", "title": "Initial Task", "done": False},
                                {"id": "tk_2", "title": "Task Added by B", "done": False},
                            ],
                        }
                    ]
                }
                roadmap_b.snapshot_json = updated_b_snapshot
                roadmap_b.updated_at = datetime.now(timezone.utc)
                await session_b.commit()

            # In Session A: verify roadmap_a in identity map is currently stale before lock acquisition
            assert roadmap_a.name == "Initial Name"
            assert len(roadmap_a.snapshot_json["phases"][0]["tasks"]) == 1

            # Session A acquires the row update lock
            # populate_existing=True ensures attributes are repopulated from PostgreSQL row
            locked_roadmap_a = await fetch_active_roadmap_for_update(session_a, roadmap_id)

            # Must be the exact same identity-map instance
            assert locked_roadmap_a is roadmap_a
            # Must reflect Session B's committed canonical updates
            assert locked_roadmap_a.name == "Updated by Session B"
            assert len(locked_roadmap_a.snapshot_json["phases"][0]["tasks"]) == 2
            assert locked_roadmap_a.snapshot_json["phases"][0]["tasks"][1]["id"] == "tk_2"

            # Session A performs a focused mutation on top of the fresh canonical state
            # (marking tk_1 as done)
            modified_snapshot = dict(locked_roadmap_a.snapshot_json)
            phases = list(modified_snapshot["phases"])
            tasks = list(phases[0]["tasks"])
            tasks[0] = {**tasks[0], "done": True}
            phases[0] = {**phases[0], "tasks": tasks}
            modified_snapshot["phases"] = phases
            locked_roadmap_a.snapshot_json = modified_snapshot
            locked_roadmap_a.updated_at = datetime.now(timezone.utc)
            await session_a.commit()

        # Session C: Verify final persisted state has BOTH Session B's change (name and tk_2)
        # AND Session A's focused mutation (tk_1 done=True)
        async with _test_session_factory() as session_c:
            final_roadmap = await fetch_active_roadmap(session_c, roadmap_id)
            assert final_roadmap.name == "Updated by Session B"
            tasks = final_roadmap.snapshot_json["phases"][0]["tasks"]
            assert len(tasks) == 2
            assert tasks[0]["id"] == "tk_1"
            assert tasks[0]["done"] is True
            assert tasks[1]["id"] == "tk_2"
            assert tasks[1]["title"] == "Task Added by B"

    finally:
        async with _test_session_factory() as cleanup_session:
            await cleanup_session.execute(delete(Roadmap).where(Roadmap.id == roadmap_id))
            await cleanup_session.commit()


async def test_without_populate_existing_identity_map_stays_stale() -> None:
    """
    Demonstrate that without populate_existing=True, SQLAlchemy SELECT FOR UPDATE
    leaves existing identity-map attributes stale.
    """
    roadmap_id = "rm_stale_identity_proof"
    async with _test_session_factory() as setup_session:
        await setup_session.execute(delete(Roadmap).where(Roadmap.id == roadmap_id))
        setup_session.add(
            Roadmap(
                id=roadmap_id,
                name="Initial Stale",
                owner_display_name="Owner",
                snapshot_json={"phases": []},
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
        )
        await setup_session.commit()

    try:
        async with _test_session_factory() as session_a:
            roadmap_a = await fetch_active_roadmap(session_a, roadmap_id)
            assert roadmap_a.name == "Initial Stale"

            async with _test_session_factory() as session_b:
                roadmap_b = await fetch_active_roadmap_for_update(session_b, roadmap_id)
                roadmap_b.name = "Canonical Newer"
                await session_b.commit()

            # Execute locked SELECT WITHOUT populate_existing
            result = await session_a.execute(
                select(Roadmap)
                .where(Roadmap.id == roadmap_id, Roadmap.deleted_at.is_(None))
                .with_for_update()
            )
            unpopulated = result.scalar_one_or_none()
            assert unpopulated is roadmap_a
            # Confirms the exact failure mechanism: without populate_existing, SQLAlchemy
            # retains the stale identity map attribute!
            assert unpopulated.name == "Initial Stale"
    finally:
        async with _test_session_factory() as cleanup_session:
            await cleanup_session.execute(delete(Roadmap).where(Roadmap.id == roadmap_id))
            await cleanup_session.commit()
