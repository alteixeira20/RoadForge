"""Roadmap version schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from api.schemas.tags import TagDefinitionDTO
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
    tag_registry: list[TagDefinitionDTO] | None = None
    created_at: datetime
    actor_name: str | None = None
    action: str | None = None
    phase_count: int
    task_count: int
    metadata_json: dict[str, Any] | None = None


class CheckpointResponse(BaseModel):
    created: bool
    version: RoadmapVersionSummaryResponse


class RestoreRoadmapVersionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The base revision the caller last saw. Restore uses the same
    # compare-and-swap contract as PUT/PATCH writes: a mismatch means the
    # roadmap changed since the caller opened the Versions panel.
    last_updated_at: datetime
    # Owner-only, separately confirmed override: proceed even if the base
    # revision is stale, recording that a newer revision was overwritten.
    force: bool = False
