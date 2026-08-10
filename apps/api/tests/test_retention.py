from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import (
    ActivityLog,
    Participant,
    Roadmap,
    RoadmapPhase,
    RoadmapTask,
    RoadmapVersion,
)
from api.scripts.purge_retention import _parse_as_of, _run
from api.services.retention_service import (
    RetentionPolicy,
    build_retention_plan,
    execute_retention_plan,
)

NOW = datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc)


def _roadmap(
    roadmap_id: str,
    *,
    deleted_at: datetime | None = None,
    snapshot_json: dict | None = None,
) -> Roadmap:
    return Roadmap(
        id=roadmap_id,
        name=f"Roadmap {roadmap_id}",
        owner_display_name="Owner",
        snapshot_json=snapshot_json or {"phases": []},
        tag_registry_json=[],
        deleted_at=deleted_at,
    )


def _cli_args(*, execute: bool, confirm: str | None) -> argparse.Namespace:
    return argparse.Namespace(
        session_grace_days=7,
        activity_days=180,
        version_days=90,
        deleted_roadmap_days=30,
        preserve_versions=3,
        batch_limit=100,
        as_of=NOW,
        execute=execute,
        confirm=confirm,
    )


def test_retention_policy_refuses_unsafe_thresholds() -> None:
    with pytest.raises(ValueError, match="activity_days must be at least 30"):
        RetentionPolicy(activity_days=29).validate()

    with pytest.raises(ValueError, match="deleted_roadmap_days must be at least 7"):
        RetentionPolicy(deleted_roadmap_days=1).validate()

    with pytest.raises(ValueError, match="preserve_versions_per_roadmap"):
        RetentionPolicy(preserve_versions_per_roadmap=0).validate()

    with pytest.raises(ValueError, match="batch_limit"):
        RetentionPolicy(batch_limit=1_001).validate()


def test_as_of_requires_timezone_and_normalises_to_utc() -> None:
    assert _parse_as_of("2026-08-10T13:00:00+01:00") == NOW
    with pytest.raises(argparse.ArgumentTypeError, match="include a timezone"):
        _parse_as_of("2026-08-10T12:00:00")


@pytest.mark.asyncio
async def test_cli_requires_explicit_destructive_confirmation(capsys: pytest.CaptureFixture[str]) -> None:
    assert await _run(_cli_args(execute=True, confirm=None)) == 2
    assert "--confirm PURGE" in capsys.readouterr().out

    assert await _run(_cli_args(execute=False, confirm="PURGE")) == 2
    assert "valid only with --execute" in capsys.readouterr().out


@pytest.mark.asyncio
async def test_plan_never_hard_deletes_active_or_recently_deleted_roadmaps(
    db_session: AsyncSession,
) -> None:
    active = _roadmap("rm_active")
    recent_deleted = _roadmap("rm_recent", deleted_at=NOW - timedelta(days=5))
    old_deleted = _roadmap("rm_old", deleted_at=NOW - timedelta(days=45))
    db_session.add_all([active, recent_deleted, old_deleted])
    await db_session.flush()

    plan = await build_retention_plan(db_session, RetentionPolicy(), now=NOW)

    assert "rm_active" not in plan.roadmap_ids
    assert "rm_recent" not in plan.roadmap_ids
    assert plan.roadmap_ids == ("rm_old",)


@pytest.mark.asyncio
async def test_plan_prunes_old_active_history_but_preserves_recent_and_latest_versions(
    db_session: AsyncSession,
) -> None:
    roadmap = _roadmap("rm_history")
    db_session.add(roadmap)
    await db_session.flush()

    old_activity = ActivityLog(
        id="al_old",
        roadmap_id=roadmap.id,
        participant_id=None,
        actor_name="Old actor",
        action="task.updated",
        created_at=NOW - timedelta(days=240),
    )
    recent_activity = ActivityLog(
        id="al_recent",
        roadmap_id=roadmap.id,
        participant_id=None,
        actor_name="Recent actor",
        action="task.updated",
        created_at=NOW - timedelta(days=10),
    )
    db_session.add_all([old_activity, recent_activity])

    for number in range(1, 6):
        db_session.add(
            RoadmapVersion(
                id=f"rv_{number}",
                roadmap_id=roadmap.id,
                version_number=number,
                roadmap_name=roadmap.name,
                snapshot_json={"phases": []},
                action="roadmap.checkpoint",
                created_at=NOW - timedelta(days=120 - number),
            )
        )
    await db_session.flush()

    plan = await build_retention_plan(
        db_session,
        RetentionPolicy(
            activity_days=180,
            version_days=90,
            preserve_versions_per_roadmap=3,
        ),
        now=NOW,
    )

    assert plan.activity_ids == ("al_old",)
    assert "al_recent" not in plan.activity_ids
    assert plan.version_ids == ("rv_1", "rv_2")
    assert {"rv_3", "rv_4", "rv_5"}.isdisjoint(plan.version_ids)
    assert plan.roadmap_ids == ()


