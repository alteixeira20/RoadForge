from fastapi import APIRouter, Depends, Header, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.database import get_db
from api.schemas.roadmap import (
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    DeleteRoadmapResponse,
    JoinRoadmapRequest,
    JoinRoadmapResponse,
    RoadmapConflictResponse,
    RoadmapResponse,
    UpdateRoadmapRequest,
)
from api.services.auth_service import require_participant
from api.services.client_ip_service import extract_client_ip
from api.services.rate_limit_service import rate_limiter
from api.services.roadmap_join_service import join_roadmap
from api.services.roadmap_service import (
    RoadmapConflictError,
    create_roadmap,
    delete_roadmap,
    get_roadmap,
    update_roadmap,
)

router = APIRouter(tags=["roadmaps"])
_OWNER_EDITOR = {"owner", "editor"}
_OWNER_ONLY = {"owner"}


def _participant_rate_key(participant_id: str, roadmap_id: str) -> str:
    return f"{participant_id}:{roadmap_id}"


@router.post("", response_model=CreateRoadmapResponse, status_code=status.HTTP_201_CREATED)
async def post_roadmap(
    request: Request,
    payload: CreateRoadmapRequest,
    db: AsyncSession = Depends(get_db),
) -> CreateRoadmapResponse:
    await rate_limiter.enforce(
        "roadmap.create.ip", extract_client_ip(request), limit=10, window_seconds=3600
    )
    settings = get_settings()
    return await create_roadmap(
        db, payload, settings.web_base_url, settings.max_server_roadmaps
    )


@router.post("/join", response_model=JoinRoadmapResponse)
async def post_join(
    request: Request,
    payload: JoinRoadmapRequest,
    db: AsyncSession = Depends(get_db),
) -> JoinRoadmapResponse:
    client_ip = extract_client_ip(request)
    await rate_limiter.enforce("join.ip", client_ip, limit=20, window_seconds=60)
    return await join_roadmap(db, payload, client_ip)


@router.get("/{roadmap_id}", response_model=RoadmapResponse)
async def fetch_roadmap(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(
        db, roadmap_id, authorization, {"owner", "editor", "viewer"}
    )
    await rate_limiter.enforce(
        "roadmap.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=240,
        window_seconds=60,
    )
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "roadmap.update",
        _participant_rate_key(participant.id, roadmap_id),
        limit=60,
        window_seconds=60,
    )
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_ONLY)
    await rate_limiter.enforce(
        "roadmap.delete",
        _participant_rate_key(participant.id, roadmap_id),
        limit=10,
        window_seconds=60,
    )
    result = await delete_roadmap(db, roadmap_id, participant)
    return DeleteRoadmapResponse(**result)
