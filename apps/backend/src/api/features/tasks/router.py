from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.features.roadmaps.conflict_schemas import RoadmapConflictResponse
from api.features.roadmaps.conflicts import RoadmapConflictError
from api.features.roadmaps.core_schemas import RoadmapResponse
from api.features.tasks.service import (
    delete_task_claim,
    patch_task,
    patch_task_claim,
    patch_task_done,
)
from api.features.tasks.task_schemas import PatchTaskDoneRequest, PatchTaskRequest
from api.shared.auth.auth_service import require_participant
from api.shared.auth.session_policy import OWNER_EDITOR
from api.shared.security.rate_limit_service import enforce_rate_limit, participant_rate_key

router = APIRouter(tags=["roadmaps"])


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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("task.update.patch", participant_rate_key(participant.id, roadmap_id))
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("task.done.patch", participant_rate_key(participant.id, roadmap_id))
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("task.claim.patch", participant_rate_key(participant.id, roadmap_id))
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("task.claim.delete", participant_rate_key(participant.id, roadmap_id))
    return await delete_task_claim(db, roadmap_id, task_id, participant, override=override)
