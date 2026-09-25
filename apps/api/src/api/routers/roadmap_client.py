"""Compact, typed roadmap mutation routes for agents and other focused clients."""

from fastapi import APIRouter, Depends, Header, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.schemas.collaboration import (
    CreatePhaseRequest,
    PatchPhaseRequest,
    PatchRoadmapNameRequest,
)
from api.schemas.focused import CompactMutationResponse, CompactRoadmapConflictResponse
from api.schemas.roadmap import CreateTagRequest, PatchTaskDoneRequest, PatchTaskRequest
from api.schemas.task_structure import CreateTaskStructureRequest
from api.services.auth_service import require_participant
from api.services.compact_response_service import (
    build_compact_conflict_response,
    build_compact_mutation_response,
)
from api.services.phase_structure_service import create_phase, delete_phase
from api.services.rate_limit_service import rate_limiter
from api.services.roadmap_service import RoadmapConflictError
from api.services.roadmap_structure_service import patch_phase, patch_roadmap_name
from api.services.roadmap_tag_service import create_tag
from api.services.roadmap_task_service import patch_task, patch_task_done
from api.services.task_structure_service import create_task, delete_task, set_task_dependency

router = APIRouter(tags=["roadmaps"])
_OWNER_EDITOR = {"owner", "editor"}
_COMPACT_CONFLICT = {409: {"model": CompactRoadmapConflictResponse}}


def _participant_rate_key(participant_id: str, roadmap_id: str) -> str:
    return f"{participant_id}:{roadmap_id}"


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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.update.patch",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.done.patch",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.create.post",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.delete",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.dependency.put",
        _participant_rate_key(participant.id, roadmap_id),
        limit=180,
        window_seconds=60,
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "task.dependency.delete",
        _participant_rate_key(participant.id, roadmap_id),
        limit=180,
        window_seconds=60,
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "phase.create.post",
        _participant_rate_key(participant.id, roadmap_id),
        limit=60,
        window_seconds=60,
    )
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "phase.update.patch",
        _participant_rate_key(participant.id, roadmap_id),
        limit=180,
        window_seconds=60,
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "phase.delete",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
    )
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "roadmap.name.patch",
        _participant_rate_key(participant.id, roadmap_id),
        limit=120,
        window_seconds=60,
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
    participant = await require_participant(db, roadmap_id, authorization, _OWNER_EDITOR)
    await rate_limiter.enforce(
        "tag.create",
        _participant_rate_key(participant.id, roadmap_id),
        limit=60,
        window_seconds=60,
    )
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
