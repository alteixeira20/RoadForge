"""Focused task structure and dependency collaboration routes."""

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.schemas.roadmap import RoadmapResponse
from api.schemas.task_structure import CreateTaskStructureRequest, ReorderTaskStructureRequest
from api.services.auth_service import require_participant
from api.services.rate_limit_service import rate_limiter
from api.services.task_structure_service import (
    create_task,
    delete_task,
    reorder_subtasks,
    reorder_top_level_tasks,
    set_task_dependency,
)

router = APIRouter(tags=["roadmaps"])
_OWNER_EDITOR = {"owner", "editor"}


def _participant_rate_key(participant_id: str, roadmap_id: str) -> str:
    return f"{participant_id}:{roadmap_id}"


@router.post(
    "/{roadmap_id}/phases/{phase_id}/tasks",
    response_model=RoadmapResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_roadmap_task(
    roadmap_id: str,
    phase_id: str,
    payload: CreateTaskStructureRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.create.post",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await create_task(db, roadmap_id, phase_id, payload, participant)


@router.delete("/{roadmap_id}/tasks/{task_id}", response_model=RoadmapResponse)
async def delete_roadmap_task(
    roadmap_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.delete",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
    return await delete_task(db, roadmap_id, task_id, participant)


@router.put(
    "/{roadmap_id}/phases/{phase_id}/tasks/order",
    response_model=RoadmapResponse,
)
async def reorder_roadmap_tasks(
    roadmap_id: str,
    phase_id: str,
    payload: ReorderTaskStructureRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.reorder.put",
        _participant_rate_key(participant.id, roadmap_id),
        limit=180,
        window_seconds=60,
    )
    return await reorder_top_level_tasks(db, roadmap_id, phase_id, payload, participant)


@router.put(
    "/{roadmap_id}/tasks/{parent_id}/subtasks/order",
    response_model=RoadmapResponse,
)
async def reorder_roadmap_subtasks(
    roadmap_id: str,
    parent_id: str,
    payload: ReorderTaskStructureRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "subtask.reorder.put",
        _participant_rate_key(participant.id, roadmap_id),
        limit=180,
        window_seconds=60,
    )
    return await reorder_subtasks(db, roadmap_id, parent_id, payload, participant)


@router.put(
    "/{roadmap_id}/tasks/{task_id}/dependencies/{dependency_id}",
    response_model=RoadmapResponse,
)
async def link_task_dependency(
    roadmap_id: str,
    task_id: str,
    dependency_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.dependency.put",
        _participant_rate_key(participant.id, roadmap_id),
        limit=180,
        window_seconds=60,
    )
    return await set_task_dependency(
        db,
        roadmap_id,
        task_id,
        dependency_id,
        participant,
        linked=True,
    )


@router.delete(
    "/{roadmap_id}/tasks/{task_id}/dependencies/{dependency_id}",
    response_model=RoadmapResponse,
)
async def unlink_task_dependency(
    roadmap_id: str,
    task_id: str,
    dependency_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.dependency.delete",
        _participant_rate_key(participant.id, roadmap_id),
        limit=180,
        window_seconds=60,
    )
    return await set_task_dependency(
        db,
        roadmap_id,
        task_id,
        dependency_id,
        participant,
        linked=False,
    )
