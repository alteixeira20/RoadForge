from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.schemas.roadmap import (
    CheckpointResponse,
    RestoreRoadmapVersionRequest,
    RoadmapConflictResponse,
    RoadmapResponse,
    RoadmapVersionDetailResponse,
    RoadmapVersionSummaryResponse,
)
from api.services.auth_service import require_participant
from api.services.rate_limit_service import rate_limiter
from api.services.roadmap_service import RoadmapConflictError
from api.services.version_service import (
    create_roadmap_checkpoint,
    get_roadmap_version,
    get_roadmap_versions,
    restore_roadmap_version,
)

router = APIRouter(tags=["roadmaps"])
_OWNER_EDITOR = {"owner", "editor"}
_OWNER_ONLY = {"owner"}


def _participant_rate_key(participant_id: str, roadmap_id: str) -> str:
    return f"{participant_id}:{roadmap_id}"


@router.get("/{roadmap_id}/versions", response_model=list[RoadmapVersionSummaryResponse])
async def fetch_roadmap_versions(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[RoadmapVersionSummaryResponse]:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "versions.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await get_roadmap_versions(db, roadmap_id)


@router.post("/{roadmap_id}/versions/checkpoint", response_model=CheckpointResponse)
async def post_checkpoint(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CheckpointResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "versions.checkpoint",
        _participant_rate_key(participant.id, roadmap_id),
        limit=10,
        window_seconds=60,
    )
    created, version = await create_roadmap_checkpoint(db, roadmap_id, participant)
    return CheckpointResponse(created=created, version=version)


@router.get("/{roadmap_id}/versions/{version_id}", response_model=RoadmapVersionDetailResponse)
async def fetch_roadmap_version(
    roadmap_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapVersionDetailResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "version.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await get_roadmap_version(db, roadmap_id, version_id)


@router.post(
    "/{roadmap_id}/versions/{version_id}/restore",
    response_model=RoadmapResponse,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def post_restore_roadmap_version(
    roadmap_id: str,
    version_id: str,
    payload: RestoreRoadmapVersionRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await rate_limiter.enforce(
        "versions.restore",
        _participant_rate_key(participant.id, roadmap_id),
        limit=10,
        window_seconds=60,
    )
    try:
        return await restore_roadmap_version(
            db,
            roadmap_id,
            version_id,
            participant,
            payload.last_updated_at,
            force=payload.force,
        )
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))
