from datetime import datetime

from fastapi import APIRouter, Depends, Header, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.schemas.roadmap import (
    CreateTagRequest,
    RoadmapConflictResponse,
    RoadmapResponse,
    TagResponse,
    UpdateTagRequest,
)
from api.services.auth_service import require_participant
from api.services.rate_limit_service import rate_limiter
from api.services.roadmap_service import RoadmapConflictError
from api.services.roadmap_tag_service import (
    create_tag,
    delete_tag,
    list_tags,
    update_tag,
)

router = APIRouter(tags=["roadmaps"])
_OWNER_EDITOR = {"owner", "editor"}


def _participant_rate_key(participant_id: str, roadmap_id: str) -> str:
    return f"{participant_id}:{roadmap_id}"


@router.get("/{roadmap_id}/tags", response_model=list[TagResponse])
async def fetch_tags(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> list[TagResponse]:
    participant = await require_participant(
        db,
        roadmap_id,
        authorization,
        {"owner", "editor", "viewer"},
    )
    await rate_limiter.enforce(
        "tag.read",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await list_tags(db, roadmap_id)


@router.post(
    "/{roadmap_id}/tags",
    response_model=RoadmapResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def post_tag(
    roadmap_id: str,
    payload: CreateTagRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "tag.create",
        _participant_rate_key(participant.id, roadmap_id),
        limit=60,
        window_seconds=60,
    )
    try:
        return await create_tag(db, roadmap_id, payload, participant)
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))


@router.put(
    "/{roadmap_id}/tags/{tag_id}",
    response_model=RoadmapResponse,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def put_tag(
    roadmap_id: str,
    tag_id: str,
    payload: UpdateTagRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "tag.update",
        _participant_rate_key(participant.id, roadmap_id),
        limit=60,
        window_seconds=60,
    )
    try:
        return await update_tag(db, roadmap_id, tag_id, payload, participant)
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))


@router.delete(
    "/{roadmap_id}/tags/{tag_id}",
    response_model=RoadmapResponse,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def remove_tag(
    roadmap_id: str,
    tag_id: str,
    last_updated_at: datetime = Query(...),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "tag.delete",
        _participant_rate_key(participant.id, roadmap_id),
        limit=60,
        window_seconds=60,
    )
    try:
        return await delete_tag(
            db,
            roadmap_id,
            tag_id,
            last_updated_at,
            participant,
        )
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))
