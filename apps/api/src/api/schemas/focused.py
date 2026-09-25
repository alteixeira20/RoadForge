"""Bounded read and compact mutation schemas for focused RoadForge clients."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from api.schemas.conflicts import RoadmapConflictSummary
from api.schemas.shared import PhaseStatus
from api.schemas.tasks import TaskDTO


class FocusedPhaseSummary(BaseModel):
    id: str
    num: str
    name: str
    status: PhaseStatus
    progress: int = Field(ge=0, le=100)
    task_count: int = Field(ge=0)
    completed_task_count: int = Field(ge=0)
    open_task_count: int = Field(ge=0)


class FocusedPhaseContext(BaseModel):
    id: str
    num: str
    name: str
    status: PhaseStatus
    progress: int = Field(ge=0, le=100)


class FocusedNextTask(BaseModel):
    id: str
    title: str
    phase_id: str
    phase_name: str


class RoadmapSummaryResponse(BaseModel):
    roadmap_id: str
    name: str
    updated_at: datetime
    phase_count: int = Field(ge=0)
    total_task_count: int = Field(ge=0)
    open_task_count: int = Field(ge=0)
    completed_task_count: int = Field(ge=0)
    completion_percent: int = Field(ge=0, le=100)
    phases: list[FocusedPhaseSummary]
    next_task_count: int = Field(ge=0)
    next_tasks: list[FocusedNextTask] = Field(max_length=50)
    next_tasks_truncated: bool


class RoadmapRevisionResponse(BaseModel):
    roadmap_id: str
    updated_at: datetime


class FocusedTaskSearchTask(BaseModel):
    id: str
    title: str
    done: bool
    next: bool = False
    tags: list[str] = Field(default_factory=list)
    assignees: list[str] = Field(default_factory=list)


class FocusedTaskSearchResult(BaseModel):
    phase: FocusedPhaseContext
    task: FocusedTaskSearchTask


class TaskSearchResponse(BaseModel):
    roadmap_id: str
    updated_at: datetime
    query: str
    matching_task_count: int = Field(ge=0)
    returned_task_count: int = Field(ge=0)
    omitted_task_count: int = Field(ge=0)
    truncated: bool
    results: list[FocusedTaskSearchResult] = Field(max_length=100)


class TaskDetailResponse(BaseModel):
    roadmap_id: str
    updated_at: datetime
    phase: FocusedPhaseContext
    task: TaskDTO


class FocusedContextTask(BaseModel):
    id: str
    title: str
    done: bool
    next: bool = False
    complexity: Literal["very_low", "low", "medium", "high", "very_high"] = "medium"
    est: str | None = None
    parentId: str | None = None
    deps: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    assignees: list[str] = Field(default_factory=list)
    description_preview: str | None = Field(default=None, max_length=240)


class FocusedContextResult(BaseModel):
    phase: FocusedPhaseContext
    task: FocusedContextTask


class RoadmapContextResponse(BaseModel):
    roadmap_id: str
    name: str
    updated_at: datetime
    total_task_count: int = Field(ge=0)
    completed_task_count: int = Field(ge=0)
    open_task_count: int = Field(ge=0)
    matching_task_count: int = Field(ge=0)
    returned_task_count: int = Field(ge=0)
    omitted_task_count: int = Field(ge=0)
    truncated: bool
    results: list[FocusedContextResult] = Field(max_length=500)


class CompactTaskState(BaseModel):
    id: str
    title: str
    done: bool
    next: bool = False
    complexity: Literal["very_low", "low", "medium", "high", "very_high"] = "medium"
    est: str | None = None
    parentId: str | None = None
    deps: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    assignees: list[str] = Field(default_factory=list)


class CompactPhaseState(FocusedPhaseSummary):
    pass


class CompactTagState(BaseModel):
    id: str
    label: str
    color: str | None = None


class CompactMutationResponse(BaseModel):
    roadmap_id: str
    updated_at: datetime
    affected_entity_type: Literal["roadmap", "phase", "task", "dependency", "tag"]
    affected_entity_id: str | None = None
    dependency_id: str | None = None
    removed: bool = False
    phase: CompactPhaseState | None = None
    task: CompactTaskState | None = None
    tag: CompactTagState | None = None


class CompactRoadmapConflictMetadata(BaseModel):
    roadmap_id: str
    server_updated_at: datetime
    client_last_updated_at: datetime
    summary: RoadmapConflictSummary | None = None


class CompactRoadmapConflictResponse(BaseModel):
    detail: str
    code: str = "roadmap_conflict"
    conflict: CompactRoadmapConflictMetadata
