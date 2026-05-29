from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import (
    Roadmap,
    RoadmapPhase,
    RoadmapTask,
    RoadmapTaskAssignee,
    RoadmapTaskDependency,
)
from api.services.id_service import generate_id

logger = logging.getLogger(__name__)

_PHASE_KEYS = {"id", "num", "name", "color", "status", "progress", "tasks"}
_TASK_KEYS = {
    "id",
    "title",
    "done",
    "next",
    "est",
    "desc",
    "parentId",
    "tags",
    "assignees",
    "deps",
}


@dataclass(slots=True)
class ProjectionParityResult:
    ok: bool
    phase_count_snapshot: int
    phase_count_projection: int
    task_count_snapshot: int
    task_count_projection: int
    issues: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ProjectionDriftFinding:
    roadmap_id: str
    ok: bool
    issue_count: int
    issues: list[str] = field(default_factory=list)
    phase_count_snapshot: int = 0
    phase_count_projection: int = 0
    task_count_snapshot: int = 0
    task_count_projection: int = 0


@dataclass(slots=True)
class ProjectionDriftReport:
    checked_count: int
    successful_parity_count: int
    drift_count: int
    findings: list[ProjectionDriftFinding] = field(default_factory=list)

    @property
    def safe_to_enable_projection_reads(self) -> bool:
        return self.drift_count == 0


@dataclass(slots=True)
class ProjectionBackfillResult:
    backfilled_count: int
    drift_report: ProjectionDriftReport | None = None


def _source_json(row: dict[str, Any], explicit_keys: set[str]) -> dict[str, Any] | None:
    extra = {key: value for key, value in row.items() if key not in explicit_keys}
    return extra or None


def _snapshot_phases(snapshot_json: dict[str, Any]) -> list[dict[str, Any]]:
    phases = snapshot_json.get("phases", [])
    return phases if isinstance(phases, list) else []


def _snapshot_counts(snapshot_json: dict[str, Any]) -> tuple[int, int]:
    phases = _snapshot_phases(snapshot_json)
    task_count = 0
    for phase in phases:
        if isinstance(phase, dict) and isinstance(phase.get("tasks"), list):
            task_count += len(phase["tasks"])
    return len(phases), task_count


async def clear_roadmap_projection(db: AsyncSession, roadmap_id: str) -> None:
    await db.execute(
        delete(RoadmapTaskAssignee).where(RoadmapTaskAssignee.roadmap_id == roadmap_id)
    )
    await db.execute(
        delete(RoadmapTaskDependency).where(RoadmapTaskDependency.roadmap_id == roadmap_id)
    )
    await db.execute(delete(RoadmapTask).where(RoadmapTask.roadmap_id == roadmap_id))
    await db.execute(delete(RoadmapPhase).where(RoadmapPhase.roadmap_id == roadmap_id))
    await db.flush()


async def rebuild_roadmap_projection(db: AsyncSession, roadmap: Roadmap) -> None:
    await clear_roadmap_projection(db, roadmap.id)

    task_rows_by_client_id: dict[str, RoadmapTask] = {}
    pending_parents: list[tuple[RoadmapTask, str]] = []
    pending_deps: list[tuple[RoadmapTask, list[str]]] = []

    for phase_position, phase_data in enumerate(_snapshot_phases(roadmap.snapshot_json)):
        if not isinstance(phase_data, dict):
            continue

        phase = RoadmapPhase(
            id=generate_id("rp_"),
            roadmap_id=roadmap.id,
            client_phase_id=str(phase_data.get("id", "")),
            position=phase_position,
            num=str(phase_data.get("num", "")),
            name=str(phase_data.get("name", "")),
            color=str(phase_data.get("color", "")),
            status=str(phase_data.get("status", "future")),
            progress=int(phase_data.get("progress", 0)),
            source_json=_source_json(phase_data, _PHASE_KEYS),
        )
        db.add(phase)

        tasks = phase_data.get("tasks", [])
        if not isinstance(tasks, list):
            continue

        for task_position, task_data in enumerate(tasks):
            if not isinstance(task_data, dict):
                continue

            task = RoadmapTask(
                id=generate_id("rt_"),
                roadmap_id=roadmap.id,
                phase_id=phase.id,
                client_task_id=str(task_data.get("id", "")),
                position=task_position,
                title=str(task_data.get("title", "")),
                done=bool(task_data.get("done", False)),
                next=task_data.get("next") if isinstance(task_data.get("next"), bool) else None,
                est=task_data.get("est") if isinstance(task_data.get("est"), str) else None,
                desc=task_data.get("desc") if isinstance(task_data.get("desc"), str) else None,
                tags_json=(
                    task_data.get("tags") if isinstance(task_data.get("tags"), list) else None
                ),
                source_json=_source_json(task_data, _TASK_KEYS),
            )
            db.add(task)
            task_rows_by_client_id[task.client_task_id] = task

            parent_id = task_data.get("parentId")
            if isinstance(parent_id, str):
                pending_parents.append((task, parent_id))

            deps = task_data.get("deps")
            if isinstance(deps, list):
                pending_deps.append((task, [dep for dep in deps if isinstance(dep, str)]))

            assignees = task_data.get("assignees")
            if isinstance(assignees, list):
                seen_assignees: set[str] = set()
                for assignee_position, display_name in enumerate(assignees):
                    if not isinstance(display_name, str) or display_name in seen_assignees:
                        continue
                    seen_assignees.add(display_name)
                    db.add(RoadmapTaskAssignee(
                        id=generate_id("ra_"),
                        roadmap_id=roadmap.id,
                        task_id=task.id,
                        display_name=display_name,
                        position=assignee_position,
                    ))

    for task, parent_client_id in pending_parents:
        parent = task_rows_by_client_id.get(parent_client_id)
        if parent is not None and parent.id != task.id:
            task.parent_task_id = parent.id

    for task, dep_client_ids in pending_deps:
        seen_deps: set[str] = set()
        for dep_client_id in dep_client_ids:
            depends_on = task_rows_by_client_id.get(dep_client_id)
            if depends_on is None or depends_on.id == task.id or depends_on.id in seen_deps:
                continue
            seen_deps.add(depends_on.id)
            db.add(RoadmapTaskDependency(
                id=generate_id("rd_"),
                roadmap_id=roadmap.id,
                task_id=task.id,
                depends_on_task_id=depends_on.id,
            ))

    await db.flush()


