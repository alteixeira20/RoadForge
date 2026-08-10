from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from api.models.roadmap import ActivityLog, Participant, Roadmap, RoadmapVersion


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
    participant_ids: tuple[str, ...]
    activity_ids: tuple[str, ...]
    version_ids: tuple[str, ...]
    roadmap_ids: tuple[str, ...]

    @property
    def total_rows(self) -> int:
        return (
            len(self.participant_ids)
            + len(self.activity_ids)
            + len(self.version_ids)
            + len(self.roadmap_ids)
        )

    def counts(self) -> dict[str, int]:
        return {
            "expired_or_revoked_sessions": len(self.participant_ids),
            "old_activity_rows": len(self.activity_ids),
            "old_restore_points": len(self.version_ids),
            "soft_deleted_roadmaps": len(self.roadmap_ids),
            "total_rows": self.total_rows,
        }


@dataclass(frozen=True)
class RetentionResult:
    expired_or_revoked_sessions: int
    old_activity_rows: int
    old_restore_points: int
    soft_deleted_roadmaps: int

    @property
    def total_rows(self) -> int:
        return (
            self.expired_or_revoked_sessions
            + self.old_activity_rows
            + self.old_restore_points
            + self.soft_deleted_roadmaps
        )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def build_retention_plan(
    db: AsyncSession,
    policy: RetentionPolicy,
    *,
    now: datetime | None = None,
) -> RetentionPlan:
    """Return a bounded deletion plan without mutating the database.

    The plan stores opaque primary keys for execution but callers should report
    counts only. Roadmap names, snapshot content, participant names, tokens, and
    activity payloads never need to be printed by the operator command.
    """

    policy.validate()
    reference = now or _utc_now()
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)

    session_cutoff = reference - timedelta(days=policy.session_grace_days)
    activity_cutoff = reference - timedelta(days=policy.activity_days)
    version_cutoff = reference - timedelta(days=policy.version_days)
    roadmap_cutoff = reference - timedelta(days=policy.deleted_roadmap_days)

    participant_ids = tuple(
        (
            await db.execute(
                sa.select(Participant.id)
                .where(
                    sa.or_(
                        sa.and_(
                            Participant.revoked_at.is_not(None),
                            Participant.revoked_at <= session_cutoff,
                        ),
                        sa.and_(
                            Participant.session_expires_at.is_not(None),
                            Participant.session_expires_at <= session_cutoff,
                        ),
                    )
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

    newer = aliased(RoadmapVersion)
    newer_count = (
        sa.select(sa.func.count(newer.id))
        .where(
            newer.roadmap_id == RoadmapVersion.roadmap_id,
            newer.version_number > RoadmapVersion.version_number,
        )
        .correlate(RoadmapVersion)
        .scalar_subquery()
    )
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

    return RetentionPlan(
        participant_ids=participant_ids,
        activity_ids=activity_ids,
        version_ids=version_ids,
        roadmap_ids=roadmap_ids,
    )


async def execute_retention_plan(
    db: AsyncSession,
    plan: RetentionPlan,
) -> RetentionResult:
    """Delete exactly one previously-built bounded plan in one transaction.

    Direct SQL deletes intentionally rely on the database foreign-key actions:
    activity/version participant references become NULL and hard-deleted roadmap
    trees cascade. Re-running after a successful batch is safe because selected
    primary keys no longer exist.
    """

    async def _delete(model: type, ids: tuple[str, ...]) -> int:
        if not ids:
            return 0
        result = await db.execute(sa.delete(model).where(model.id.in_(ids)))
        return int(result.rowcount or 0)

    participant_count = await _delete(Participant, plan.participant_ids)
    activity_count = await _delete(ActivityLog, plan.activity_ids)
    version_count = await _delete(RoadmapVersion, plan.version_ids)
    roadmap_count = await _delete(Roadmap, plan.roadmap_ids)

    await db.commit()

    return RetentionResult(
        expired_or_revoked_sessions=participant_count,
        old_activity_rows=activity_count,
        old_restore_points=version_count,
        soft_deleted_roadmaps=roadmap_count,
    )
