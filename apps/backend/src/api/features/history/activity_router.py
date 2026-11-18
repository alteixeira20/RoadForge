from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.features.history.activity_schemas import ActivityLogListResponse
from api.features.history.activity_service import get_activity_logs
from api.shared.auth.auth_service import require_participant
from api.shared.auth.session_policy import ALL_ROLES
from api.shared.security.rate_limit_service import enforce_rate_limit, participant_rate_key

router = APIRouter(tags=["roadmaps"])


@router.get("/{roadmap_id}/activity", response_model=ActivityLogListResponse)
async def fetch_activity_logs(
    roadmap_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> ActivityLogListResponse:
    participant = await require_participant(
        db, roadmap_id, authorization, ALL_ROLES
    )
    await enforce_rate_limit("activity.read", participant_rate_key(participant.id, roadmap_id))
    return await get_activity_logs(db, roadmap_id, limit, offset)
