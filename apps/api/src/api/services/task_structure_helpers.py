"""Pure helpers for task-structure snapshot, graph, order, and progress mutations."""

from __future__ import annotations

from math import floor
from typing import Any

from fastapi import HTTPException

TaskDict = dict[str, Any]
PhaseDict = dict[str, Any]


def phase_dicts(snapshot_json: dict[str, Any]) -> list[PhaseDict]:
    """Return the stored phase/task dictionaries or fail closed on malformed canonical state."""
    phases = snapshot_json.get("phases")
    if not isinstance(phases, list) or any(not isinstance(phase, dict) for phase in phases):
        raise HTTPException(status_code=500, detail="Stored roadmap phase snapshot is invalid")
    for phase in phases:
        tasks = phase.get("tasks")
        if not isinstance(tasks, list) or any(not isinstance(task, dict) for task in tasks):
            raise HTTPException(status_code=500, detail="Stored roadmap task snapshot is invalid")
    return phases


def with_phases(snapshot_json: dict[str, Any], phases: list[PhaseDict]) -> dict[str, Any]:
    next_snapshot = dict(snapshot_json)
    next_snapshot["phases"] = phases
    return next_snapshot


def task_summary(task: TaskDict) -> dict[str, Any]:
    return {
        "id": task.get("id"),
        "title": task.get("title"),
        "parentId": task.get("parentId"),
    }


def task_location(
    phases: list[PhaseDict],
    task_id: str,
) -> tuple[int, int, TaskDict] | None:
    for phase_index, phase in enumerate(phases):
        for task_index, task in enumerate(phase["tasks"]):
            if task.get("id") == task_id:
                return phase_index, task_index, task
    return None


def all_task_ids(phases: list[PhaseDict]) -> set[str]:
    return {
        task["id"]
        for phase in phases
        for task in phase["tasks"]
        if isinstance(task.get("id"), str)
    }


def children_by_parent(tasks: list[TaskDict]) -> dict[str, list[str]]:
    """Index children in canonical sibling order."""
    children: dict[str, list[str]] = {}
    for task in tasks:
        task_id = task.get("id")
        parent_id = task.get("parentId")
        if isinstance(task_id, str) and isinstance(parent_id, str):
            children.setdefault(parent_id, []).append(task_id)
    return children


def direct_child_ids(tasks: list[TaskDict], parent_id: str) -> list[str]:
    return children_by_parent(tasks).get(parent_id, [])


def descendant_ids(tasks: list[TaskDict], root_id: str) -> set[str]:
    children = children_by_parent(tasks)
    descendants: set[str] = set()
    pending = list(children.get(root_id, []))
    while pending:
        task_id = pending.pop()
        if task_id in descendants:
            continue
        descendants.add(task_id)
        pending.extend(children.get(task_id, []))
    return descendants


def task_subtree_block(tasks: list[TaskDict], root_id: str) -> list[TaskDict]:
    """Return one subtree parent-before-child, preserving canonical sibling order."""
    by_id = {
        task["id"]: task
        for task in tasks
        if isinstance(task.get("id"), str)
    }
    if root_id not in by_id:
        return []
    children = children_by_parent(tasks)
    ordered: list[TaskDict] = []

    def visit(task_id: str) -> None:
        task = by_id.get(task_id)
        if task is None:
            return
        ordered.append(task)
        for child_id in children.get(task_id, []):
            visit(child_id)

    visit(root_id)
    return ordered


def recompute_phase_progress(phase: PhaseDict) -> PhaseDict:
    """Recompute progress with JavaScript Math.round parity."""
    tasks = phase["tasks"]
    if not tasks:
        progress = 0
    else:
        done_count = sum(task.get("done") is True for task in tasks)
        progress = floor(done_count * 100 / len(tasks) + 0.5)
    return phase if phase.get("progress") == progress else {**phase, "progress": progress}


def remove_dependencies_on_tasks(
    phases: list[PhaseDict],
    deleted_task_ids: set[str],
) -> tuple[list[PhaseDict], int]:
    if not deleted_task_ids:
        return phases, 0

    removed_count = 0
    next_phases: list[PhaseDict] = []
    for phase in phases:
        changed_phase = False
        next_tasks: list[TaskDict] = []
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


def preferred_known_order(current_ids: list[str], requested_ids: list[str]) -> list[str]:
    current_set = set(current_ids)
    requested_known = [task_id for task_id in requested_ids if task_id in current_set]
    requested_set = set(requested_known)
    server_only = [task_id for task_id in current_ids if task_id not in requested_set]
    return [*requested_known, *server_only]


def reorder_top_level_tasks(
    tasks: list[TaskDict],
    requested_ids: list[str],
) -> tuple[list[TaskDict], list[str], list[str]]:
    top_level_ids = [
        task["id"]
        for task in tasks
        if not task.get("parentId") and isinstance(task.get("id"), str)
    ]
    final_ids = preferred_known_order(top_level_ids, requested_ids)
    if final_ids == top_level_ids:
        return tasks, top_level_ids, final_ids

    ordered: list[TaskDict] = []
    handled: set[str] = set()
    for task_id in final_ids:
        block = task_subtree_block(tasks, task_id)
        ordered.extend(block)
        handled.update(
            task["id"] for task in block if isinstance(task.get("id"), str)
        )
    ordered.extend(task for task in tasks if task.get("id") not in handled)
    return ordered, top_level_ids, final_ids


def reorder_direct_children(
    tasks: list[TaskDict],
    parent_id: str,
    requested_ids: list[str],
) -> tuple[list[TaskDict], list[str], list[str]]:
    child_ids = direct_child_ids(tasks, parent_id)
    final_ids = preferred_known_order(child_ids, requested_ids)
    if final_ids == child_ids:
        return tasks, child_ids, final_ids

    ordered_children: list[TaskDict] = []
    child_subtree_ids: set[str] = set()
    for child_id in final_ids:
        block = task_subtree_block(tasks, child_id)
        ordered_children.extend(block)
        child_subtree_ids.update(
            task["id"] for task in block if isinstance(task.get("id"), str)
        )

    without_children = [task for task in tasks if task.get("id") not in child_subtree_ids]
    parent_index = next(
        (index for index, task in enumerate(without_children) if task.get("id") == parent_id),
        -1,
    )
    if parent_index < 0:
        raise HTTPException(status_code=404, detail="Parent task not found")
    next_tasks = [*without_children]
    next_tasks[parent_index + 1 : parent_index + 1] = ordered_children
    return next_tasks, child_ids, final_ids