@pytest.mark.asyncio
async def test_plan_selects_only_sessions_past_the_cleanup_grace(
    db_session: AsyncSession,
) -> None:
    roadmap = _roadmap("rm_sessions")
    db_session.add(roadmap)
    await db_session.flush()

    db_session.add_all(
        [
            Participant(
                id="pt_expired_old",
                roadmap_id=roadmap.id,
                display_name="Expired old",
                role="editor",
                session_token_hash="hash-expired-old",
                session_expires_at=NOW - timedelta(days=10),
            ),
            Participant(
                id="pt_expired_recent",
                roadmap_id=roadmap.id,
                display_name="Expired recent",
                role="editor",
                session_token_hash="hash-expired-recent",
                session_expires_at=NOW - timedelta(days=2),
            ),
            Participant(
                id="pt_revoked_old",
                roadmap_id=roadmap.id,
                display_name="Revoked old",
                role="viewer",
                session_token_hash="hash-revoked-old",
                revoked_at=NOW - timedelta(days=20),
            ),
            Participant(
                id="pt_active",
                roadmap_id=roadmap.id,
                display_name="Active",
                role="owner",
                session_token_hash="hash-active",
                session_expires_at=NOW + timedelta(days=20),
            ),
        ]
    )
    await db_session.flush()

    plan = await build_retention_plan(
        db_session,
        RetentionPolicy(session_grace_days=7),
        now=NOW,
    )

    assert set(plan.participant_ids) == {"pt_expired_old", "pt_revoked_old"}
    assert "pt_expired_recent" not in plan.participant_ids
    assert "pt_active" not in plan.participant_ids


@pytest.mark.asyncio
async def test_plan_does_not_double_count_sessions_inside_hard_purge_roadmaps(
    db_session: AsyncSession,
) -> None:
    roadmap = _roadmap("rm_old_deleted", deleted_at=NOW - timedelta(days=45))
    participant = Participant(
        id="pt_old_deleted",
        roadmap_id=roadmap.id,
        display_name="Old participant",
        role="owner",
        session_token_hash="hash-old-deleted",
        session_expires_at=NOW - timedelta(days=40),
    )
    db_session.add_all([roadmap, participant])
    await db_session.flush()

    plan = await build_retention_plan(db_session, RetentionPolicy(), now=NOW)

    assert plan.roadmap_ids == (roadmap.id,)
    assert participant.id not in plan.participant_ids


@pytest.mark.asyncio
async def test_execute_revalidates_session_before_deletion(db_session: AsyncSession) -> None:
    roadmap = _roadmap("rm_refresh_race")
    participant = Participant(
        id="pt_refresh_race",
        roadmap_id=roadmap.id,
        display_name="Participant",
        role="editor",
        session_token_hash="hash-refresh-race",
        session_expires_at=NOW - timedelta(days=10),
    )
    db_session.add_all([roadmap, participant])
    await db_session.flush()

    plan = await build_retention_plan(db_session, RetentionPolicy(), now=NOW)
    assert plan.participant_ids == (participant.id,)

    participant.session_expires_at = NOW + timedelta(days=30)
    await db_session.flush()

    result = await execute_retention_plan(db_session, plan)
    assert result.expired_or_revoked_sessions == 0
    assert (
        await db_session.scalar(sa.select(Participant.id).where(Participant.id == participant.id))
        == participant.id
    )


@pytest.mark.asyncio
async def test_execute_revalidates_roadmap_restore_before_hard_delete(
    db_session: AsyncSession,
) -> None:
    roadmap = _roadmap("rm_restore_race", deleted_at=NOW - timedelta(days=45))
    db_session.add(roadmap)
    await db_session.flush()

    plan = await build_retention_plan(db_session, RetentionPolicy(), now=NOW)
    assert plan.roadmap_ids == (roadmap.id,)

    roadmap.deleted_at = None
    await db_session.flush()

    result = await execute_retention_plan(db_session, plan)
    assert result.soft_deleted_roadmaps == 0
    assert (
        await db_session.scalar(sa.select(Roadmap.id).where(Roadmap.id == roadmap.id))
        == roadmap.id
    )


