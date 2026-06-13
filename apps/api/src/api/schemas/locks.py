"""Lock request / response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LockRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target: str = Field(min_length=1, max_length=160, pattern=r"^[a-zA-Z0-9:\-_.]+$")


class LockResponse(BaseModel):
    roadmap_id: str
    target: str
    participant_id: str
    display_name: str
    expires_at: datetime