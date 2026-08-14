from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import Roadmap
from api.services.projection.serialize import serialize_projection_to_snapshot
from api.services.projection.snapshot import (
    parse_claimed_at,
    snapshot_counts,
    snapshot_phases,
)
from api.services.projection.types import (
    ProjectionDriftFinding,
    ProjectionParityResult,
)


def _compare_optional_list(
    issues: list[str],
    label: str,
    task_id: str,
    snapshot_value: Any,
    projection_value: Any,
) -> None:
    normalized_snapshot = snapshot_value if isinstance(snapshot_value, list) else []
    normalized_projection = projection_value if isinstance(projection_value, list) else []
    if normalized_snapshot != normalized_projection:
        issues.append(f"task {task_id} {label} mismatch")


def _compare_scalar(
    issues: list[str],
    label: str,
    owner: str,
    snapshot_value: Any,
    projection_value: Any,
) -> None:
    if snapshot_value != projection_value:
        issues.append(f"{owner} {label} mismatch")


def _phase_scalar_value(phase: dict[str, Any], key: str) -> Any:
    if key == "progress":
        try:
            return int(phase.get("progress", 0))
        except (TypeError, ValueError):
            return phase.get("progress")
    return str(phase.get(key, ""))


def _task_scalar_value(task: dict[str, Any], key: str) -> Any:
    if key == "done":
        return bool(task.get("done", False))
    if key == "next":
        value = task.get("next")
        return value if isinstance(value, bool) else None
    if key in {"est", "desc", "claimedBy", "claimedById"}:
        value = task.get(key)
        return value if isinstance(value, str) else None
    if key == "claimedAt":
        value = task.get(key)
        parsed = parse_claimed_at(value)
        return parsed if parsed is not None else value
    return str(task.get(key, ""))


def _compare_optional_set(
    issues: list[str],
    label: str,
    task_id: str,
    snapshot_value: Any,
    projection_value: Any,
) -> None:
    normalized_snapshot = set(snapshot_value if isinstance(snapshot_value, list) else [])
    normalized_projection = set(projection_value if isinstance(projection_value, list) else [])
    if normalized_snapshot != normalized_projection:
        issues.append(f"task {task_id} {label} mismatch")


async def validate_projection_parity(
    db: AsyncSession,
    roadmap: Roadmap,
) -> ProjectionParityResult:
    projection = await serialize_projection_to_snapshot(db, roadmap.id)
    snapshot_phase_count, snapshot_task_count = snapshot_counts(roadmap.snapshot_json)
    projection_phase_count, projection_task_count = snapshot_counts(projection)
    issues: list[str] = []

    if snapshot_phase_count != projection_phase_count:
        issues.append("phase count mismatch")
    if snapshot_task_count != projection_task_count:
        issues.append("task count mismatch")

    snapshot_phase_rows = snapshot_phases(roadmap.snapshot_json)
    projection_phases = snapshot_phases(projection)
    snapshot_task_ids = {
        task.get("id")
        for phase in snapshot_phase_rows
        if isinstance(phase, dict)
        for task in phase.get("tasks", [])
        if isinstance(task, dict) and isinstance(task.get("id"), str)
    }
    for phase_index, snapshot_phase in enumerate(snapshot_phase_rows):
        if phase_index >= len(projection_phases) or not isinstance(snapshot_phase, dict):
            continue
        projection_phase = projection_phases[phase_index]
        if snapshot_phase.get("id") != projection_phase.get("id"):
            issues.append(f"phase order/id mismatch at {phase_index}")
        phase_owner = f"phase {snapshot_phase.get('id', phase_index)}"
        for key in ("id", "num", "name", "color", "status", "progress"):
            _compare_scalar(
                issues,
                key,
                phase_owner,
                _phase_scalar_value(snapshot_phase, key),
                projection_phase.get(key),
            )

        snapshot_tasks = snapshot_phase.get("tasks", [])
        projection_tasks = projection_phase.get("tasks", [])
        if not isinstance(snapshot_tasks, list) or not isinstance(projection_tasks, list):
            continue
        for task_index, snapshot_task in enumerate(snapshot_tasks):
            if task_index >= len(projection_tasks) or not isinstance(snapshot_task, dict):
                continue
            projection_task = projection_tasks[task_index]
            task_id = _task_scalar_value(snapshot_task, "id")
            if snapshot_task.get("id") != projection_task.get("id"):
                issues.append(f"task order/id mismatch at {phase_index}/{task_index}")
            task_owner = f"task {task_id}"
            for key in (
                "id",
                "title",
                "done",
                "next",
                "est",
                "desc",
                "claimedBy",
                "claimedById",
                "claimedAt",
            ):
                _compare_scalar(
                    issues,
                    key,
                    task_owner,
                    _task_scalar_value(snapshot_task, key),
                    _task_scalar_value(projection_task, key),
                )
            snapshot_parent = snapshot_task.get("parentId")
            if snapshot_parent not in snapshot_task_ids:
                snapshot_parent = None
            _compare_scalar(
                issues,
                "parentId",
                task_owner,
                snapshot_parent,
                projection_task.get("parentId"),
            )
            snapshot_deps = snapshot_task.get("deps")
            if isinstance(snapshot_deps, list):
                snapshot_deps = [
                    dep
                    for dep in snapshot_deps
                    if isinstance(dep, str)
                    and dep in snapshot_task_ids
                    and dep != task_id
                ]
            _compare_optional_set(
                issues,
                "deps",
                task_id,
                snapshot_deps,
                projection_task.get("deps"),
            )
            _compare_optional_list(
                issues,
                "assignees",
                task_id,
                snapshot_task.get("assignees"),
                projection_task.get("assignees"),
            )
            _compare_optional_list(
                issues,
                "tags",
                task_id,
                snapshot_task.get("tags"),
                projection_task.get("tags"),
            )
            _compare_optional_list(
                issues,
                "links",
                task_id,
                snapshot_task.get("links"),
                projection_task.get("links"),
            )

    return ProjectionParityResult(
        ok=not issues,
        phase_count_snapshot=snapshot_phase_count,
        phase_count_projection=projection_phase_count,
        task_count_snapshot=snapshot_task_count,
        task_count_projection=projection_task_count,
        issues=issues,
    )


async def report_roadmap_projection_drift(
    db: AsyncSession,
    roadmap: Roadmap,
) -> ProjectionDriftFinding:
    try:
        parity = await validate_projection_parity(db, roadmap)
    except Exception as exc:
        snapshot_phase_count, snapshot_task_count = snapshot_counts(roadmap.snapshot_json)
        return ProjectionDriftFinding(
            roadmap_id=roadmap.id,
            ok=False,
            issue_count=1,
            issues=[f"parity check raised {type(exc).__name__}"],
            phase_count_snapshot=snapshot_phase_count,
            task_count_snapshot=snapshot_task_count,
        )

    return ProjectionDriftFinding(
        roadmap_id=roadmap.id,
        ok=parity.ok,
        issue_count=len(parity.issues),
        issues=parity.issues,
        phase_count_snapshot=parity.phase_count_snapshot,
        phase_count_projection=parity.phase_count_projection,
        task_count_snapshot=parity.task_count_snapshot,
        task_count_projection=parity.task_count_projection,
    )
