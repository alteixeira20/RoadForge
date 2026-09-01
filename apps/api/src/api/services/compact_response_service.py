"""Serialize focused mutation results without changing authoritative mutation semantics."""

from __future__ import annotations

from api.schemas.focused import (
    CompactMutationResponse,
    CompactPhaseState,
    CompactRoadmapConflictMetadata,
    CompactRoadmapConflictResponse,
    CompactTagState,
    CompactTaskState,
)
from api.schemas.roadmap import RoadmapConflictResponse, RoadmapResponse


def _compact_phase(phase) -> CompactPhaseState:
    completed = sum(1 for task in phase.tasks if task.done)
    return CompactPhaseState(
        id=phase.id,
        num=phase.num,
        name=phase.name,
        status=phase.status,
        progress=phase.progress,
        task_count=len(phase.tasks),
        completed_task_count=completed,
        open_task_count=len(phase.tasks) - completed,
    )


def _compact_task(task) -> CompactTaskState:
    return CompactTaskState(
        id=task.id,
        title=task.title,
        done=task.done,
        next=bool(task.next),
        complexity=task.complexity,
        est=task.est,
        parentId=task.parentId,
        deps=list(task.deps or []),
        tags=list(task.tags or []),
        assignees=list(task.assignees or []),
    )


def _find_task(roadmap: RoadmapResponse, task_id: str):
    for phase in roadmap.phases:
        for task in phase.tasks:
            if task.id == task_id:
                return phase, task
    return None


def build_compact_mutation_response(
    roadmap: RoadmapResponse,
    *,
    entity_type: str,
    entity_id: str | None = None,
    task_id: str | None = None,
    phase_id: str | None = None,
    dependency_id: str | None = None,
    tag_id: str | None = None,
    tag_label: str | None = None,
    removed: bool = False,
) -> CompactMutationResponse:
    phase_state = None
    task_state = None
    tag_state = None

    if task_id:
        match = _find_task(roadmap, task_id)
        if match:
            phase, task = match
            phase_state = _compact_phase(phase)
            task_state = _compact_task(task)
            entity_id = entity_id or task.id

    if phase_id and phase_state is None:
        phase = next((item for item in roadmap.phases if item.id == phase_id), None)
        if phase:
            phase_state = _compact_phase(phase)
            entity_id = entity_id or phase.id

    if tag_id or tag_label:
        tag = next(
            (
                item
                for item in (roadmap.tag_registry or [])
                if (tag_id and item.id == tag_id) or (tag_label and item.label == tag_label)
            ),
            None,
        )
        if tag:
            tag_state = CompactTagState(id=tag.id, label=tag.label, color=tag.color)
            entity_id = entity_id or tag.id

    return CompactMutationResponse(
        roadmap_id=roadmap.id,
        updated_at=roadmap.updated_at,
        affected_entity_type=entity_type,
        affected_entity_id=entity_id,
        dependency_id=dependency_id,
        removed=removed,
        phase=phase_state,
        task=task_state,
        tag=tag_state,
    )


def build_compact_conflict_response(
    response: RoadmapConflictResponse,
) -> CompactRoadmapConflictResponse:
    conflict = response.conflict
    return CompactRoadmapConflictResponse(
        detail=response.detail,
        code=response.code,
        conflict=CompactRoadmapConflictMetadata(
            roadmap_id=conflict.roadmap_id,
            server_updated_at=conflict.server_updated_at,
            client_last_updated_at=conflict.client_last_updated_at,
            summary=conflict.summary,
        ),
    )