@pytest.mark.asyncio
async def test_session_purge_clears_task_claim_from_snapshot_and_projection(
    db_session: AsyncSession,
) -> None:
    participant_id = "pt_claim_cleanup"
    client_phase_id = "phase_claim_cleanup"
    client_task_id = "task_claim_cleanup"
    roadmap = _roadmap(
        "rm_claim_cleanup",
        snapshot_json={
            "phases": [
                {
                    "id": client_phase_id,
                    "num": "01",
                    "name": "Planning",
                    "color": "#64748b",
                    "status": "active",
                    "progress": 0,
                    "tasks": [
                        {
                            "id": client_task_id,
                            "title": "Claimed task",
                            "done": False,
                            "claimedBy": "Expired participant",
                            "claimedById": participant_id,
                            "claimedAt": (NOW - timedelta(days=10)).isoformat(),
                        }
                    ],
                }
            ]
        },
    )
    participant = Participant(
        id=participant_id,
        roadmap_id=roadmap.id,
        display_name="Expired participant",
        role="editor",
        session_token_hash="hash-claim-cleanup",
        session_expires_at=NOW - timedelta(days=10),
    )
    phase = RoadmapPhase(
        id="rph_claim_cleanup",
        roadmap_id=roadmap.id,
        client_phase_id=client_phase_id,
        position=0,
        num="01",
        name="Planning",
        color="#64748b",
        status="active",
        progress=0,
    )
    task = RoadmapTask(
        id="rt_claim_cleanup",
        roadmap_id=roadmap.id,
        phase_id=phase.id,
        client_task_id=client_task_id,
        position=0,
        title="Claimed task",
        done=False,
        claimed_by_display_name=participant.display_name,
        claimed_by_participant_id=participant.id,
        claimed_at=NOW - timedelta(days=10),
    )
    db_session.add_all([roadmap, participant, phase, task])
    await db_session.flush()

    plan = await build_retention_plan(db_session, RetentionPolicy(), now=NOW)
    assert plan.participant_ids == (participant.id,)
    assert plan.task_claims_to_clear == 1

    result = await execute_retention_plan(db_session, plan)
    assert result.expired_or_revoked_sessions == 1
    assert result.stale_task_claims == 1

    await db_session.refresh(roadmap)
    await db_session.refresh(task)
    snapshot_task = roadmap.snapshot_json["phases"][0]["tasks"][0]
    assert "claimedBy" not in snapshot_task
    assert "claimedById" not in snapshot_task
    assert "claimedAt" not in snapshot_task
    assert task.claimed_by_display_name is None
    assert task.claimed_by_participant_id is None
    assert task.claimed_at is None


@pytest.mark.asyncio
async def test_execute_hard_deletes_old_soft_deleted_tree_and_is_idempotent(
    db_session: AsyncSession,
) -> None:
    roadmap = _roadmap("rm_purge", deleted_at=NOW - timedelta(days=45))
    db_session.add(roadmap)
    await db_session.flush()

    participant = Participant(
        id="pt_purge",
        roadmap_id=roadmap.id,
        display_name="Participant",
        role="owner",
        session_token_hash="hash-purge",
        session_expires_at=NOW - timedelta(days=40),
    )
    db_session.add(participant)
    await db_session.flush()

    db_session.add_all(
        [
            ActivityLog(
                id="al_purge",
                roadmap_id=roadmap.id,
                participant_id=participant.id,
                actor_name="Participant",
                action="roadmap.deleted",
                created_at=NOW - timedelta(days=45),
            ),
            RoadmapVersion(
                id="rv_purge",
                roadmap_id=roadmap.id,
                version_number=1,
                roadmap_name=roadmap.name,
                snapshot_json={"phases": []},
                participant_id=participant.id,
                action="roadmap.checkpoint",
                created_at=NOW - timedelta(days=50),
            ),
        ]
    )
    await db_session.flush()

    policy = RetentionPolicy(deleted_roadmap_days=30, session_grace_days=7)
    plan = await build_retention_plan(db_session, policy, now=NOW)
    assert plan.roadmap_ids == (roadmap.id,)

    result = await execute_retention_plan(db_session, plan)
    assert result.soft_deleted_roadmaps == 1

    for model, row_id in [
        (Roadmap, "rm_purge"),
        (Participant, "pt_purge"),
        (ActivityLog, "al_purge"),
        (RoadmapVersion, "rv_purge"),
    ]:
        assert await db_session.scalar(sa.select(model.id).where(model.id == row_id)) is None

    rerun = await execute_retention_plan(db_session, plan)
    assert rerun.total_rows == 0


@pytest.mark.asyncio
async def test_batch_limit_is_applied_per_category(db_session: AsyncSession) -> None:
    for index in range(3):
        db_session.add(
            _roadmap(
                f"rm_batch_{index}",
                deleted_at=NOW - timedelta(days=45 + index),
            )
        )
    await db_session.flush()

    plan = await build_retention_plan(
        db_session,
        RetentionPolicy(batch_limit=2),
        now=NOW,
    )

    assert len(plan.roadmap_ids) == 2
