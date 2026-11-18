'Roadmap activity history reads.'

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.features.history.activity_schemas import ActivityLogListResponse, ActivityLogResponse
from api.features.roadmaps.queries import fetch_active_roadmap
from api.models.roadmap import ActivityLog


async def get_activity_logs(
    db: AsyncSession,
    roadmap_id: str,
    limit: int = 100,
    offset: int = 0,
) -> ActivityLogListResponse:
    await fetch_active_roadmap(db, roadmap_id)

    safe_limit = min(limit, 200)
    stmt = (
        select(ActivityLog)
        .where(ActivityLog.roadmap_id == roadmap_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(safe_limit + 1)
        .offset(offset)
    )
    result = await db.execute(stmt)
    logs = result.scalars().all()

    has_more = len(logs) > safe_limit
    return_logs = logs[:safe_limit]

    return ActivityLogListResponse(
        logs=[
            ActivityLogResponse(
                id=activity.id,
                roadmap_id=activity.roadmap_id,
                participant_id=activity.participant_id,
                actor_name=activity.actor_name,
                action=activity.action,
                entity_type=activity.entity_type,
                entity_id=activity.entity_id,
                before_json=activity.before_json,
                after_json=activity.after_json,
                metadata_json=activity.metadata_json,
                created_at=activity.created_at,
            )
            for activity in return_logs
        ],
        has_more=has_more,
    )
