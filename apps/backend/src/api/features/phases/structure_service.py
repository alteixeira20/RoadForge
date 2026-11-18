"""Server-authoritative phase create/delete/reorder operations."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.features.phases.schemas import CreatePhaseRequest, ReorderPhasesRequest
from api.features.roadmaps.core_schemas import RoadmapResponse
from api.features.roadmaps.limit_schemas import PHASES_MAX
from api.features.roadmaps.mutation_pipeline import commit_roadmap_snapshot_mutation
from api.features.roadmaps.queries import fetch_active_roadmap_for_update
from api.features.roadmaps.snapshot import phases_from_snapshot, roadmap_response
from api.features.roadmaps.tag_schemas import TagDefinitionDTO
from api.features.roadmaps.validation import validate_roadmap_domain
from api.features.tasks.structure_helpers import remove_dependencies_on_tasks
from api.models.roadmap import ActivityLog, Participant, Roadmap
from api.shared.ids import generate_id


def _stored_tag_registry(roadmap: Roadmap) -> list[TagDefinitionDTO] | None:
    if roadmap.tag_registry_json is None:
        return None
    return [TagDefinitionDTO.model_validate(tag) for tag in roadmap.tag_registry_json]


def _phase_dicts(snapshot_json: dict[str, Any]) -> list[dict[str, Any]]:
    phases = snapshot_json.get("phases")
    if not isinstance(phases, list) or any(not isinstance(phase, dict) for phase in phases):
        raise HTTPException(status_code=500, detail="Stored roadmap phase snapshot is invalid")
    return phases


def _with_phases(snapshot_json: dict[str, Any], phases: list[dict[str, Any]]) -> dict[str, Any]:
    next_snapshot = dict(snapshot_json)
    next_snapshot["phases"] = phases
    return next_snapshot


def _renumber_phase_dicts(phases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {**phase, "num": str(index + 1).zfill(2)}
        for index, phase in enumerate(phases)
    ]


def _phase_summary(phase: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": phase.get("id"),
        "num": phase.get("num"),
        "name": phase.get("name"),
        "color": phase.get("color"),
        "colorMode": phase.get("colorMode"),
    }


async def _persist_phase_structure_change(
    db: AsyncSession,
    roadmap: Roadmap,
    participant: Participant,
    *,
    action: str,
    snapshot_json: dict[str, Any],
    activity: ActivityLog,
    event_payload: dict[str, Any],
) -> RoadmapResponse:
    phases = phases_from_snapshot(snapshot_json)
    validate_roadmap_domain(phases, _stored_tag_registry(roadmap))

    roadmap.snapshot_json = snapshot_json
    await commit_roadmap_snapshot_mutation(
        db,
        roadmap,
        participant,
        action=action,
        activity=activity,
        projection="full",
        event_payload=event_payload,
    )
    return roadmap_response(roadmap, phases_from_snapshot(roadmap.snapshot_json))


async def create_phase(
    db: AsyncSession,
    roadmap_id: str,
    payload: CreatePhaseRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    phases = _phase_dicts(roadmap.snapshot_json)
    if len(phases) >= PHASES_MAX:
        raise HTTPException(
            status_code=422,
            detail=f"Roadmap supports at most {PHASES_MAX} phases",
        )
    if any(phase.get("id") == payload.id for phase in phases):
        raise HTTPException(status_code=409, detail="Phase ID already exists")

    created = {
        "id": payload.id,
        "num": str(len(phases) + 1).zfill(2),
        "name": payload.name,
        "color": payload.color,
        "colorMode": payload.colorMode,
        "status": "active" if not phases else "future",
        "progress": 0,
        "tasks": [],
    }
    snapshot_json = _with_phases(roadmap.snapshot_json, [*phases, created])
    activity = ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="phase.created",
        entity_type="phase",
        entity_id=payload.id,
        before_json={},
        after_json=_phase_summary(created),
        metadata_json={
            "phaseId": payload.id,
            "phaseName": payload.name,
            "phaseNum": created["num"],
        },
    )
    return await _persist_phase_structure_change(
        db,
        roadmap,
        participant,
        action="phase.created",
        snapshot_json=snapshot_json,
        activity=activity,
        event_payload={"phase_id": payload.id, "phase_operation": "created"},
    )


async def delete_phase(
    db: AsyncSession,
    roadmap_id: str,
    phase_id: str,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    phases = _phase_dicts(roadmap.snapshot_json)
    deleted = next((phase for phase in phases if phase.get("id") == phase_id), None)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Phase not found")

    deleted_tasks = deleted.get("tasks")
    deleted_task_ids = {
        task["id"]
        for task in deleted_tasks
        if isinstance(task, dict) and isinstance(task.get("id"), str)
    } if isinstance(deleted_tasks, list) else set()

    remaining = [phase for phase in phases if phase.get("id") != phase_id]
    dependency_cleaned, removed_dependency_count = remove_dependencies_on_tasks(
        remaining,
        deleted_task_ids,
    )
    renumbered = _renumber_phase_dicts(dependency_cleaned)
    snapshot_json = _with_phases(roadmap.snapshot_json, renumbered)
    activity = ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="phase.deleted",
        entity_type="phase",
        entity_id=phase_id,
        before_json=_phase_summary(deleted),
        after_json={},
        metadata_json={
            "phaseId": phase_id,
            "phaseName": deleted.get("name"),
            "phaseNum": deleted.get("num"),
            "deletedTaskCount": len(deleted_task_ids),
            "removedDependencyCount": removed_dependency_count,
        },
    )
    return await _persist_phase_structure_change(
        db,
        roadmap,
        participant,
        action="phase.deleted",
        snapshot_json=snapshot_json,
        activity=activity,
        event_payload={"phase_id": phase_id, "phase_operation": "deleted"},
    )


async def reorder_phases(
    db: AsyncSession,
    roadmap_id: str,
    payload: ReorderPhasesRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    phases = _phase_dicts(roadmap.snapshot_json)
    by_id = {phase.get("id"): phase for phase in phases}

    # `phase_ids` is a preferred order for caller-known entities, not an exact
    # phase-set assertion. Concurrently deleted IDs disappear; server-only
    # phases remain and keep their relative order after caller-known phases.
    requested_known = [phase_id for phase_id in payload.phase_ids if phase_id in by_id]
    requested_set = set(requested_known)
    server_only = [phase for phase in phases if phase.get("id") not in requested_set]
    reordered = [by_id[phase_id] for phase_id in requested_known]
    reordered.extend(server_only)
    renumbered = _renumber_phase_dicts(reordered)

    before_ids = [phase.get("id") for phase in phases]
    after_ids = [phase.get("id") for phase in renumbered]
    if before_ids == after_ids:
        return roadmap_response(roadmap, phases_from_snapshot(roadmap.snapshot_json))

    snapshot_json = _with_phases(roadmap.snapshot_json, renumbered)
    activity = ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="phase.reordered",
        entity_type="roadmap",
        entity_id=roadmap_id,
        before_json={"phaseIds": before_ids},
        after_json={"phaseIds": after_ids},
        metadata_json={"phaseIds": after_ids},
    )
    return await _persist_phase_structure_change(
        db,
        roadmap,
        participant,
        action="phase.reordered",
        snapshot_json=snapshot_json,
        activity=activity,
        event_payload={"phase_operation": "reordered", "phase_ids": after_ids},
    )