async def sync_roadmap_projection_best_effort(
    db: AsyncSession,
    roadmap: Roadmap,
    context: str,
) -> None:
    await db.flush()

    try:
        async with db.begin_nested():
            await rebuild_roadmap_projection(db, roadmap)
    except (ValueError, TypeError, SQLAlchemyError) as exc:
        logger.warning(
            "roadmap projection sync failed; keeping canonical snapshot write",
            extra={"roadmap_id": roadmap.id, "context": context, "error": str(exc)},
            exc_info=True,
        )


def _active_roadmaps_stmt(limit: int | None = None):
    stmt = select(Roadmap).where(Roadmap.deleted_at.is_(None)).order_by(Roadmap.created_at.asc())
    if limit is not None:
        stmt = stmt.limit(limit)
    return stmt


async def _active_roadmaps(db: AsyncSession, limit: int | None = None) -> list[Roadmap]:
    result = await db.execute(_active_roadmaps_stmt(limit))
    return list(result.scalars().all())


async def backfill_all_roadmap_projections(db: AsyncSession, limit: int | None = None) -> int:
    roadmaps = await _active_roadmaps(db, limit)

    count = 0
    for roadmap in roadmaps:
        await rebuild_roadmap_projection(db, roadmap)
        await db.commit()
        count += 1
    return count


async def backfill_and_report_projection_drift(
    db: AsyncSession,
    limit: int | None = None,
    *,
    verify: bool = False,
) -> ProjectionBackfillResult:
    backfilled_count = await backfill_all_roadmap_projections(db, limit=limit)
    drift_report = await report_projection_drift(db, limit=limit) if verify else None
    return ProjectionBackfillResult(
        backfilled_count=backfilled_count,
        drift_report=drift_report,
    )


