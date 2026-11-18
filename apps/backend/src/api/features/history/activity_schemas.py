"""Activity log response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ActivityLogResponse(BaseModel):
    id: str
    roadmap_id: str
    participant_id: str | None
    actor_name: str | None
    action: str
    entity_type: str | None
    entity_id: str | None
    before_json: dict[str, Any] | None = None
    after_json: dict[str, Any] | None = None
    metadata_json: dict[str, Any] | None = None
    created_at: datetime


class ActivityLogListResponse(BaseModel):
    logs: list[ActivityLogResponse]
    has_more: bool
