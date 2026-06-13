"""Task / Phase / Snapshot DTOs — mirror apps/web/src/types/roadmap.ts."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.schemas.limits import (
    ASSIGNEE_MAX,
    DISPLAY_NAME_MAX,
    ID_MAX,
    PHASE_COLOR_MAX,
    PHASE_NAME_MAX,
    PHASE_NUM_MAX,
    PHASES_MAX,
    TAG_MAX,
    TASKS_PER_PHASE_MAX,
    TASK_ASSIGNEES_MAX,
    TASK_DEPS_MAX,
    TASK_DESC_MAX,
    TASK_EST_MAX,
    TASK_TAGS_MAX,
    TASK_TITLE_MAX,
)
from api.schemas.shared import PhaseStatus
from api.schemas.validators import clean_optional_text, clean_required_text


class TaskDTO(BaseModel):
    id: str = Field(max_length=ID_MAX)
    title: str = Field(max_length=TASK_TITLE_MAX)
    done: bool
    next: bool | None = None
    est: str | None = Field(default=None, max_length=TASK_EST_MAX)
    assignees: list[str] | None = Field(default=None, max_length=TASK_ASSIGNEES_MAX)
    tags: list[str] | None = Field(default=None, max_length=TASK_TAGS_MAX)
    deps: list[str] | None = Field(default=None, max_length=TASK_DEPS_MAX)
    desc: str | None = Field(default=None, max_length=TASK_DESC_MAX)
    parentId: str | None = Field(default=None, max_length=ID_MAX)
    claimedBy: str | None = Field(default=None, max_length=DISPLAY_NAME_MAX)
    claimedById: str | None = Field(default=None, max_length=ID_MAX)
    claimedAt: str | None = Field(default=None, max_length=32)

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

    @field_validator("assignees", mode="before")
    @classmethod
    def _validate_assignees(cls, v: object) -> object:
        if not isinstance(v, list):
            return v
        return [
            clean_required_text(s, "assignee", ASSIGNEE_MAX) if isinstance(s, str) else s
            for s in v
        ]

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
    colorMode: Literal["auto", "manual"] | None = None
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


class PatchTaskDoneRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    done: bool
    last_updated_at: datetime