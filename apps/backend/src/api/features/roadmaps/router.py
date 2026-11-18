from fastapi import APIRouter, Depends, Header, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.features.roadmaps.conflict_schemas import RoadmapConflictResponse
from api.features.roadmaps.conflicts import RoadmapConflictError
from api.features.roadmaps.core_schemas import (
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    DeleteRoadmapResponse,
    RoadmapResponse,
    UpdateRoadmapRequest,
)
from api.features.roadmaps.service import (
    create_roadmap,
    delete_roadmap,
    get_roadmap,
    update_roadmap,
)
from api.shared.auth.auth_service import require_participant
from api.shared.auth.session_policy import ALL_ROLES, OWNER_EDITOR, OWNER_ONLY
from api.shared.security.client_ip_service import extract_client_ip
from api.shared.security.rate_limit_service import enforce_rate_limit, participant_rate_key

router = APIRouter(tags=["roadmaps"])


@router.post("", response_model=CreateRoadmapResponse, status_code=status.HTTP_201_CREATED)
async def post_roadmap(
    request: Request,
    payload: CreateRoadmapRequest,
    db: AsyncSession = Depends(get_db),
) -> CreateRoadmapResponse:
    settings = get_settings()
    await enforce_rate_limit(
          "roadmap.create.ip", extract_client_ip(request),
          limit=settings.max_roadmaps_created_per_hour,
    )
    return await create_roadmap(
        db, payload, settings.web_base_url, settings.max_server_roadmaps
    )


@router.get("/{roadmap_id}", response_model=RoadmapResponse)
async def fetch_roadmap(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(
        db, roadmap_id, authorization, ALL_ROLES
    )
    await enforce_rate_limit("roadmap.read", participant_rate_key(participant.id, roadmap_id))
    return await get_roadmap(db, roadmap_id)


@router.put(
    "/{roadmap_id}",
    response_model=RoadmapResponse,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def put_roadmap(
    roadmap_id: str,
    payload: UpdateRoadmapRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("roadmap.update", participant_rate_key(participant.id, roadmap_id))
    try:
        return await update_roadmap(db, roadmap_id, payload, participant)
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))


@router.delete("/{roadmap_id}", response_model=DeleteRoadmapResponse)
async def remove_roadmap(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> DeleteRoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_ONLY)
    await enforce_rate_limit("roadmap.delete", participant_rate_key(participant.id, roadmap_id))
    result = await delete_roadmap(db, roadmap_id, participant)
    return DeleteRoadmapResponse(**result)
