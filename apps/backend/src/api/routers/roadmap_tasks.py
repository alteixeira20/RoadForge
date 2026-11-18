from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.schemas.roadmap import (
    PatchTaskDoneRequest,
    PatchTaskRequest,
    RoadmapConflictResponse,
    RoadmapResponse,
)
from api.services.auth_service import require_participant
from api.services.rate_limit_service import rate_limiter
from api.services.roadmap_service import RoadmapConflictError
from api.services.roadmap_task_service import (
    delete_task_claim,
    patch_task,
    patch_task_claim,
    patch_task_done,
)

router = APIRouter(tags=["roadmaps"])
_OWNER_EDITOR = {"owner", "editor"}


def _participant_rate_key(participant_id: str, roadmap_id: str) -> str:
    return f"{participant_id}:{roadmap_id}"


@router.patch(
    "/{roadmap_id}/tasks/{task_id}",
    response_model=RoadmapResponse,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def patch_roadmap_task(
    roadmap_id: str,
    task_id: str,
    payload: PatchTaskRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.update.patch",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    try:
        return await patch_task(db, roadmap_id, task_id, payload, participant)
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))


@router.patch(
    "/{roadmap_id}/tasks/{task_id}/done",
    response_model=RoadmapResponse,
    responses={409: {"model": RoadmapConflictResponse}},
)
async def patch_roadmap_task_done(
    roadmap_id: str,
    task_id: str,
    payload: PatchTaskDoneRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.done.patch",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    try:
        return await patch_task_done(db, roadmap_id, task_id, payload, participant)
    except RoadmapConflictError as exc:
        return JSONResponse(status_code=409, content=exc.response.model_dump(mode="json"))


@router.patch(
    "/{roadmap_id}/tasks/{task_id}/claim",
    response_model=RoadmapResponse,
)
async def patch_roadmap_task_claim(
    roadmap_id: str,
    task_id: str,
    override: bool = False,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.claim.patch",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await patch_task_claim(db, roadmap_id, task_id, participant, override=override)


@router.delete(
    "/{roadmap_id}/tasks/{task_id}/claim",
    response_model=RoadmapResponse,
)
async def delete_roadmap_task_claim(
    roadmap_id: str,
    task_id: str,
    override: bool = False,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.claim.delete",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await delete_task_claim(db, roadmap_id, task_id, participant, override=override)
