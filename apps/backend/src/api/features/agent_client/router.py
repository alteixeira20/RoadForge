"""Compact, typed roadmap mutation routes for agents and other focused clients."""

from fastapi import APIRouter, Depends, Header, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.features.agent_client.compact_response_service import (
    build_compact_conflict_response,
    build_compact_mutation_response,
)
from api.features.agent_client.schemas import (
    CompactMutationResponse,
    CompactRoadmapConflictResponse,
)
from api.features.phases.patch_service import patch_phase, patch_roadmap_name
from api.features.phases.schemas import (
    CreatePhaseRequest,
    PatchPhaseRequest,
    PatchRoadmapNameRequest,
)
from api.features.phases.structure_service import create_phase, delete_phase
from api.features.roadmaps.conflicts import RoadmapConflictError
from api.features.tags.schemas import CreateTagRequest
from api.features.tags.service import create_tag
from api.features.tasks.service import patch_task, patch_task_done
from api.features.tasks.structure_schemas import CreateTaskStructureRequest
from api.features.tasks.structure_service import create_task, delete_task, set_task_dependency
from api.features.tasks.task_schemas import PatchTaskDoneRequest, PatchTaskRequest
from api.shared.auth.auth_service import require_participant
from api.shared.auth.session_policy import OWNER_EDITOR
from api.shared.security.rate_limit_service import enforce_rate_limit, participant_rate_key

router = APIRouter(tags=["roadmaps"])
_COMPACT_CONFLICT = {409: {"model": CompactRoadmapConflictResponse}}


def _compact_conflict(exc: RoadmapConflictError) -> JSONResponse:
    payload = build_compact_conflict_response(exc.response).model_dump(mode="json")
    return JSONResponse(status_code=409, content=payload)


