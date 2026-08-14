"""Server-authoritative task structure and dependency operations."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, Roadmap
from api.schemas.limits import TASKS_PER_PHASE_MAX
from api.schemas.roadmap import RoadmapResponse, TagDefinitionDTO
from api.schemas.task_structure import CreateTaskStructureRequest, ReorderTaskStructureRequest
from api.services.activity_log_limit import enforce_activity_log_cap
from api.services.event_bus import Event, event_bus
from api.services.id_service import generate_id
from api.services.projection import sync_roadmap_projection_best_effort
from api.services.roadmap_helpers import _phases_from_snapshot, _roadmap_response
from api.services.roadmap_query import fetch_active_roadmap_for_update
from api.services.roadmap_validation import validate_roadmap_domain


def _stored_tag_registry(roadmap: Roadmap) -> list[TagDefinitionDTO] | None:
    if roadmap.tag_registry_json is None:
        return None
    return [TagDefinitionDTO.model_validate(tag) for tag in roadmap.tag_registry_json]


def _phase_dicts(snapshot_json: dict[str, Any]) -> list[dict[str, Any]]:
    phases = snapshot_json.get("phases")
    if not isinstance(phases, list) or any(not isinstance(phase, dict) for phase in phases):
        raise HTTPException(status_code=500, detail="Stored roadmap phase snapshot is invalid")
    for phase in phases:
        tasks = phase.get("tasks")
        if not isinstance(tasks, list) or any(not isinstance(task, dict) for task in tasks):
            raise HTTPException(status_code=500, detail="Stored roadmap task snapshot is invalid")
    return phases


def _validate_current_snapshot(roadmap: Roadmap) -> None:
    phases = _phases_from_snapshot(roadmap.snapshot_json)
    validate_roadmap_domain(phases, _stored_tag_registry(roadmap))


def _with_phases(snapshot_json: dict[str, Any], phases: list[dict[str, Any]]) -> dict[str, Any]:
    next_snapshot = dict(snapshot_json)
    next_snapshot["phases"] = phases
    return next_snapshot


def _task_summary(task: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": task.get("id"),
        "title": task.get("title"),
        "parentId": task.get("parentId"),
    }


def _task_location(
    phases: list[dict[str, Any]],
    task_id: str,
) -> tuple[int, int, dict[str, Any]] | None:
    for phase_index, phase in enumerate(phases):
        tasks = phase["tasks"]
        for task_index, task in enumerate(tasks):
            if task.get("id") == task_id:
                return phase_index, task_index, task
    return None


def _all_task_ids(phases: list[dict[str, Any]]) -> set[str]:
    return {
        task["id"]
        for phase in phases
        for task in phase["tasks"]
        if isinstance(task.get("id"), str)
    }


def _direct_child_ids(tasks: list[dict[str, Any]], parent_id: str) -> list[str]:
    return [
        task["id"]
        for task in tasks
        if task.get("parentId") == parent_id and isinstance(task.get("id"), str)
    ]


def _descendant_ids(tasks: list[dict[str, Any]], root_id: str) -> set[str]:
    children_by_parent: dict[str, list[str]] = {}
    for task in tasks:
        task_id = task.get("id")
        parent_id = task.get("parentId")
        if isinstance(task_id, str) and isinstance(parent_id, str):
            children_by_parent.setdefault(parent_id, []).append(task_id)

    descendants: set[str] = set()
    pending = list(children_by_parent.get(root_id, []))
    while pending:
        task_id = pending.pop()
        if task_id in descendants:
            continue
        descendants.add(task_id)
        pending.extend(children_by_parent.get(task_id, []))
    return descendants


def _task_subtree_block(tasks: list[dict[str, Any]], root_id: str) -> list[dict[str, Any]]:
    root = next((task for task in tasks if task.get("id") == root_id), None)
    if root is None:
        return []
    descendant_ids = _descendant_ids(tasks, root_id)
    descendants = [task for task in tasks if task.get("id") in descendant_ids]
    return [root, *descendants]


def _recompute_phase_progress(phase: dict[str, Any]) -> dict[str, Any]:
    tasks = phase["tasks"]
    if not tasks:
        progress = 0
    else:
        done_count = sum(task.get("done") is True for task in tasks)
        progress = round(done_count * 100 / len(tasks))
    return phase if phase.get("progress") == progress else {**phase, "progress": progress}


def _remove_dependencies_on_tasks(
    phases: list[dict[str, Any]],
    deleted_task_ids: set[str],
) -> tuple[list[dict[str, Any]], int]:
    if not deleted_task_ids:
        return phases, 0

    removed_count = 0
    next_phases: list[dict[str, Any]] = []
    for phase in phases:
        changed_phase = False
        next_tasks: list[dict[str, Any]] = []
        for task in phase["tasks"]:
            deps = task.get("deps")
            if not isinstance(deps, list):
                next_tasks.append(task)
                continue
            filtered = [dep for dep in deps if dep not in deleted_task_ids]
            removed_count += len(deps) - len(filtered)
            if filtered == deps:
                next_tasks.append(task)
                continue
            changed_phase = True
            next_tasks.append({**task, "deps": filtered})
        next_phases.append({**phase, "tasks": next_tasks} if changed_phase else phase)
    return next_phases, removed_count


def _preferred_known_order(current_ids: list[str], requested_ids: list[str]) -> list[str]:
    current_set = set(current_ids)
    requested_known = [task_id for task_id in requested_ids if task_id in current_set]
    requested_set = set(requested_known)
    server_only = [task_id for task_id in current_ids if task_id not in requested_set]
    return [*requested_known, *server_only]


def _reorder_top_level_tasks(
    tasks: list[dict[str, Any]],
    requested_ids: list[str],
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    top_level_ids = [
        task["id"]
        for task in tasks
        if not task.get("parentId") and isinstance(task.get("id"), str)
    ]
    final_top_level_ids = _preferred_known_order(top_level_ids, requested_ids)
    if final_top_level_ids == top_level_ids:
        return tasks, top_level_ids, final_top_level_ids

    ordered: list[dict[str, Any]] = []
    handled: set[str] = set()
    for task_id in final_top_level_ids:
        block = _task_subtree_block(tasks, task_id)
        ordered.extend(block)
        handled.update(
            task["id"] for task in block if isinstance(task.get("id"), str)
        )
    ordered.extend(task for task in tasks if task.get("id") not in handled)
    return ordered, top_level_ids, final_top_level_ids


def _reorder_direct_children(
    tasks: list[dict[str, Any]],
    parent_id: str,
    requested_ids: list[str],
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    child_ids = _direct_child_ids(tasks, parent_id)
    final_child_ids = _preferred_known_order(child_ids, requested_ids)
    if final_child_ids == child_ids:
        return tasks, child_ids, final_child_ids

    all_child_subtree_ids: set[str] = set()
    ordered_children: list[dict[str, Any]] = []
    for child_id in final_child_ids:
        block = _task_subtree_block(tasks, child_id)
        ordered_children.extend(block)
        all_child_subtree_ids.update(
            task["id"] for task in block if isinstance(task.get("id"), str)
        )

    without_children = [task for task in tasks if task.get("id") not in all_child_subtree_ids]
    parent_index = next(
        (index for index, task in enumerate(without_children) if task.get("id") == parent_id),
        -1,
    )
    if parent_index < 0:
        raise HTTPException(status_code=404, detail="Parent task not found")
    next_tasks = [*without_children]
    next_tasks[parent_index + 1 : parent_index + 1] = ordered_children
    return next_tasks, child_ids, final_child_ids


async def _persist_task_structure_change(
    db: AsyncSession,
    roadmap: Roadmap,
    participant: Participant,
    *,
    action: str,
    snapshot_json: dict[str, Any],
    activity: ActivityLog,
    event_payload: dict[str, Any],
) -> RoadmapResponse:
    phases = _phases_from_snapshot(snapshot_json)
    validate_roadmap_domain(phases, _stored_tag_registry(roadmap))

    roadmap.snapshot_json = snapshot_json
    roadmap.updated_at = datetime.now(timezone.utc)
    db.add(activity)
    await sync_roadmap_projection_best_effort(db, roadmap, action)
    await enforce_activity_log_cap(db, roadmap.id)
    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(
        Event(
            roadmap_id=roadmap.id,
            action="roadmap.updated",
            payload={
                "roadmap_id": roadmap.id,
                "updated_at": roadmap.updated_at.isoformat(),
                "participant_id": participant.id,
                "action": action,
                **event_payload,
            },
        )
    )
    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


async def create_task(
    db: AsyncSession,
    roadmap_id: str,
    phase_id: str,
    payload: CreateTaskStructureRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    _validate_current_snapshot(roadmap)
    phases = _phase_dicts(roadmap.snapshot_json)
    if payload.id in _all_task_ids(phases):
        raise HTTPException(status_code=409, detail="Task ID already exists")

    phase_index = next(
        (index for index, phase in enumerate(phases) if phase.get("id") == phase_id),
        -1,
    )
    if phase_index < 0:
        raise HTTPException(status_code=404, detail="Phase not found")
    phase = phases[phase_index]
    tasks = phase["tasks"]
    if len(tasks) >= TASKS_PER_PHASE_MAX:
        raise HTTPException(
            status_code=422,
            detail=f"Phase supports at most {TASKS_PER_PHASE_MAX} tasks",
        )

    parent_index = -1
    if payload.parentId is not None:
        parent_index = next(
            (index for index, task in enumerate(tasks) if task.get("id") == payload.parentId),
            -1,
        )
        if parent_index < 0:
            raise HTTPException(status_code=404, detail="Parent task not found in phase")

    created = {
        "id": payload.id,
        "title": payload.title,
        "done": False,
        "next": False,
        "est": "",
        "complexity": "medium",
        "tags": ["subtask"] if payload.parentId is not None else [],
        "deps": [],
        "desc": "",
        **({"parentId": payload.parentId} if payload.parentId is not None else {}),
    }
    next_tasks = [*tasks]
    if parent_index >= 0:
        next_tasks.insert(parent_index + 1, created)
    else:
        next_tasks.append(created)

    next_phase = _recompute_phase_progress({**phase, "tasks": next_tasks})
    next_phases = [*phases]
    next_phases[phase_index] = next_phase
    snapshot_json = _with_phases(roadmap.snapshot_json, next_phases)
    activity = ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="task.created",
        entity_type="task",
        entity_id=payload.id,
        before_json={},
        after_json=_task_summary(created),
        metadata_json={
            "taskId": payload.id,
            "taskTitle": payload.title,
            "phaseId": phase_id,
            "phaseName": phase.get("name"),
            "parentId": payload.parentId,
        },
    )
    return await _persist_task_structure_change(
        db,
        roadmap,
        participant,
        action="task.created",
        snapshot_json=snapshot_json,
        activity=activity,
        event_payload={
            "task_id": payload.id,
            "task_operation": "created",
            "phase_id": phase_id,
            "parent_id": payload.parentId,
        },
    )


async def delete_task(
    db: AsyncSession,
    roadmap_id: str,
    task_id: str,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    _validate_current_snapshot(roadmap)
    phases = _phase_dicts(roadmap.snapshot_json)
    location = _task_location(phases, task_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Task not found")
    phase_index, _, deleted = location
    phase = phases[phase_index]
    tasks = phase["tasks"]

    deleted_ids = {task_id, *_descendant_ids(tasks, task_id)}
    remaining_tasks = [task for task in tasks if task.get("id") not in deleted_ids]
    next_phases = [*phases]
    next_phases[phase_index] = _recompute_phase_progress(
        {**phase, "tasks": remaining_tasks}
    )
    next_phases, removed_dependency_count = _remove_dependencies_on_tasks(
        next_phases,
        deleted_ids,
    )
    snapshot_json = _with_phases(roadmap.snapshot_json, next_phases)
    activity = ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="task.deleted",
        entity_type="task",
        entity_id=task_id,
        before_json=_task_summary(deleted),
        after_json={},
        metadata_json={
            "taskId": task_id,
            "taskTitle": deleted.get("title"),
            "phaseId": phase.get("id"),
            "phaseName": phase.get("name"),
            "parentId": deleted.get("parentId"),
            "deletedTaskCount": len(deleted_ids),
            "removedDependencyCount": removed_dependency_count,
        },
    )
    return await _persist_task_structure_change(
        db,
        roadmap,
        participant,
        action="task.deleted",
        snapshot_json=snapshot_json,
        activity=activity,
        event_payload={
            "task_id": task_id,
            "task_ids": sorted(deleted_ids),
            "task_operation": "deleted",
            "phase_id": phase.get("id"),
            "parent_id": deleted.get("parentId"),
        },
    )


async def reorder_top_level_tasks(
    db: AsyncSession,
    roadmap_id: str,
    phase_id: str,
    payload: ReorderTaskStructureRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    _validate_current_snapshot(roadmap)
    phases = _phase_dicts(roadmap.snapshot_json)
    phase_index = next(
        (index for index, phase in enumerate(phases) if phase.get("id") == phase_id),
        -1,
    )
    if phase_index < 0:
        raise HTTPException(status_code=404, detail="Phase not found")
    phase = phases[phase_index]
    next_tasks, before_ids, after_ids = _reorder_top_level_tasks(
        phase["tasks"], payload.task_ids
    )
    if before_ids == after_ids:
        return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))

    next_phases = [*phases]
    next_phases[phase_index] = {**phase, "tasks": next_tasks}
    snapshot_json = _with_phases(roadmap.snapshot_json, next_phases)
    activity = ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="task.reordered",
        entity_type="phase",
        entity_id=phase_id,
        before_json={"taskIds": before_ids},
        after_json={"taskIds": after_ids},
        metadata_json={
            "phaseId": phase_id,
            "phaseName": phase.get("name"),
            "taskIds": after_ids,
        },
    )
    return await _persist_task_structure_change(
        db,
        roadmap,
        participant,
        action="task.reordered",
        snapshot_json=snapshot_json,
        activity=activity,
        event_payload={
            "task_operation": "reordered",
            "phase_id": phase_id,
            "task_ids": after_ids,
        },
    )


async def reorder_subtasks(
    db: AsyncSession,
    roadmap_id: str,
    parent_id: str,
    payload: ReorderTaskStructureRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    _validate_current_snapshot(roadmap)
    phases = _phase_dicts(roadmap.snapshot_json)
    location = _task_location(phases, parent_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Parent task not found")
    phase_index, _, parent = location
    phase = phases[phase_index]
    next_tasks, before_ids, after_ids = _reorder_direct_children(
        phase["tasks"], parent_id, payload.task_ids
    )
    if before_ids == after_ids:
        return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))

    next_phases = [*phases]
    next_phases[phase_index] = {**phase, "tasks": next_tasks}
    snapshot_json = _with_phases(roadmap.snapshot_json, next_phases)
    activity = ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="task.reordered",
        entity_type="task",
        entity_id=parent_id,
        before_json={"taskIds": before_ids},
        after_json={"taskIds": after_ids},
        metadata_json={
            "taskId": parent_id,
            "taskTitle": parent.get("title"),
            "phaseId": phase.get("id"),
            "phaseName": phase.get("name"),
            "taskIds": after_ids,
        },
    )
    return await _persist_task_structure_change(
        db,
        roadmap,
        participant,
        action="task.reordered",
        snapshot_json=snapshot_json,
        activity=activity,
        event_payload={
            "task_operation": "reordered",
            "task_id": parent_id,
            "parent_id": parent_id,
            "phase_id": phase.get("id"),
            "task_ids": after_ids,
        },
    )


async def set_task_dependency(
    db: AsyncSession,
    roadmap_id: str,
    task_id: str,
    dependency_id: str,
    participant: Participant,
    *,
    linked: bool,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    _validate_current_snapshot(roadmap)
    phases = _phase_dicts(roadmap.snapshot_json)
    task_location = _task_location(phases, task_id)
    dependency_location = _task_location(phases, dependency_id)
    if task_location is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if dependency_location is None:
        raise HTTPException(status_code=404, detail="Dependency task not found")
    phase_index, task_index, task = task_location
    _, _, dependency = dependency_location

    current_deps = list(task.get("deps") or [])
    if linked:
        if dependency_id in current_deps:
            return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))
        next_deps = [*current_deps, dependency_id]
        action = "task.dependency.linked"
    else:
        if dependency_id not in current_deps:
            return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))
        next_deps = [dep for dep in current_deps if dep != dependency_id]
        action = "task.dependency.unlinked"

    phase = phases[phase_index]
    next_tasks = [*phase["tasks"]]
    next_tasks[task_index] = {**task, "deps": next_deps}
    next_phases = [*phases]
    next_phases[phase_index] = {**phase, "tasks": next_tasks}
    snapshot_json = _with_phases(roadmap.snapshot_json, next_phases)
    activity = ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action=action,
        entity_type="task",
        entity_id=task_id,
        before_json={"deps": current_deps},
        after_json={"deps": next_deps},
        metadata_json={
            "taskId": task_id,
            "taskTitle": task.get("title"),
            "dependencyId": dependency_id,
            "dependencyTitle": dependency.get("title"),
            "phaseId": phase.get("id"),
            "phaseName": phase.get("name"),
        },
    )
    return await _persist_task_structure_change(
        db,
        roadmap,
        participant,
        action=action,
        snapshot_json=snapshot_json,
        activity=activity,
        event_payload={
            "task_id": task_id,
            "changed_fields": ["deps"],
            "phase_id": phase.get("id"),
            "dependency_id": dependency_id,
        },
    )
