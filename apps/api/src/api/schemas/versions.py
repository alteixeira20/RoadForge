"""Roadmap version schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from api.schemas.tasks import PhaseDTO


class RoadmapVersionSummaryResponse(BaseModel):
    id: str
    version_number: int
    created_at: datetime
    actor_name: str | None = None
    action: str | None = None
    phase_count: int
    task_count: int


class RoadmapVersionDetailResponse(BaseModel):
    id: str
    version_number: int
    roadmap_name: str
    phases: list[PhaseDTO]
    created_at: datetime
    actor_name: str | None = None
    action: str | None = None
    phase_count: int
    task_count: int
    metadata_json: dict[str, Any] | None = None


class CheckpointResponse(BaseModel):
    created: bool
    version: RoadmapVersionSummaryResponse
