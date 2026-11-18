"""Focused task structure and dependency collaboration routes."""

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.features.roadmaps.core_schemas import RoadmapResponse
from api.features.tasks.structure_schemas import (
    CreateTaskStructureRequest,
    ReorderTaskStructureRequest,
)
from api.features.tasks.structure_service import (
    create_task,
    delete_task,
    reorder_subtasks,
    reorder_top_level_tasks,
    set_task_dependency,
)
from api.shared.auth.auth_service import require_participant
from api.shared.auth.session_policy import OWNER_EDITOR
from api.shared.security.rate_limit_service import enforce_rate_limit, participant_rate_key

router = APIRouter(tags=["roadmaps"])


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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("task.create.post", participant_rate_key(participant.id, roadmap_id))
    return await create_task(db, roadmap_id, phase_id, payload, participant)


@router.delete("/{roadmap_id}/tasks/{task_id}", response_model=RoadmapResponse)
async def delete_roadmap_task(
    roadmap_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("task.delete", participant_rate_key(participant.id, roadmap_id))
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("task.reorder.put", participant_rate_key(participant.id, roadmap_id))
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit(
          "subtask.reorder.put", participant_rate_key(participant.id, roadmap_id),
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit(
          "task.dependency.put", participant_rate_key(participant.id, roadmap_id),
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
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit(
          "task.dependency.delete", participant_rate_key(participant.id, roadmap_id),
    )
    return await set_task_dependency(
        db,
        roadmap_id,
        task_id,
        dependency_id,
        participant,
        linked=False,
    )
