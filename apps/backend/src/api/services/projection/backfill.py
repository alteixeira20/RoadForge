from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import Roadmap
from api.services.projection.parity import report_roadmap_projection_drift
from api.services.projection.sync import rebuild_roadmap_projection
from api.services.projection.types import (
    ProjectionBackfillResult,
    ProjectionDriftReport,
)


def _active_roadmaps_stmt(limit: int | None = None):
    stmt = (
        select(Roadmap)
        .where(Roadmap.deleted_at.is_(None))
        .order_by(Roadmap.created_at.asc())
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    return stmt


async def _active_roadmaps(
    db: AsyncSession,
    limit: int | None = None,
) -> list[Roadmap]:
    result = await db.execute(_active_roadmaps_stmt(limit))
    return list(result.scalars().all())


async def backfill_all_roadmap_projections(
    db: AsyncSession,
    limit: int | None = None,
) -> int:
    roadmaps = await _active_roadmaps(db, limit)

    count = 0
    for roadmap in roadmaps:
        await rebuild_roadmap_projection(db, roadmap)
        await db.commit()
        count += 1
    return count


async def report_projection_drift(
    db: AsyncSession,
    limit: int | None = None,
) -> ProjectionDriftReport:
    roadmaps = await _active_roadmaps(db, limit)
    findings = []
    successful_parity_count = 0

    for roadmap in roadmaps:
        finding = await report_roadmap_projection_drift(db, roadmap)
        findings.append(finding)
        if finding.ok:
            successful_parity_count += 1

    return ProjectionDriftReport(
        checked_count=len(findings),
        successful_parity_count=successful_parity_count,
        drift_count=len(findings) - successful_parity_count,
        findings=findings,
    )


async def backfill_and_report_projection_drift(
    db: AsyncSession,
    limit: int | None = None,
    *,
    verify: bool = False,
) -> ProjectionBackfillResult:
    backfilled_count = await backfill_all_roadmap_projections(db, limit=limit)
    drift_report = await report_projection_drift(db, limit=limit) if verify else None
    return ProjectionBackfillResult(
        backfilled_count=backfilled_count,
        drift_report=drift_report,
    )
