from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.schemas.limits import (
    DISPLAY_NAME_MAX,
    ID_MAX,
    PASSWORD_MAX,
    PASSWORD_MIN,
    PHASE_COLOR_MAX,
    PHASE_NAME_MAX,
    PHASE_NUM_MAX,
    PHASES_MAX,
    ROADMAP_NAME_MAX,
    TAG_MAX,
    TASK_DEPS_MAX,
    TASK_DESC_MAX,
    TASK_EST_MAX,
    TASK_TAGS_MAX,
    TASK_TITLE_MAX,
    TASKS_PER_PHASE_MAX,
    TOKEN_MAX,
)
from api.schemas.validators import clean_optional_text, clean_required_text

# ─── Shared enums ─────────────────────────────────────────────────────────────

ShareRole = Literal["owner", "editor", "viewer"]
PhaseStatus = Literal["done", "active", "next", "future"]

# ─── Task / Phase / Snapshot — mirrors apps/web/src/types/roadmap.ts ──────────


class TaskDTO(BaseModel):
    id: str = Field(max_length=ID_MAX)
    title: str = Field(max_length=TASK_TITLE_MAX)
    done: bool
    next: bool | None = None
    est: str | None = Field(default=None, max_length=TASK_EST_MAX)
    tags: list[str] | None = Field(default=None, max_length=TASK_TAGS_MAX)
    deps: list[str] | None = Field(default=None, max_length=TASK_DEPS_MAX)
    desc: str | None = Field(default=None, max_length=TASK_DESC_MAX)
    parentId: str | None = Field(default=None, max_length=ID_MAX)

    @field_validator("id", "title", mode="before")
    @classmethod
    def _validate_required(cls, v: object, info) -> object:
        if not isinstance(v, str):
            return v
        limits = {"id": ID_MAX, "title": TASK_TITLE_MAX}
        return clean_required_text(v, info.field_name, limits[info.field_name])

    @field_validator("est", "desc", mode="before")
    @classmethod
    def _validate_optional(cls, v: object, info) -> object:
        if not isinstance(v, (str, type(None))):
            return v
        limits = {"est": TASK_EST_MAX, "desc": TASK_DESC_MAX}
        return clean_optional_text(v, info.field_name, limits[info.field_name])

    @field_validator("tags", mode="before")
    @classmethod
    def _validate_tags(cls, v: object) -> object:
        if not isinstance(v, list):
            return v
        return [clean_required_text(s, "tag", TAG_MAX) if isinstance(s, str) else s for s in v]

    @field_validator("deps", mode="before")
    @classmethod
    def _validate_deps(cls, v: object) -> object:
        if not isinstance(v, list):
            return v
        return [clean_required_text(s, "dep", ID_MAX) if isinstance(s, str) else s for s in v]


class PhaseDTO(BaseModel):
    id: str = Field(max_length=ID_MAX)
    num: str = Field(max_length=PHASE_NUM_MAX)
    name: str = Field(max_length=PHASE_NAME_MAX)
    color: str = Field(max_length=PHASE_COLOR_MAX)
    status: PhaseStatus
    progress: int = Field(ge=0, le=100)
    tasks: list[TaskDTO] = Field(default=[], max_length=TASKS_PER_PHASE_MAX)

    @field_validator("id", "num", "name", "color", mode="before")
    @classmethod
    def _validate_required(cls, v: object, info) -> object:
        if not isinstance(v, str):
            return v
        limits = {
            "id": ID_MAX,
            "num": PHASE_NUM_MAX,
            "name": PHASE_NAME_MAX,
            "color": PHASE_COLOR_MAX,
        }
        return clean_required_text(v, info.field_name, limits[info.field_name])


class RoadmapSnapshotDTO(BaseModel):
    """The phases payload stored in snapshot_json and exchanged on create/update."""
    phases: list[PhaseDTO] = []


# ─── Roadmap requests ─────────────────────────────────────────────────────────


class CreateRoadmapRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=ROADMAP_NAME_MAX)
    owner_display_name: str = Field(min_length=1, max_length=DISPLAY_NAME_MAX)
    phases: list[PhaseDTO] = Field(default=[], max_length=PHASES_MAX)
    password: str | None = Field(default=None, min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)

    @field_validator("name", "owner_display_name", mode="before")
    @classmethod
    def _validate_required(cls, v: object, info) -> object:
        if not isinstance(v, str):
            return v
        limits = {"name": ROADMAP_NAME_MAX, "owner_display_name": DISPLAY_NAME_MAX}
        return clean_required_text(v, info.field_name, limits[info.field_name])

    @field_validator("password", mode="before")
    @classmethod
    def _normalize_password(cls, v: object) -> object:
        # Passwords are hashed; skip suspicious-text check to avoid rejecting
        # passwords that happen to contain fragment strings.
        if not isinstance(v, str):
            return v
        stripped = v.strip()
        if not stripped:
            return None
        if len(stripped) > PASSWORD_MAX:
            raise ValueError(f"password exceeds {PASSWORD_MAX} characters")
        return stripped


class UpdateRoadmapRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=ROADMAP_NAME_MAX)
    phases: list[PhaseDTO] | None = Field(default=None, max_length=PHASES_MAX)
    last_updated_at: datetime | None = None
    change_summary: dict[str, Any] | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _validate_name(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        return clean_required_text(v, "name", ROADMAP_NAME_MAX)


# ─── Roadmap responses ────────────────────────────────────────────────────────


class RoadmapResponse(BaseModel):
    id: str
    name: str
    owner_display_name: str
    schema_version: str
    phases: list[PhaseDTO]
    is_password_enabled: bool
    created_at: datetime
    updated_at: datetime


class DeleteRoadmapResponse(BaseModel):
    ok: bool


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
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=8, max_length=TOKEN_MAX)
    display_name: str | None = Field(default=None, max_length=DISPLAY_NAME_MAX)
    password: str | None = Field(default=None, max_length=PASSWORD_MAX)

    @field_validator("display_name", mode="before")
    @classmethod
    def _validate_display_name(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        return clean_optional_text(v, "display_name", DISPLAY_NAME_MAX)

    @field_validator("password", mode="before")
    @classmethod
    def _normalize_password(cls, v: object) -> object:
        # Passwords are hashed; skip suspicious-text check.
        if not isinstance(v, str):
            return v
        stripped = v.strip()
        if not stripped:
            return None
        if len(stripped) > PASSWORD_MAX:
            raise ValueError(f"password exceeds {PASSWORD_MAX} characters")
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
    is_password_enabled: bool
    created_at: datetime
    updated_at: datetime
    share_links: list[ShareLinkResponse]
    # Opaque session token for the owner participant; shown once, never stored raw.
    owner_session_token: str


class EventTicketResponse(BaseModel):
    ticket: str
    expires_in: int


class LockRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target: str = Field(min_length=1, max_length=160, pattern=r"^[a-zA-Z0-9:\-_.]+$")


class LockResponse(BaseModel):
    roadmap_id: str
    target: str
    participant_id: str
    display_name: str
    expires_at: datetime


# ─── Activity log ─────────────────────────────────────────────────────────────


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