@router.patch(
    "/{roadmap_id}/client/tasks/{task_id}",
    response_model=CompactMutationResponse,
    responses=_COMPACT_CONFLICT,
)
async def patch_client_task(
    roadmap_id: str,
    task_id: str,
    payload: PatchTaskRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CompactMutationResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("task.update.patch", participant_rate_key(participant.id, roadmap_id))
    try:
        roadmap = await patch_task(db, roadmap_id, task_id, payload, participant)
    except RoadmapConflictError as exc:
        return _compact_conflict(exc)
    return build_compact_mutation_response(roadmap, entity_type="task", task_id=task_id)


@router.patch(
    "/{roadmap_id}/client/tasks/{task_id}/done",
    response_model=CompactMutationResponse,
    responses=_COMPACT_CONFLICT,
)
async def patch_client_task_done(
    roadmap_id: str,
    task_id: str,
    payload: PatchTaskDoneRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CompactMutationResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("task.done.patch", participant_rate_key(participant.id, roadmap_id))
    try:
        roadmap = await patch_task_done(db, roadmap_id, task_id, payload, participant)
    except RoadmapConflictError as exc:
        return _compact_conflict(exc)
    return build_compact_mutation_response(roadmap, entity_type="task", task_id=task_id)


@router.post(
    "/{roadmap_id}/client/phases/{phase_id}/tasks",
    response_model=CompactMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_client_task(
    roadmap_id: str,
    phase_id: str,
    payload: CreateTaskStructureRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CompactMutationResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("task.create.post", participant_rate_key(participant.id, roadmap_id))
    roadmap = await create_task(db, roadmap_id, phase_id, payload, participant)
    return build_compact_mutation_response(
        roadmap,
        entity_type="task",
        task_id=payload.id,
    )


@router.delete(
    "/{roadmap_id}/client/tasks/{task_id}",
    response_model=CompactMutationResponse,
)
async def delete_client_task(
    roadmap_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CompactMutationResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("task.delete", participant_rate_key(participant.id, roadmap_id))
    roadmap = await delete_task(db, roadmap_id, task_id, participant)
    return build_compact_mutation_response(
        roadmap,
        entity_type="task",
        entity_id=task_id,
        removed=True,
    )


@router.put(
    "/{roadmap_id}/client/tasks/{task_id}/dependencies/{dependency_id}",
    response_model=CompactMutationResponse,
)
async def link_client_task_dependency(
    roadmap_id: str,
    task_id: str,
    dependency_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CompactMutationResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit(
          "task.dependency.put", participant_rate_key(participant.id, roadmap_id),
    )
    roadmap = await set_task_dependency(
        db,
        roadmap_id,
        task_id,
        dependency_id,
        participant,
        linked=True,
    )
    return build_compact_mutation_response(
        roadmap,
        entity_type="dependency",
        entity_id=task_id,
        task_id=task_id,
        dependency_id=dependency_id,
    )


@router.delete(
    "/{roadmap_id}/client/tasks/{task_id}/dependencies/{dependency_id}",
    response_model=CompactMutationResponse,
)
async def unlink_client_task_dependency(
    roadmap_id: str,
    task_id: str,
    dependency_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CompactMutationResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit(
          "task.dependency.delete", participant_rate_key(participant.id, roadmap_id),
    )
    roadmap = await set_task_dependency(
        db,
        roadmap_id,
        task_id,
        dependency_id,
        participant,
        linked=False,
    )
    return build_compact_mutation_response(
        roadmap,
        entity_type="dependency",
        entity_id=task_id,
        task_id=task_id,
        dependency_id=dependency_id,
        removed=True,
    )


@router.post(
    "/{roadmap_id}/client/phases",
    response_model=CompactMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_client_phase(
    roadmap_id: str,
    payload: CreatePhaseRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CompactMutationResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("phase.create.post", participant_rate_key(participant.id, roadmap_id))
    roadmap = await create_phase(db, roadmap_id, payload, participant)
    return build_compact_mutation_response(
        roadmap,
        entity_type="phase",
        phase_id=payload.id,
    )


@router.patch(
    "/{roadmap_id}/client/phases/{phase_id}",
    response_model=CompactMutationResponse,
)
async def patch_client_phase(
    roadmap_id: str,
    phase_id: str,
    payload: PatchPhaseRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CompactMutationResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit(
          "phase.update.patch", participant_rate_key(participant.id, roadmap_id),
    )
    roadmap = await patch_phase(db, roadmap_id, phase_id, payload, participant)
    return build_compact_mutation_response(
        roadmap,
        entity_type="phase",
        phase_id=phase_id,
    )


@router.delete(
    "/{roadmap_id}/client/phases/{phase_id}",
    response_model=CompactMutationResponse,
)
async def delete_client_phase(
    roadmap_id: str,
    phase_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CompactMutationResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("phase.delete", participant_rate_key(participant.id, roadmap_id))
    roadmap = await delete_phase(db, roadmap_id, phase_id, participant)
    return build_compact_mutation_response(
        roadmap,
        entity_type="phase",
        entity_id=phase_id,
        removed=True,
    )


@router.patch(
    "/{roadmap_id}/client/name",
    response_model=CompactMutationResponse,
)
async def patch_client_name(
    roadmap_id: str,
    payload: PatchRoadmapNameRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CompactMutationResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit(
          "roadmap.name.patch", participant_rate_key(participant.id, roadmap_id),
    )
    roadmap = await patch_roadmap_name(db, roadmap_id, payload, participant)
    return build_compact_mutation_response(
        roadmap,
        entity_type="roadmap",
        entity_id=roadmap_id,
    )


@router.post(
    "/{roadmap_id}/client/tags",
    response_model=CompactMutationResponse,
    status_code=status.HTTP_201_CREATED,
    responses=_COMPACT_CONFLICT,
)
async def create_client_tag(
    roadmap_id: str,
    payload: CreateTagRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> CompactMutationResponse | JSONResponse:
    participant = await require_participant(db, roadmap_id, authorization, OWNER_EDITOR)
    await enforce_rate_limit("tag.create", participant_rate_key(participant.id, roadmap_id))
    try:
        roadmap = await create_tag(db, roadmap_id, payload, participant)
    except RoadmapConflictError as exc:
        return _compact_conflict(exc)
    return build_compact_mutation_response(
        roadmap,
        entity_type="tag",
        tag_id=payload.id,
        tag_label=payload.label,
    )
