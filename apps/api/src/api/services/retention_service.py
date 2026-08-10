from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from api.models.roadmap import (
    ActivityLog,
    Participant,
    Roadmap,
    RoadmapTask,
    RoadmapVersion,
)
from api.services.roadmap_helpers import _patch_task_claim_snapshot


MIN_SESSION_GRACE_DAYS = 1
MIN_ACTIVITY_DAYS = 30
MIN_VERSION_DAYS = 30
MIN_DELETED_ROADMAP_DAYS = 7
MAX_BATCH_LIMIT = 1_000


@dataclass(frozen=True)
class RetentionPolicy:
    """Operator-controlled retention thresholds.

    Thresholds are intentionally conservative and validated again in the service
    layer so callers cannot bypass CLI safeguards accidentally.
    """

    session_grace_days: int = 7
    activity_days: int = 180
    version_days: int = 90
    deleted_roadmap_days: int = 30
    preserve_versions_per_roadmap: int = 3
    batch_limit: int = 100

    def validate(self) -> None:
        minimums = {
            "session_grace_days": (self.session_grace_days, MIN_SESSION_GRACE_DAYS),
            "activity_days": (self.activity_days, MIN_ACTIVITY_DAYS),
            "version_days": (self.version_days, MIN_VERSION_DAYS),
            "deleted_roadmap_days": (
                self.deleted_roadmap_days,
                MIN_DELETED_ROADMAP_DAYS,
            ),
        }
        for name, (value, minimum) in minimums.items():
            if value < minimum:
                raise ValueError(f"{name} must be at least {minimum}")

        if self.preserve_versions_per_roadmap < 1:
            raise ValueError("preserve_versions_per_roadmap must be at least 1")
        if not 1 <= self.batch_limit <= MAX_BATCH_LIMIT:
            raise ValueError(f"batch_limit must be between 1 and {MAX_BATCH_LIMIT}")


@dataclass(frozen=True)
class RetentionPlan:
    policy: RetentionPolicy
    reference_time: datetime
    participant_ids: tuple[str, ...]
    activity_ids: tuple[str, ...]
    version_ids: tuple[str, ...]
    roadmap_ids: tuple[str, ...]
    task_claims_to_clear: int

    @property
    def total_rows(self) -> int:
        """Rows selected for deletion, excluding task-claim field updates."""

        return (
            len(self.participant_ids)
            + len(self.activity_ids)
            + len(self.version_ids)
            + len(self.roadmap_ids)
        )

    def counts(self) -> dict[str, int]:
        return {
            "expired_or_revoked_sessions": len(self.participant_ids),
            "stale_task_claims": self.task_claims_to_clear,
            "old_activity_rows": len(self.activity_ids),
            "old_restore_points": len(self.version_ids),
            "soft_deleted_roadmaps": len(self.roadmap_ids),
            "total_rows": self.total_rows,
        }


@dataclass(frozen=True)
class RetentionResult:
    expired_or_revoked_sessions: int
    stale_task_claims: int
    old_activity_rows: int
    old_restore_points: int
    soft_deleted_roadmaps: int

    @property
    def total_rows(self) -> int:
        """Rows deleted directly, excluding task-claim field updates and DB cascades."""

        return (
            self.expired_or_revoked_sessions
            + self.old_activity_rows
            + self.old_restore_points
            + self.soft_deleted_roadmaps
        )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalise_reference(now: datetime | None) -> datetime:
    reference = now or _utc_now()
    if reference.tzinfo is None:
        return reference.replace(tzinfo=timezone.utc)
    return reference.astimezone(timezone.utc)


def _cutoffs(policy: RetentionPolicy, reference: datetime) -> tuple[datetime, ...]:
    return (
        reference - timedelta(days=policy.session_grace_days),
        reference - timedelta(days=policy.activity_days),
        reference - timedelta(days=policy.version_days),
        reference - timedelta(days=policy.deleted_roadmap_days),
    )


def _version_newer_count() -> sa.ScalarSelect:
    newer = aliased(RoadmapVersion)
    return (
        sa.select(sa.func.count(newer.id))
        .where(
            newer.roadmap_id == RoadmapVersion.roadmap_id,
            newer.version_number > RoadmapVersion.version_number,
        )
        .correlate(RoadmapVersion)
        .scalar_subquery()
    )


