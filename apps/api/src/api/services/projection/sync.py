from __future__ import annotations

import logging
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
from api.services.projection.snapshot import (
    _PHASE_KEYS,
    _TASK_KEYS,
    parse_claimed_at as _parse_claimed_at,
    snapshot_phases as _snapshot_phases,
    source_json as _source_json,
)

logger = logging.getLogger(__name__)


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


async def _existing_projection_rows(
    db: AsyncSession,
    roadmap_id: str,
) -> tuple[
    dict[str, RoadmapPhase],
    dict[str, RoadmapTask],
    dict[str, list[RoadmapTaskAssignee]],
    dict[str, list[RoadmapTaskDependency]],
]:
    phases = (
        await db.execute(select(RoadmapPhase).where(RoadmapPhase.roadmap_id == roadmap_id))
    ).scalars().all()
    tasks = (
        await db.execute(select(RoadmapTask).where(RoadmapTask.roadmap_id == roadmap_id))
    ).scalars().all()
    assignees = (
        await db.execute(
            select(RoadmapTaskAssignee)
            .where(RoadmapTaskAssignee.roadmap_id == roadmap_id)
            .order_by(
                RoadmapTaskAssignee.task_id.asc(),
                RoadmapTaskAssignee.position.asc(),
                RoadmapTaskAssignee.id.asc(),
            )
        )
    ).scalars().all()
    dependencies = (
        await db.execute(
            select(RoadmapTaskDependency).where(
                RoadmapTaskDependency.roadmap_id == roadmap_id
            )
        )
    ).scalars().all()

    assignees_by_task: dict[str, list[RoadmapTaskAssignee]] = {}
    for assignee in assignees:
        assignees_by_task.setdefault(assignee.task_id, []).append(assignee)

    dependencies_by_task: dict[str, list[RoadmapTaskDependency]] = {}
    for dependency in dependencies:
        dependencies_by_task.setdefault(dependency.task_id, []).append(dependency)

    return (
        {phase.client_phase_id: phase for phase in phases},
        {task.client_task_id: task for task in tasks},
        assignees_by_task,
        dependencies_by_task,
    )


def _apply_phase_data(phase: RoadmapPhase, phase_data: dict[str, Any], position: int) -> None:
    phase.position = position
    phase.num = str(phase_data.get("num", ""))
    phase.name = str(phase_data.get("name", ""))
    phase.color = str(phase_data.get("color", ""))
    phase.status = str(phase_data.get("status", "future"))
    phase.progress = int(phase_data.get("progress", 0))
    phase.source_json = _source_json(phase_data, _PHASE_KEYS)


def _apply_task_data(
    task: RoadmapTask,
    phase: RoadmapPhase,
    task_data: dict[str, Any],
    position: int,
) -> None:
    task.phase_id = phase.id
    task.position = position
    task.title = str(task_data.get("title", ""))
    task.done = bool(task_data.get("done", False))
    task.next = task_data.get("next") if isinstance(task_data.get("next"), bool) else None
    task.est = task_data.get("est") if isinstance(task_data.get("est"), str) else None
    task.desc = task_data.get("desc") if isinstance(task_data.get("desc"), str) else None
    task.tags_json = task_data.get("tags") if isinstance(task_data.get("tags"), list) else None
    task.claimed_by_display_name = (
        task_data.get("claimedBy") if isinstance(task_data.get("claimedBy"), str) else None
    )
    task.claimed_by_participant_id = (
        task_data.get("claimedById") if isinstance(task_data.get("claimedById"), str) else None
    )
    task.claimed_at = _parse_claimed_at(task_data.get("claimedAt"))
    task.source_json = _source_json(task_data, _TASK_KEYS)


def _desired_assignees(task_data: dict[str, Any]) -> list[str]:
    values = task_data.get("assignees")
    if not isinstance(values, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, str) or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


async def _sync_assignees(
    db: AsyncSession,
    roadmap_id: str,
    task: RoadmapTask,
    task_data: dict[str, Any],
    existing: list[RoadmapTaskAssignee],
) -> None:
    desired = _desired_assignees(task_data)
    current = [assignee.display_name for assignee in existing]
    if current == desired:
        return
    await db.execute(
        delete(RoadmapTaskAssignee).where(
            RoadmapTaskAssignee.roadmap_id == roadmap_id,
            RoadmapTaskAssignee.task_id == task.id,
        )
    )
    for position, display_name in enumerate(desired):
        db.add(
            RoadmapTaskAssignee(
                id=generate_id("ra_"),
                roadmap_id=roadmap_id,
                task_id=task.id,
                display_name=display_name,
                position=position,
            )
        )


