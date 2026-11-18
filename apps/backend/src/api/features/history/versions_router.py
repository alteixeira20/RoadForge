from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.features.history.version_schemas import (
    CheckpointResponse,
    RestoreRoadmapVersionRequest,
    RoadmapVersionDetailResponse,
    RoadmapVersionSummaryResponse,
)
from api.features.history.version_service import (
    create_roadmap_checkpoint,
    get_roadmap_version,
    get_roadmap_versions,
    restore_roadmap_version,
)
from api.features.roadmaps.conflict_schemas import RoadmapConflictResponse
from api.features.roadmaps.conflicts import RoadmapConflictError
from api.features.roadmaps.core_schemas import RoadmapResponse
from api.shared.auth.auth_service import require_participant
from api.shared.auth.session_policy import OWNER_EDITOR, OWNER_ONLY
from api.shared.security.rate_limit_service import enforce_rate_limit, participant_rate_key

router = APIRouter(tags=["roadmaps"])


@router.get("/{roadmap_id}/versions", response_model=list[RoadmapVersionSummaryResponse])
async def fetch_roadmap_versions(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[RoadmapVersionSummaryResponse]:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("versions.read", participant_rate_key(participant.id, roadmap_id))
    return await get_roadmap_versions(db, roadmap_id)


@router.post("/{roadmap_id}/versions/checkpoint", response_model=CheckpointResponse)
async def post_checkpoint(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CheckpointResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit(
          "versions.checkpoint", participant_rate_key(participant.id, roadmap_id),
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("version.read", participant_rate_key(participant.id, roadmap_id))
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_ONLY)
    await enforce_rate_limit("versions.restore", participant_rate_key(participant.id, roadmap_id))
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
