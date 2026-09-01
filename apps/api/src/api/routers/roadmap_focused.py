"""Bounded roadmap read contracts for agents and other focused clients."""

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.schemas.focused import (
    RoadmapContextResponse,
    RoadmapRevisionResponse,
    RoadmapSummaryResponse,
    TaskDetailResponse,
    TaskSearchResponse,
)
from api.services.auth_service import require_participant
from api.services.focused_read_service import (
    get_roadmap_context,
    get_roadmap_revision,
    get_roadmap_summary,
    get_roadmap_task,
    search_roadmap_tasks,
)
from api.services.rate_limit_service import rate_limiter

router = APIRouter(tags=["roadmaps"])
_READ_ROLES = {"owner", "editor", "viewer"}


def _participant_rate_key(participant_id: str, roadmap_id: str) -> str:
    return f"{participant_id}:{roadmap_id}"


async def _focused_reader(
    db: AsyncSession,
    roadmap_id: str,
    authorization: str | None,
    action: str,
    *,
    limit: int,
):
    participant = await require_participant(db, roadmap_id, authorization, _READ_ROLES)
    await rate_limiter.enforce(
        action,
        _participant_rate_key(participant.id, roadmap_id),
        limit=limit,
        window_seconds=60,
    )


@router.get("/{roadmap_id}/summary", response_model=RoadmapSummaryResponse)
async def fetch_roadmap_summary(
    roadmap_id: str,
    max_next: int = Query(default=20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapSummaryResponse:
    await _focused_reader(db, roadmap_id, authorization, "roadmap.summary.read", limit=240)
    return await get_roadmap_summary(db, roadmap_id, max_next=max_next)


@router.get("/{roadmap_id}/revision", response_model=RoadmapRevisionResponse)
async def fetch_roadmap_revision(
    roadmap_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapRevisionResponse:
    await _focused_reader(db, roadmap_id, authorization, "roadmap.revision.read", limit=300)
    return await get_roadmap_revision(db, roadmap_id)


@router.get("/{roadmap_id}/tasks/search", response_model=TaskSearchResponse)
async def fetch_task_search(
    roadmap_id: str,
    query: str = Query(min_length=1, max_length=200),
    include_completed: bool = False,
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> TaskSearchResponse:
    await _focused_reader(db, roadmap_id, authorization, "task.search.read", limit=120)
    return await search_roadmap_tasks(
        db,
        roadmap_id,
        query,
        include_completed=include_completed,
        limit=limit,
    )


@router.get("/{roadmap_id}/tasks/{task_id}", response_model=TaskDetailResponse)
async def fetch_task_detail(
    roadmap_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> TaskDetailResponse:
    await _focused_reader(db, roadmap_id, authorization, "task.detail.read", limit=240)
    return await get_roadmap_task(db, roadmap_id, task_id)


@router.get("/{roadmap_id}/context", response_model=RoadmapContextResponse)
async def fetch_roadmap_context(
    roadmap_id: str,
    phase_id: list[str] = Query(default=[]),
    task_id: list[str] = Query(default=[]),
    open_only: bool = False,
    next_only: bool = False,
    include_descriptions: bool = False,
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> RoadmapContextResponse:
    if len(phase_id) > 50:
        raise HTTPException(status_code=422, detail="At most 50 phase_id filters are allowed")
    if len(task_id) > 100:
        raise HTTPException(status_code=422, detail="At most 100 task_id filters are allowed")
    await _focused_reader(db, roadmap_id, authorization, "roadmap.context.read", limit=120)
    return await get_roadmap_context(
        db,
        roadmap_id,
        phase_ids=set(phase_id) or None,
        task_ids=set(task_id) or None,
        open_only=open_only,
        next_only=next_only,
        include_descriptions=include_descriptions,
        limit=limit,
    )
