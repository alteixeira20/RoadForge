from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import (
    RoadmapPhase,
    RoadmapTask,
    RoadmapTaskAssignee,
    RoadmapTaskDependency,
)


async def serialize_projection_to_snapshot(
    db: AsyncSession,
    roadmap_id: str,
) -> dict[str, Any]:
    phases_result = await db.execute(
        select(RoadmapPhase)
        .where(RoadmapPhase.roadmap_id == roadmap_id)
        .order_by(RoadmapPhase.position.asc(), RoadmapPhase.id.asc())
    )
    phases = phases_result.scalars().all()

    tasks_result = await db.execute(
        select(RoadmapTask)
        .where(RoadmapTask.roadmap_id == roadmap_id)
        .order_by(
            RoadmapTask.phase_id.asc(),
            RoadmapTask.position.asc(),
            RoadmapTask.id.asc(),
        )
    )
    tasks = tasks_result.scalars().all()
    tasks_by_id = {task.id: task for task in tasks}

    deps_result = await db.execute(
        select(RoadmapTaskDependency)
        .where(RoadmapTaskDependency.roadmap_id == roadmap_id)
        .order_by(
            RoadmapTaskDependency.created_at.asc(),
            RoadmapTaskDependency.id.asc(),
        )
    )
    deps_by_task_id: dict[str, list[str]] = {}
    for dep in deps_result.scalars().all():
        depends_on = tasks_by_id.get(dep.depends_on_task_id)
        if depends_on is not None:
            deps_by_task_id.setdefault(dep.task_id, []).append(
                depends_on.client_task_id
            )

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
        assignees_by_task_id.setdefault(assignee.task_id, []).append(
            assignee.display_name
        )

    tasks_by_phase_id: dict[str, list[RoadmapTask]] = {}
    for task in tasks:
        tasks_by_phase_id.setdefault(task.phase_id, []).append(task)

    snapshot_phases: list[dict[str, Any]] = []
    for phase in phases:
        phase_json = dict(phase.source_json or {})
        phase_json.update(
            {
                "id": phase.client_phase_id,
                "num": phase.num,
                "name": phase.name,
                "color": phase.color,
                "status": phase.status,
                "progress": phase.progress,
                "tasks": [],
            }
        )

        for task in tasks_by_phase_id.get(phase.id, []):
            task_json = dict(task.source_json or {})
            task_json.update(
                {"id": task.client_task_id, "title": task.title, "done": task.done}
            )
            if task.next is not None:
                task_json["next"] = task.next
            if task.est is not None:
                task_json["est"] = task.est
            if task.desc is not None:
                task_json["desc"] = task.desc
            if task.parent_task_id and task.parent_task_id in tasks_by_id:
                task_json["parentId"] = tasks_by_id[
                    task.parent_task_id
                ].client_task_id
            if task.tags_json is not None:
                task_json["tags"] = task.tags_json
            if task.id in assignees_by_task_id:
                task_json["assignees"] = assignees_by_task_id[task.id]
            if task.id in deps_by_task_id:
                task_json["deps"] = deps_by_task_id[task.id]
            if task.claimed_by_display_name is not None:
                task_json["claimedBy"] = task.claimed_by_display_name
            if task.claimed_by_participant_id is not None:
                task_json["claimedById"] = task.claimed_by_participant_id
            if task.claimed_at is not None:
                task_json["claimedAt"] = task.claimed_at.isoformat()
            phase_json["tasks"].append(task_json)

        snapshot_phases.append(phase_json)

    return {"phases": snapshot_phases}
