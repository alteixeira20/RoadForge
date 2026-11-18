"""Bounded roadmap reads built from the existing authoritative roadmap service."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas.focused import (
    FocusedContextResult,
    FocusedContextTask,
    FocusedNextTask,
    FocusedPhaseContext,
    FocusedPhaseSummary,
    FocusedTaskSearchResult,
    FocusedTaskSearchTask,
    RoadmapContextResponse,
    RoadmapRevisionResponse,
    RoadmapSummaryResponse,
    TaskDetailResponse,
    TaskSearchResponse,
)
from api.schemas.roadmap import RoadmapResponse
from api.services.roadmap_query import fetch_active_roadmap
from api.services.roadmap_service import get_roadmap


def _phase_context(phase) -> FocusedPhaseContext:
    return FocusedPhaseContext(
        id=phase.id,
        num=phase.num,
        name=phase.name,
        status=phase.status,
        progress=phase.progress,
    )


def _phase_summary(phase) -> FocusedPhaseSummary:
    task_count = len(phase.tasks)
    completed = sum(1 for task in phase.tasks if task.done)
    return FocusedPhaseSummary(
        id=phase.id,
        num=phase.num,
        name=phase.name,
        status=phase.status,
        progress=phase.progress,
        task_count=task_count,
        completed_task_count=completed,
        open_task_count=task_count - completed,
    )


def build_roadmap_summary(
    roadmap: RoadmapResponse,
    *,
    max_next: int = 20,
) -> RoadmapSummaryResponse:
    tasks = [task for phase in roadmap.phases for task in phase.tasks]
    completed = sum(1 for task in tasks if task.done)
    next_tasks = [
        FocusedNextTask(
            id=task.id,
            title=task.title,
            phase_id=phase.id,
            phase_name=phase.name,
        )
        for phase in roadmap.phases
        for task in phase.tasks
        if task.next and not task.done
    ]
    return RoadmapSummaryResponse(
        roadmap_id=roadmap.id,
        name=roadmap.name,
        updated_at=roadmap.updated_at,
        phase_count=len(roadmap.phases),
        total_task_count=len(tasks),
        open_task_count=len(tasks) - completed,
        completed_task_count=completed,
        completion_percent=round((completed / len(tasks)) * 100) if tasks else 0,
        phases=[_phase_summary(phase) for phase in roadmap.phases],
        next_task_count=len(next_tasks),
        next_tasks=next_tasks[:max_next],
        next_tasks_truncated=len(next_tasks) > max_next,
    )


async def get_roadmap_summary(
    db: AsyncSession,
    roadmap_id: str,
    *,
    max_next: int = 20,
) -> RoadmapSummaryResponse:
    return build_roadmap_summary(await get_roadmap(db, roadmap_id), max_next=max_next)


async def get_roadmap_revision(
    db: AsyncSession,
    roadmap_id: str,
) -> RoadmapRevisionResponse:
    roadmap = await fetch_active_roadmap(db, roadmap_id)
    return RoadmapRevisionResponse(roadmap_id=roadmap.id, updated_at=roadmap.updated_at)


def _searchable_task_text(phase, task) -> str:
    return "\n".join(
        value
        for value in (
            task.id,
            task.title,
            task.desc,
            phase.id,
            phase.name,
            *(task.tags or []),
            *(task.assignees or []),
        )
        if isinstance(value, str)
    ).casefold()


def build_task_search(
    roadmap: RoadmapResponse,
    query: str,
    *,
    include_completed: bool = False,
    limit: int = 20,
) -> TaskSearchResponse:
    needle = query.strip().casefold()
    matches: list[FocusedTaskSearchResult] = []
    for phase in roadmap.phases:
        for task in phase.tasks:
            if task.done and not include_completed:
                continue
            if needle not in _searchable_task_text(phase, task):
                continue
            matches.append(
                FocusedTaskSearchResult(
                    phase=_phase_context(phase),
                    task=FocusedTaskSearchTask(
                        id=task.id,
                        title=task.title,
                        done=task.done,
                        next=bool(task.next),
                        tags=list(task.tags or []),
                        assignees=list(task.assignees or []),
                    ),
                )
            )
    returned = matches[:limit]
    return TaskSearchResponse(
        roadmap_id=roadmap.id,
        updated_at=roadmap.updated_at,
        query=query,
        matching_task_count=len(matches),
        returned_task_count=len(returned),
        omitted_task_count=max(0, len(matches) - len(returned)),
        truncated=len(matches) > len(returned),
        results=returned,
    )


async def search_roadmap_tasks(
    db: AsyncSession,
    roadmap_id: str,
    query: str,
    *,
    include_completed: bool = False,
    limit: int = 20,
) -> TaskSearchResponse:
    return build_task_search(
        await get_roadmap(db, roadmap_id),
        query,
        include_completed=include_completed,
        limit=limit,
    )


def build_task_detail(roadmap: RoadmapResponse, task_id: str) -> TaskDetailResponse:
    for phase in roadmap.phases:
        for task in phase.tasks:
            if task.id == task_id:
                return TaskDetailResponse(
                    roadmap_id=roadmap.id,
                    updated_at=roadmap.updated_at,
                    phase=_phase_context(phase),
                    task=task,
                )
    raise HTTPException(status_code=404, detail="Task not found")


async def get_roadmap_task(
    db: AsyncSession,
    roadmap_id: str,
    task_id: str,
) -> TaskDetailResponse:
    return build_task_detail(await get_roadmap(db, roadmap_id), task_id)


def _description_preview(value: str | None) -> str | None:
    if not value:
        return None
    normalized = " ".join(value.split())
    if len(normalized) <= 240:
        return normalized
    return f"{normalized[:239].rstrip()}…"


def build_roadmap_context(
    roadmap: RoadmapResponse,
    *,
    phase_ids: set[str] | None = None,
    task_ids: set[str] | None = None,
    open_only: bool = False,
    next_only: bool = False,
    include_descriptions: bool = False,
    limit: int = 200,
) -> RoadmapContextResponse:
    all_tasks = [task for phase in roadmap.phases for task in phase.tasks]
    completed = sum(1 for task in all_tasks if task.done)
    matches: list[FocusedContextResult] = []

    for phase in roadmap.phases:
        if phase_ids and phase.id not in phase_ids:
            continue
        for task in phase.tasks:
            if task_ids and task.id not in task_ids:
                continue
            if open_only and task.done:
                continue
            if next_only and (task.done or not task.next):
                continue
            matches.append(
                FocusedContextResult(
                    phase=_phase_context(phase),
                    task=FocusedContextTask(
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
                        description_preview=(
                            _description_preview(task.desc) if include_descriptions else None
                        ),
                    ),
                )
            )

    returned = matches[:limit]
    return RoadmapContextResponse(
        roadmap_id=roadmap.id,
        name=roadmap.name,
        updated_at=roadmap.updated_at,
        total_task_count=len(all_tasks),
        completed_task_count=completed,
        open_task_count=len(all_tasks) - completed,
        matching_task_count=len(matches),
        returned_task_count=len(returned),
        omitted_task_count=max(0, len(matches) - len(returned)),
        truncated=len(matches) > len(returned),
        results=returned,
    )


async def get_roadmap_context(
    db: AsyncSession,
    roadmap_id: str,
    **options,
) -> RoadmapContextResponse:
    return build_roadmap_context(await get_roadmap(db, roadmap_id), **options)
