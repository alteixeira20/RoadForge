from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.models.roadmap import ActivityLog


async def enforce_activity_log_cap(db: AsyncSession, roadmap_id: str) -> None:
    """Keep newest activity rows and delete overflow inside the caller transaction."""
    await db.flush()
    limit = get_settings().max_activity_logs_per_roadmap
    overflow_ids = (
        sa.select(ActivityLog.id)
        .where(ActivityLog.roadmap_id == roadmap_id)
        .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
        .offset(limit)
    )
    await db.execute(
        sa.delete(ActivityLog).where(ActivityLog.id.in_(overflow_ids))
    )