def _desired_dependencies(
    task: RoadmapTask,
    task_data: dict[str, Any],
    task_rows_by_client_id: dict[str, RoadmapTask],
) -> list[str]:
    values = task_data.get("deps")
    if not isinstance(values, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for client_id in values:
        depends_on = (
            task_rows_by_client_id.get(client_id) if isinstance(client_id, str) else None
        )
        if depends_on is None or depends_on.id == task.id or depends_on.id in seen:
            continue
        seen.add(depends_on.id)
        result.append(depends_on.id)
    return result


async def _sync_dependencies(
    db: AsyncSession,
    roadmap_id: str,
    task: RoadmapTask,
    task_data: dict[str, Any],
    task_rows_by_client_id: dict[str, RoadmapTask],
    existing: list[RoadmapTaskDependency],
) -> None:
    desired = _desired_dependencies(task, task_data, task_rows_by_client_id)
    current = {dependency.depends_on_task_id for dependency in existing}
    if current == set(desired):
        return
    await db.execute(
        delete(RoadmapTaskDependency).where(
            RoadmapTaskDependency.roadmap_id == roadmap_id,
            RoadmapTaskDependency.task_id == task.id,
        )
    )
    for depends_on_task_id in desired:
        db.add(
            RoadmapTaskDependency(
                id=generate_id("rd_"),
                roadmap_id=roadmap_id,
                task_id=task.id,
                depends_on_task_id=depends_on_task_id,
            )
        )


async def rebuild_roadmap_projection(db: AsyncSession, roadmap: Roadmap) -> None:
    """Synchronize the full derivative projection without recreating stable rows.

    Full roadmap saves may add, move, or remove arbitrary phases and tasks, so the
    snapshot must be scanned. Existing phase/task rows are updated in place and
    only changed bounded relationships are replaced. This avoids delete/reinsert
    amplification and preserves projection row identity across ordinary autosaves.
    """
    (
        existing_phases,
        existing_tasks,
        existing_assignees,
        existing_dependencies,
    ) = await _existing_projection_rows(db, roadmap.id)

    phase_rows_by_client_id: dict[str, RoadmapPhase] = {}
    task_rows_by_client_id: dict[str, RoadmapTask] = {}
    task_data_by_client_id: dict[str, dict[str, Any]] = {}

    for phase_position, phase_data in enumerate(_snapshot_phases(roadmap.snapshot_json)):
        if not isinstance(phase_data, dict):
            continue
        client_phase_id = str(phase_data.get("id", ""))
        phase = existing_phases.get(client_phase_id)
        if phase is None:
            phase = RoadmapPhase(
                id=generate_id("rp_"),
                roadmap_id=roadmap.id,
                client_phase_id=client_phase_id,
                position=phase_position,
                num="",
                name="",
                color="",
                status="future",
                progress=0,
            )
            db.add(phase)
        _apply_phase_data(phase, phase_data, phase_position)
        phase_rows_by_client_id[client_phase_id] = phase

        tasks = phase_data.get("tasks")
        if not isinstance(tasks, list):
            continue
        for task_position, task_data in enumerate(tasks):
            if not isinstance(task_data, dict):
                continue
            client_task_id = str(task_data.get("id", ""))
            task = existing_tasks.get(client_task_id)
            if task is None:
                task = RoadmapTask(
                    id=generate_id("rt_"),
                    roadmap_id=roadmap.id,
                    phase_id=phase.id,
                    client_task_id=client_task_id,
                    position=task_position,
                    title="",
                    done=False,
                )
                db.add(task)
            _apply_task_data(task, phase, task_data, task_position)
            task_rows_by_client_id[client_task_id] = task
            task_data_by_client_id[client_task_id] = task_data

    # Persist moves before deleting phases that no longer exist.
    await db.flush()

    removed_task_ids = {
        task.id
        for client_id, task in existing_tasks.items()
        if client_id not in task_rows_by_client_id
    }
    if removed_task_ids:
        await db.execute(
            delete(RoadmapTaskDependency).where(
                RoadmapTaskDependency.roadmap_id == roadmap.id,
                (RoadmapTaskDependency.task_id.in_(removed_task_ids))
                | (RoadmapTaskDependency.depends_on_task_id.in_(removed_task_ids)),
            )
        )
        await db.execute(
            delete(RoadmapTaskAssignee).where(
                RoadmapTaskAssignee.roadmap_id == roadmap.id,
                RoadmapTaskAssignee.task_id.in_(removed_task_ids),
            )
        )
        await db.execute(
            delete(RoadmapTask).where(
                RoadmapTask.roadmap_id == roadmap.id,
                RoadmapTask.id.in_(removed_task_ids),
            )
        )

    removed_phase_ids = {
        phase.id
        for client_id, phase in existing_phases.items()
        if client_id not in phase_rows_by_client_id
    }
    if removed_phase_ids:
        await db.execute(
            delete(RoadmapPhase).where(
                RoadmapPhase.roadmap_id == roadmap.id,
                RoadmapPhase.id.in_(removed_phase_ids),
            )
        )

    for client_task_id, task in task_rows_by_client_id.items():
        task_data = task_data_by_client_id[client_task_id]
        parent_client_id = task_data.get("parentId")
        parent = (
            task_rows_by_client_id.get(parent_client_id)
            if isinstance(parent_client_id, str)
            else None
        )
        task.parent_task_id = parent.id if parent is not None and parent.id != task.id else None
        await _sync_assignees(
            db,
            roadmap.id,
            task,
            task_data,
            existing_assignees.get(task.id, []),
        )
        await _sync_dependencies(
            db,
            roadmap.id,
            task,
            task_data,
            task_rows_by_client_id,
            existing_dependencies.get(task.id, []),
        )

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


def _snapshot_task(
    snapshot_json: dict[str, Any],
    task_id: str,
) -> tuple[int, dict[str, Any], int, dict[str, Any]] | None:
    for phase_position, phase_data in enumerate(_snapshot_phases(snapshot_json)):
        if not isinstance(phase_data, dict):
            continue
        tasks = phase_data.get("tasks")
        if not isinstance(tasks, list):
            continue
        for task_position, task_data in enumerate(tasks):
            if isinstance(task_data, dict) and task_data.get("id") == task_id:
                return phase_position, phase_data, task_position, task_data
    return None


async def _replace_task_assignees(
    db: AsyncSession,
    roadmap_id: str,
    task: RoadmapTask,
    task_data: dict[str, Any],
) -> None:
    await db.execute(
        delete(RoadmapTaskAssignee).where(
            RoadmapTaskAssignee.roadmap_id == roadmap_id,
            RoadmapTaskAssignee.task_id == task.id,
        )
    )
    assignees = task_data.get("assignees")
    if not isinstance(assignees, list):
        return

    seen: set[str] = set()
    for position, display_name in enumerate(assignees):
        if not isinstance(display_name, str) or display_name in seen:
            continue
        seen.add(display_name)
        db.add(
            RoadmapTaskAssignee(
                id=generate_id("ra_"),
                roadmap_id=roadmap_id,
                task_id=task.id,
                display_name=display_name,
                position=position,
            )
        )


async def sync_task_projection(
    db: AsyncSession,
    roadmap: Roadmap,
    task_id: str,
) -> None:
    """Synchronize one canonical task into the derivative relational projection.

    Task edits, completion changes, and claim changes must stay O(1) in written
    rows. A missing or structurally incomplete projection falls back to one full
    rebuild so old deployments can repair themselves without serving stale data.
    """
    located = _snapshot_task(roadmap.snapshot_json, task_id)
    if located is None:
        raise ValueError(f"task {task_id!r} is missing from the canonical snapshot")
    phase_position, phase_data, task_position, task_data = located

    phase = await db.scalar(
        select(RoadmapPhase).where(
            RoadmapPhase.roadmap_id == roadmap.id,
            RoadmapPhase.client_phase_id == str(phase_data.get("id", "")),
        )
    )
    task = await db.scalar(
        select(RoadmapTask).where(
            RoadmapTask.roadmap_id == roadmap.id,
            RoadmapTask.client_task_id == task_id,
        )
    )
    if phase is None or task is None:
        await rebuild_roadmap_projection(db, roadmap)
        return

    phase.position = phase_position
    phase.num = str(phase_data.get("num", ""))
    phase.name = str(phase_data.get("name", ""))
    phase.color = str(phase_data.get("color", ""))
    phase.status = str(phase_data.get("status", "future"))
    phase.progress = int(phase_data.get("progress", 0))
    phase.source_json = _source_json(phase_data, _PHASE_KEYS)

    task.phase_id = phase.id
    task.position = task_position
    task.title = str(task_data.get("title", ""))
    task.done = bool(task_data.get("done", False))
    task.next = task_data.get("next") if isinstance(task_data.get("next"), bool) else None
    task.est = task_data.get("est") if isinstance(task_data.get("est"), str) else None
    task.desc = task_data.get("desc") if isinstance(task_data.get("desc"), str) else None
    task.tags_json = task_data.get("tags") if isinstance(task_data.get("tags"), list) else None
    task.claimed_by_display_name = (
        task_data.get("claimedBy") if isinstance(task_data.get("claimedBy"), str) else None
    )
    task.claimed_by_participant_id = (
        task_data.get("claimedById") if isinstance(task_data.get("claimedById"), str) else None
    )
    task.claimed_at = _parse_claimed_at(task_data.get("claimedAt"))
    task.source_json = _source_json(task_data, _TASK_KEYS)

    # Partial task endpoints cannot move tasks or edit parent/dependency edges.
    # Preserve those projection relationships and update only mutable task data.
    await _replace_task_assignees(db, roadmap.id, task, task_data)
    await db.flush()


async def sync_task_projection_best_effort(
    db: AsyncSession,
    roadmap: Roadmap,
    task_id: str,
    context: str,
) -> None:
    await db.flush()
    try:
        async with db.begin_nested():
            await sync_task_projection(db, roadmap, task_id)
    except (ValueError, TypeError, SQLAlchemyError) as exc:
        logger.warning(
            "task projection sync failed; keeping canonical snapshot write",
            extra={
                "roadmap_id": roadmap.id,
                "task_id": task_id,
                "context": context,
                "error": str(exc),
            },
            exc_info=True,
        )
