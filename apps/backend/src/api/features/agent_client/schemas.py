"""Compact response schemas for agent clients."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from api.features.roadmaps.conflict_schemas import RoadmapConflictSummary
from api.features.roadmaps.focused_schemas import FocusedPhaseSummary


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
