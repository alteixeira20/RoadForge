'Roadmap task snapshot patch helpers.'

from dataclasses import dataclass
from typing import Any

_TASK_PATCH_FIELDS = ("title", "desc", "est", "complexity", "assignees", "tags", "links")


@dataclass(frozen=True, slots=True)
class TaskSnapshotPatch:
    snapshot_json: dict[str, Any]
    phase: dict[str, Any]
    before_task: dict[str, Any]
    after_task: dict[str, Any]
    changed_fields: list[str]


def optional_task_value(task: dict[str, Any], field: str) -> Any:
    value = task.get(field)
    if field in {"assignees", "tags"}:
        return value if isinstance(value, list) and value else None
    if field == "links":
        return value if isinstance(value, list) else None
    return None if value is None or value == "" else value


def set_task_patch_value(task: dict[str, Any], field: str, value: Any) -> None:
    if value is None:
        task.pop(field, None)
    else:
        task[field] = value


def changed_task_patch_fields(
    task: dict[str, Any],
    updates: dict[str, Any],
) -> list[str]:
    changed_fields: list[str] = []
    for field in _TASK_PATCH_FIELDS:
        if field not in updates:
            continue
        before = task.get(field) if field == "title" else optional_task_value(task, field)
        after = updates[field] if field == "title" else optional_task_value(updates, field)
        if before != after:
            changed_fields.append(field)
    return changed_fields


def patch_task_fields_in_snapshot(
    snapshot_json: dict[str, Any],
    task_id: str,
    updates: dict[str, Any],
) -> TaskSnapshotPatch | None:
    phases = snapshot_json.get("phases", [])
    if not isinstance(phases, list):
        return None

    for phase_index, phase in enumerate(phases):
        if not isinstance(phase, dict) or not isinstance(phase.get("tasks"), list):
            continue
        for task_index, task in enumerate(phase["tasks"]):
            if not isinstance(task, dict) or task.get("id") != task_id:
                continue

            changed_fields = changed_task_patch_fields(task, updates)
            next_task = dict(task)
            for field in changed_fields:
                set_task_patch_value(next_task, field, updates[field])

            if not changed_fields:
                return TaskSnapshotPatch(snapshot_json, phase, task, task, [])

            next_tasks = list(phase["tasks"])
            next_tasks[task_index] = next_task
            next_phase = dict(phase)
            next_phase["tasks"] = next_tasks
            next_phases = list(phases)
            next_phases[phase_index] = next_phase
            next_snapshot = dict(snapshot_json)
            next_snapshot["phases"] = next_phases
            return TaskSnapshotPatch(
                next_snapshot,
                phase,
                task,
                next_task,
                changed_fields,
            )
    return None


def legacy_task_assignees(task: dict[str, Any]) -> list[str]:
    tags = task.get("tags")
    result: list[str] = []
    for value in tags if isinstance(tags, list) else []:
        if not isinstance(value, str):
            continue
        prefix, separator, name = value.strip().partition(":")
        if separator and prefix.casefold() in {"owner", "review"}:
            result.append(name)
    return result


def add_task_assignee(task: dict[str, Any], display_name: str) -> None:
    assignees = task.get("assignees")
    names = list(assignees) if isinstance(assignees, list) else []
    if not names:
        names = legacy_task_assignees(task)

    result: list[str] = []
    seen: set[str] = set()

    for value in [*names, display_name]:
        if not isinstance(value, str):
            continue
        clean = " ".join(value.split())
        key = clean.casefold()
        if not clean or key in seen:
            continue
        seen.add(key)
        result.append(clean)

    task["assignees"] = result


def phase_progress(tasks: list[Any]) -> int:
    valid_tasks = [task for task in tasks if isinstance(task, dict)]
    if not valid_tasks:
        return 0
    done_count = sum(1 for task in valid_tasks if bool(task.get("done", False)))
    return round(done_count / len(valid_tasks) * 100)


def patch_task_done_snapshot(
    snapshot_json: dict[str, Any],
    task_id: str,
    done: bool,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]] | None:
    phases = snapshot_json.get("phases", [])
    if not isinstance(phases, list):
        return None

    next_phases: list[Any] = []
    found: tuple[dict[str, Any], dict[str, Any]] | None = None
    for phase in phases:
        if not isinstance(phase, dict):
            next_phases.append(phase)
            continue

        tasks = phase.get("tasks", [])
        if not isinstance(tasks, list):
            next_phases.append(dict(phase))
            continue

        next_tasks = []
        for task in tasks:
            if not isinstance(task, dict) or task.get("id") != task_id or found is not None:
                next_tasks.append(task)
                continue

            next_task = dict(task)
            found = (phase, task)
            next_task["done"] = done
            if done:
                # Marking done clears the claim so completed tasks are not stuck as claimed.
                next_task.pop("claimedBy", None)
                next_task.pop("claimedById", None)
                next_task.pop("claimedAt", None)
            next_tasks.append(next_task)

        next_phase = dict(phase)
        next_phase["tasks"] = next_tasks
        if found is not None and phase is found[0]:
            next_phase["progress"] = phase_progress(next_tasks)
        next_phases.append(next_phase)

    if found is None:
        return None
    phase, task = found
    next_snapshot = dict(snapshot_json)
    next_snapshot["phases"] = next_phases
    return next_snapshot, phase, task


def patch_task_claim_snapshot(
    snapshot_json: dict[str, Any],
    task_id: str,
    claimed_by: str | None,
    claimed_by_id: str | None,
    claimed_at: str | None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]] | None:
    """Return (next_snapshot, phase_dict, original_task_dict) or None if task not found."""
    phases = snapshot_json.get("phases", [])
    if not isinstance(phases, list):
        return None

    next_phases: list[Any] = []
    found: tuple[dict[str, Any], dict[str, Any]] | None = None

    for phase in phases:
        if not isinstance(phase, dict):
            next_phases.append(phase)
            continue

        tasks = phase.get("tasks", [])
        if not isinstance(tasks, list):
            next_phases.append(dict(phase))
            continue

        next_tasks = []
        for task in tasks:
            if not isinstance(task, dict) or task.get("id") != task_id or found is not None:
                next_tasks.append(task)
                continue

            found = (phase, task)
            next_task = dict(task)
            if claimed_by is not None:
                add_task_assignee(next_task, claimed_by)
                next_task["claimedBy"] = claimed_by
                next_task["claimedById"] = claimed_by_id
                next_task["claimedAt"] = claimed_at
            else:
                next_task.pop("claimedBy", None)
                next_task.pop("claimedById", None)
                next_task.pop("claimedAt", None)
            next_tasks.append(next_task)

        next_phase = dict(phase)
        next_phase["tasks"] = next_tasks
        next_phases.append(next_phase)

    if found is None:
        return None
    phase, task = found
    next_snapshot = dict(snapshot_json)
    next_snapshot["phases"] = next_phases
    return next_snapshot, phase, task