async def serialize_projection_to_snapshot(db: AsyncSession, roadmap_id: str) -> dict[str, Any]:
    phases_result = await db.execute(
        select(RoadmapPhase)
        .where(RoadmapPhase.roadmap_id == roadmap_id)
        .order_by(RoadmapPhase.position.asc(), RoadmapPhase.id.asc())
    )
    phases = phases_result.scalars().all()

    tasks_result = await db.execute(
        select(RoadmapTask)
        .where(RoadmapTask.roadmap_id == roadmap_id)
        .order_by(RoadmapTask.phase_id.asc(), RoadmapTask.position.asc(), RoadmapTask.id.asc())
    )
    tasks = tasks_result.scalars().all()
    tasks_by_id = {task.id: task for task in tasks}

    deps_result = await db.execute(
        select(RoadmapTaskDependency)
        .where(RoadmapTaskDependency.roadmap_id == roadmap_id)
        .order_by(RoadmapTaskDependency.created_at.asc(), RoadmapTaskDependency.id.asc())
    )
    deps_by_task_id: dict[str, list[str]] = {}
    for dep in deps_result.scalars().all():
        depends_on = tasks_by_id.get(dep.depends_on_task_id)
        if depends_on is not None:
            deps_by_task_id.setdefault(dep.task_id, []).append(depends_on.client_task_id)

    assignees_result = await db.execute(
        select(RoadmapTaskAssignee)
        .where(RoadmapTaskAssignee.roadmap_id == roadmap_id)
        .order_by(
            RoadmapTaskAssignee.task_id.asc(),
            RoadmapTaskAssignee.position.asc(),
            RoadmapTaskAssignee.id.asc(),
        )
    )
    assignees_by_task_id: dict[str, list[str]] = {}
    for assignee in assignees_result.scalars().all():
        assignees_by_task_id.setdefault(assignee.task_id, []).append(assignee.display_name)

    tasks_by_phase_id: dict[str, list[RoadmapTask]] = {}
    for task in tasks:
        tasks_by_phase_id.setdefault(task.phase_id, []).append(task)

    snapshot_phases: list[dict[str, Any]] = []
    for phase in phases:
        phase_json = dict(phase.source_json or {})
        phase_json.update({
            "id": phase.client_phase_id,
            "num": phase.num,
            "name": phase.name,
            "color": phase.color,
            "status": phase.status,
            "progress": phase.progress,
            "tasks": [],
        })

        for task in tasks_by_phase_id.get(phase.id, []):
            task_json = dict(task.source_json or {})
            task_json.update({"id": task.client_task_id, "title": task.title, "done": task.done})
            if task.next is not None:
                task_json["next"] = task.next
            if task.est is not None:
                task_json["est"] = task.est
            if task.desc is not None:
                task_json["desc"] = task.desc
            if task.parent_task_id and task.parent_task_id in tasks_by_id:
                task_json["parentId"] = tasks_by_id[task.parent_task_id].client_task_id
            if task.tags_json is not None:
                task_json["tags"] = task.tags_json
            if task.id in assignees_by_task_id:
                task_json["assignees"] = assignees_by_task_id[task.id]
            if task.id in deps_by_task_id:
                task_json["deps"] = deps_by_task_id[task.id]
            phase_json["tasks"].append(task_json)

        snapshot_phases.append(phase_json)

    return {"phases": snapshot_phases}


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
    if key in {"est", "desc"}:
        value = task.get(key)
        return value if isinstance(value, str) else None
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


async def validate_projection_parity(db: AsyncSession, roadmap: Roadmap) -> ProjectionParityResult:
    projection = await serialize_projection_to_snapshot(db, roadmap.id)
    snapshot_phase_count, snapshot_task_count = _snapshot_counts(roadmap.snapshot_json)
    projection_phase_count, projection_task_count = _snapshot_counts(projection)
    issues: list[str] = []

    if snapshot_phase_count != projection_phase_count:
        issues.append("phase count mismatch")
    if snapshot_task_count != projection_task_count:
        issues.append("task count mismatch")

    snapshot_phases = _snapshot_phases(roadmap.snapshot_json)
    projection_phases = _snapshot_phases(projection)
    snapshot_task_ids = {
        task.get("id")
        for phase in snapshot_phases
        if isinstance(phase, dict)
        for task in phase.get("tasks", [])
        if isinstance(task, dict) and isinstance(task.get("id"), str)
    }
    for phase_index, snapshot_phase in enumerate(snapshot_phases):
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
            for key in ("id", "title", "done", "next", "est", "desc"):
                _compare_scalar(
                    issues,
                    key,
                    task_owner,
                    _task_scalar_value(snapshot_task, key),
                    projection_task.get(key),
                )
            snapshot_parent = snapshot_task.get("parentId")
            if snapshot_parent not in snapshot_task_ids:
                snapshot_parent = None
            _compare_scalar(
                issues, "parentId", task_owner, snapshot_parent, projection_task.get("parentId")
            )
            snapshot_deps = snapshot_task.get("deps")
            if isinstance(snapshot_deps, list):
                snapshot_deps = [
                    dep
                    for dep in snapshot_deps
                    if isinstance(dep, str) and dep in snapshot_task_ids and dep != task_id
                ]
            # Dependency edge order is not canonical during this projection phase.
            _compare_optional_set(
                issues, "deps", task_id, snapshot_deps, projection_task.get("deps")
            )
            _compare_optional_list(
                issues, "assignees", task_id,
                snapshot_task.get("assignees"), projection_task.get("assignees"),
            )
            _compare_optional_list(
                issues, "tags", task_id,
                snapshot_task.get("tags"), projection_task.get("tags"),
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
        snapshot_phase_count, snapshot_task_count = _snapshot_counts(roadmap.snapshot_json)
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


async def report_projection_drift(
    db: AsyncSession,
    limit: int | None = None,
) -> ProjectionDriftReport:
    findings = [
        await report_roadmap_projection_drift(db, roadmap)
        for roadmap in await _active_roadmaps(db, limit)
    ]
    successful_parity_count = sum(1 for finding in findings if finding.ok)
    drift_count = len(findings) - successful_parity_count
    return ProjectionDriftReport(
        checked_count=len(findings),
        successful_parity_count=successful_parity_count,
        drift_count=drift_count,
        findings=findings,
    )
