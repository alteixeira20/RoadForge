"""Task / Phase / Snapshot DTOs - mirror apps/frontend/src/types/roadmap.ts."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from api.features.roadmaps.limit_schemas import (
    TASK_ASSIGNEES_MAX,
    TASK_DESC_MAX,
    TASK_EST_MAX,
    TASK_LINKS_MAX,
    TASK_TAGS_MAX,
    TASK_TITLE_MAX,
)
from api.features.roadmaps.snapshot_schemas import (
    TaskExternalLinkDTO,
    clean_task_assignees,
    clean_task_tags,
)
from api.features.roadmaps.validator_schemas import clean_optional_text, clean_required_text


class PatchTaskDoneRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    done: bool
    last_updated_at: datetime | None = None


class PatchTaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    last_updated_at: datetime | None = None
    title: str | None = Field(default=None, max_length=TASK_TITLE_MAX)
    desc: str | None = Field(default=None, max_length=TASK_DESC_MAX)
    est: str | None = Field(default=None, max_length=TASK_EST_MAX)
    complexity: Literal["very_low", "low", "medium", "high", "very_high"] = "medium"
    assignees: list[str] | None = Field(default=None, max_length=TASK_ASSIGNEES_MAX)
    tags: list[str] | None = Field(default=None, max_length=TASK_TAGS_MAX)
    links: list[TaskExternalLinkDTO] | None = Field(default=None, max_length=TASK_LINKS_MAX)

    @field_validator("title", mode="before")
    @classmethod
    def _validate_title(cls, value: object) -> object:
        if value is None:
            raise ValueError("title must not be null")
        if not isinstance(value, str):
            return value
        return clean_required_text(value, "title", TASK_TITLE_MAX)

    @field_validator("est", "desc", mode="before")
    @classmethod
    def _validate_optional(cls, value: object, info) -> object:
        if not isinstance(value, (str, type(None))):
            return value
        limits = {"est": TASK_EST_MAX, "desc": TASK_DESC_MAX}
        return clean_optional_text(value, info.field_name, limits[info.field_name])

    @field_validator("tags", mode="before")
    @classmethod
    def _validate_tags(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        return clean_task_tags(value)

    @field_validator("assignees", mode="before")
    @classmethod
    def _validate_assignees(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        return clean_task_assignees(value)

    @field_validator("links")
    @classmethod
    def _validate_links(
        cls,
        value: list[TaskExternalLinkDTO] | None,
    ) -> list[TaskExternalLinkDTO]:
        if value is None:
            raise ValueError("links must not be null")
        ids = [link.id for link in value]
        urls = [link.url for link in value]
        if len(ids) != len(set(ids)) or len(urls) != len(set(urls)):
            raise ValueError("task links must have unique ids and URLs")
        return value

    @model_validator(mode="after")
    def _require_mutable_field(self) -> PatchTaskRequest:
        mutable_fields = {"title", "desc", "est", "complexity", "assignees", "tags", "links"}
        if not self.model_fields_set.intersection(mutable_fields):
            raise ValueError("at least one task field must be provided")
        return self
