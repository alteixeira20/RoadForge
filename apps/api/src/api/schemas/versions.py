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

    # The revision the caller is confirming as current. Restore uses the
    # same compare-and-swap contract as PUT/PATCH writes: this must exactly
    # match the roadmap's current revision or the request is rejected with
    # a 409 — `force` does not relax this. On a 409, the response carries
    # the roadmap's actual current revision; a force restore resends that
    # exact value here.
    last_updated_at: datetime
    # Owner-only, explicit confirmation that this restore is expected to
    # replace the roadmap's current state (e.g. after reviewing a 409).
    # When true and the restore succeeds, the response and version/activity
    # history record that the current revision was overwritten.
    force: bool = False