async def build_retention_plan(
    db: AsyncSession,
    policy: RetentionPolicy,
    *,
    now: datetime | None = None,
) -> RetentionPlan:
    """Return a bounded deletion plan without mutating or locking application rows.

    The plan stores opaque primary keys for execution but callers should report
    counts only. Roadmap names, snapshot content, participant names, tokens, and
    activity payloads never need to be printed by the operator command.
    """

    policy.validate()
    reference = _normalise_reference(now)
    session_cutoff, activity_cutoff, version_cutoff, roadmap_cutoff = _cutoffs(
        policy, reference
    )

    roadmap_ids = tuple(
        (
            await db.execute(
                sa.select(Roadmap.id)
                .where(
                    Roadmap.deleted_at.is_not(None),
                    Roadmap.deleted_at <= roadmap_cutoff,
                )
                .order_by(Roadmap.deleted_at, Roadmap.id)
                .limit(policy.batch_limit)
            )
        )
        .scalars()
        .all()
    )

    # Participants belonging to roadmaps already eligible for final hard purge
    # are intentionally excluded: the roadmap cascade owns those rows and the
    # operator report should not double-count them as an independent session purge.
    participant_ids = tuple(
        (
            await db.execute(
                sa.select(Participant.id)
                .join(Roadmap, Roadmap.id == Participant.roadmap_id)
                .where(
                    sa.or_(
                        Roadmap.deleted_at.is_(None),
                        Roadmap.deleted_at > roadmap_cutoff,
                    ),
                    sa.or_(
                        sa.and_(
                            Participant.revoked_at.is_not(None),
                            Participant.revoked_at <= session_cutoff,
                        ),
                        sa.and_(
                            Participant.session_expires_at.is_not(None),
                            Participant.session_expires_at <= session_cutoff,
                        ),
                    ),
                )
                .order_by(
                    sa.func.coalesce(
                        Participant.revoked_at,
                        Participant.session_expires_at,
                    ),
                    Participant.id,
                )
                .limit(policy.batch_limit)
            )
        )
        .scalars()
        .all()
    )

    task_claims_to_clear = 0
    if participant_ids:
        task_claims_to_clear = int(
            (
                await db.scalar(
                    sa.select(sa.func.count(RoadmapTask.id)).where(
                        RoadmapTask.claimed_by_participant_id.in_(participant_ids)
                    )
                )
            )
            or 0
        )

    activity_ids = tuple(
        (
            await db.execute(
                sa.select(ActivityLog.id)
                .join(Roadmap, Roadmap.id == ActivityLog.roadmap_id)
                .where(
                    Roadmap.deleted_at.is_(None),
                    ActivityLog.created_at <= activity_cutoff,
                )
                .order_by(ActivityLog.created_at, ActivityLog.id)
                .limit(policy.batch_limit)
            )
        )
        .scalars()
        .all()
    )

    newer_count = _version_newer_count()
    version_ids = tuple(
        (
            await db.execute(
                sa.select(RoadmapVersion.id)
                .join(Roadmap, Roadmap.id == RoadmapVersion.roadmap_id)
                .where(
                    Roadmap.deleted_at.is_(None),
                    RoadmapVersion.created_at <= version_cutoff,
                    newer_count >= policy.preserve_versions_per_roadmap,
                )
                .order_by(RoadmapVersion.created_at, RoadmapVersion.id)
                .limit(policy.batch_limit)
            )
        )
        .scalars()
        .all()
    )

    return RetentionPlan(
        policy=policy,
        reference_time=reference,
        participant_ids=participant_ids,
        activity_ids=activity_ids,
        version_ids=version_ids,
        roadmap_ids=roadmap_ids,
        task_claims_to_clear=task_claims_to_clear,
    )


async def _eligible_roadmap_ids(db: AsyncSession, plan: RetentionPlan) -> tuple[str, ...]:
    if not plan.roadmap_ids:
        return ()
    *_, roadmap_cutoff = _cutoffs(plan.policy, plan.reference_time)
    return tuple(
        (
            await db.execute(
                sa.select(Roadmap.id)
                .where(
                    Roadmap.id.in_(plan.roadmap_ids),
                    Roadmap.deleted_at.is_not(None),
                    Roadmap.deleted_at <= roadmap_cutoff,
                )
                .order_by(Roadmap.deleted_at, Roadmap.id)
                .with_for_update(of=Roadmap, skip_locked=True)
            )
        )
        .scalars()
        .all()
    )


async def _eligible_participant_ids(
    db: AsyncSession,
    plan: RetentionPlan,
) -> tuple[str, ...]:
    if not plan.participant_ids:
        return ()
    session_cutoff, _, _, roadmap_cutoff = _cutoffs(plan.policy, plan.reference_time)
    return tuple(
        (
            await db.execute(
                sa.select(Participant.id)
                .join(Roadmap, Roadmap.id == Participant.roadmap_id)
                .where(
                    Participant.id.in_(plan.participant_ids),
                    sa.or_(
                        Roadmap.deleted_at.is_(None),
                        Roadmap.deleted_at > roadmap_cutoff,
                    ),
                    sa.or_(
                        sa.and_(
                            Participant.revoked_at.is_not(None),
                            Participant.revoked_at <= session_cutoff,
                        ),
                        sa.and_(
                            Participant.session_expires_at.is_not(None),
                            Participant.session_expires_at <= session_cutoff,
                        ),
                    ),
                )
                .order_by(Participant.id)
                .with_for_update(of=Participant, skip_locked=True)
            )
        )
        .scalars()
        .all()
    )


async def _eligible_activity_ids(db: AsyncSession, plan: RetentionPlan) -> tuple[str, ...]:
    if not plan.activity_ids:
        return ()
    _, activity_cutoff, _, _ = _cutoffs(plan.policy, plan.reference_time)
    return tuple(
        (
            await db.execute(
                sa.select(ActivityLog.id)
                .join(Roadmap, Roadmap.id == ActivityLog.roadmap_id)
                .where(
                    ActivityLog.id.in_(plan.activity_ids),
                    Roadmap.deleted_at.is_(None),
                    ActivityLog.created_at <= activity_cutoff,
                )
                .order_by(ActivityLog.created_at, ActivityLog.id)
            )
        )
        .scalars()
        .all()
    )


