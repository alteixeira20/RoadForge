"""Roadmap conflict response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from api.schemas.tasks import PhaseDTO


class RoadmapConflictServerSnapshot(BaseModel):
    name: str
    phases: list[PhaseDTO]


class RoadmapConflictSummary(BaseModel):
    phase_count: int
    task_count: int
    phase_ids: list[str] = Field(default_factory=list)
    task_ids: list[str] = Field(default_factory=list)


class RoadmapConflictMetadata(BaseModel):
    roadmap_id: str
    server_updated_at: datetime
    client_last_updated_at: datetime
    server: RoadmapConflictServerSnapshot
    summary: RoadmapConflictSummary | None = None


class RoadmapConflictResponse(BaseModel):
    detail: str
    code: str = "roadmap_conflict"
    conflict: RoadmapConflictMetadata