from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# ─── Shared enums ─────────────────────────────────────────────────────────────

ShareRole = Literal["owner", "editor", "viewer"]
PhaseStatus = Literal["done", "active", "next", "future"]

# ─── Task / Phase / Snapshot — mirrors apps/web/src/types/roadmap.ts ──────────


class TaskDTO(BaseModel):
    id: str
    title: str
    done: bool
    next: bool | None = None
    est: str | None = None
    tags: list[str] | None = None
    deps: list[str] | None = None
    desc: str | None = None


class PhaseDTO(BaseModel):
    id: str
    num: str
    name: str
    color: str
    status: PhaseStatus
    progress: int = Field(ge=0, le=100)
    tasks: list[TaskDTO] = []


class RoadmapSnapshotDTO(BaseModel):
    """The phases payload stored in snapshot_json and exchanged on create/update."""
    phases: list[PhaseDTO] = []


# ─── Roadmap requests ─────────────────────────────────────────────────────────


class CreateRoadmapRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    owner_display_name: str = Field(min_length=1, max_length=128)
    phases: list[PhaseDTO] = []


class UpdateRoadmapRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    phases: list[PhaseDTO] | None = None


# ─── Roadmap responses ────────────────────────────────────────────────────────


class RoadmapResponse(BaseModel):
    id: str
    name: str
    owner_display_name: str
    schema_version: str
    phases: list[PhaseDTO]
    created_at: datetime
    updated_at: datetime


# ─── Share link ───────────────────────────────────────────────────────────────


class ShareLinkResponse(BaseModel):
    id: str
    role: ShareRole
    # Readable prefix shown in UI; not the secret token.
    token_prefix: str
    # Full join URL with the raw token embedded; returned only on create/rotate.
    url: str | None = None
    is_active: bool
    created_at: datetime
    rotated_at: datetime | None = None


# ─── Join flow ────────────────────────────────────────────────────────────────


class JoinRoadmapRequest(BaseModel):
    token: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=128)

    @field_validator("display_name")
    @classmethod
    def strip_display_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("display_name must not be blank")
        return stripped


class JoinRoadmapResponse(BaseModel):
    roadmap_id: str
    roadmap_name: str
    role: ShareRole
    # Opaque session token the client stores locally to re-authenticate.
    session_token: str
    participant_id: str


# ─── Create roadmap response ──────────────────────────────────────────────────


class CreateRoadmapResponse(BaseModel):
    id: str
    name: str
    owner_display_name: str
    schema_version: str
    phases: list[PhaseDTO]
    created_at: datetime
    updated_at: datetime
    share_links: list[ShareLinkResponse]
    # Opaque session token for the owner participant; shown once, never stored raw.
    owner_session_token: str


# ─── Activity log ─────────────────────────────────────────────────────────────


class ActivityLogResponse(BaseModel):
    id: str
    roadmap_id: str
    participant_id: str | None
    actor_name: str | None
    action: str
    entity_type: str | None
    entity_id: str | None
    created_at: datetime