async def _eligible_version_ids(db: AsyncSession, plan: RetentionPlan) -> tuple[str, ...]:
    if not plan.version_ids:
        return ()
    _, _, version_cutoff, _ = _cutoffs(plan.policy, plan.reference_time)
    newer_count = _version_newer_count()
    return tuple(
        (
            await db.execute(
                sa.select(RoadmapVersion.id)
                .join(Roadmap, Roadmap.id == RoadmapVersion.roadmap_id)
                .where(
                    RoadmapVersion.id.in_(plan.version_ids),
                    Roadmap.deleted_at.is_(None),
                    RoadmapVersion.created_at <= version_cutoff,
                    newer_count >= plan.policy.preserve_versions_per_roadmap,
                )
                .order_by(RoadmapVersion.created_at, RoadmapVersion.id)
            )
        )
        .scalars()
        .all()
    )


async def _clear_task_claims(
    db: AsyncSession,
    participant_ids: tuple[str, ...],
) -> int:
    if not participant_ids:
        return 0

    tasks = (
        (
            await db.execute(
                sa.select(RoadmapTask)
                .where(RoadmapTask.claimed_by_participant_id.in_(participant_ids))
                .order_by(RoadmapTask.roadmap_id, RoadmapTask.position, RoadmapTask.id)
                .with_for_update(of=RoadmapTask, skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    if not tasks:
        return 0

    by_roadmap: dict[str, list[RoadmapTask]] = defaultdict(list)
    for task in tasks:
        by_roadmap[task.roadmap_id].append(task)

    roadmaps = {
        roadmap.id: roadmap
        for roadmap in (
            (
                await db.execute(
                    sa.select(Roadmap)
                    .where(Roadmap.id.in_(tuple(by_roadmap)))
                    .with_for_update(of=Roadmap, skip_locked=True)
                )
            )
            .scalars()
            .all()
        )
    }

    mutation_time = _utc_now()
    cleared = 0
    selected_participants = set(participant_ids)

    for roadmap_id, roadmap_tasks in by_roadmap.items():
        roadmap = roadmaps.get(roadmap_id)
        if roadmap is None:
            continue
        snapshot = roadmap.snapshot_json
        snapshot_changed = False

        for task in roadmap_tasks:
            current_participant_id = task.claimed_by_participant_id
            if current_participant_id not in selected_participants:
                continue

            patched = _patch_task_claim_snapshot(
                snapshot,
                task.client_task_id,
                None,
                None,
                None,
            )
            if patched is not None:
                original_task = patched[2]
                snapshot_participant_id = original_task.get("claimedById")
                if (
                    snapshot_participant_id is not None
                    and snapshot_participant_id != current_participant_id
                ):
                    raise RuntimeError(
                        "roadmap snapshot/projection claim drift detected; "
                        "run projection verification before retention purge"
                    )
                if snapshot_participant_id == current_participant_id:
                    snapshot = patched[0]
                    snapshot_changed = True

            task.claimed_by_display_name = None
            task.claimed_by_participant_id = None
            task.claimed_at = None
            cleared += 1

        if snapshot_changed:
            roadmap.snapshot_json = snapshot
            roadmap.updated_at = mutation_time

    return cleared


async def execute_retention_plan(
    db: AsyncSession,
    plan: RetentionPlan,
) -> RetentionResult:
    """Revalidate and execute one bounded retention plan in one transaction.

    Destructive roots are re-checked against the plan's fixed reference time and
    locked before deletion. A concurrent session refresh or roadmap restore can
    therefore make a row ineligible rather than racing an unconditional delete.
    Task claims owned by sessions that remain eligible for deletion are cleared
    from both the canonical snapshot and relational projection first.
    """

    plan.policy.validate()

    roadmap_ids = await _eligible_roadmap_ids(db, plan)
    participant_ids = await _eligible_participant_ids(db, plan)
    activity_ids = await _eligible_activity_ids(db, plan)
    version_ids = await _eligible_version_ids(db, plan)

    task_claim_count = await _clear_task_claims(db, participant_ids)

    async def _delete(model: type, ids: tuple[str, ...]) -> int:
        if not ids:
            return 0
        result = await db.execute(sa.delete(model).where(model.id.in_(ids)))
        return int(result.rowcount or 0)

    participant_count = await _delete(Participant, participant_ids)
    activity_count = await _delete(ActivityLog, activity_ids)
    version_count = await _delete(RoadmapVersion, version_ids)
    roadmap_count = await _delete(Roadmap, roadmap_ids)

    await db.commit()

    return RetentionResult(
        expired_or_revoked_sessions=participant_count,
        stale_task_claims=task_claim_count,
        old_activity_rows=activity_count,
        old_restore_points=version_count,
        soft_deleted_roadmaps=roadmap_count,
    )
