"""Tag registry schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.features.roadmaps.limit_schemas import (
    TAG_COLOR_MAX,
    TAG_LABEL_MAX,
    TAG_MAX,
    TAG_REGISTRY_MAX,
)
from api.features.roadmaps.validator_schemas import clean_optional_text, clean_required_text

# Strict grammar for newly generated tag ids (see _generated_tag_id in
# roadmap_tag_service.py). Lowercase kebab-case only.
TAG_ID_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
# Compatibility grammar for accepting existing tag ids, including legacy formats such as
# `status:done` or `priority:P0` that predate the canonical kebab-case generator. New ids
# must still be produced via the canonical generator, which only ever emits TAG_ID_PATTERN matches.


class CreateTagRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = Field(
        default=None,
        max_length=TAG_MAX,
        pattern=TAG_ID_PATTERN,
    )
    label: str = Field(min_length=1, max_length=TAG_LABEL_MAX)
    color: str | None = Field(
        default=None,
        max_length=TAG_COLOR_MAX,
        pattern=r"^#[0-9a-fA-F]{6}$",
    )
    last_updated_at: datetime | None = None

    @field_validator("id", "label", mode="before")
    @classmethod
    def _validate_text(cls, v: object, info) -> object:
        if not isinstance(v, str):
            return v
        limit = TAG_MAX if info.field_name == "id" else TAG_LABEL_MAX
        cleaned = clean_required_text(v, info.field_name, limit)
        return " ".join(cleaned.split()) if info.field_name == "label" else cleaned

    @field_validator("color", mode="before")
    @classmethod
    def _validate_color(cls, v: object) -> object:
        if not isinstance(v, (str, type(None))):
            return v
        cleaned = clean_optional_text(v, "color", TAG_COLOR_MAX)
        return cleaned.lower() if cleaned else cleaned


class UpdateTagRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1, max_length=TAG_LABEL_MAX)
    color: str | None = Field(
        default=None,
        max_length=TAG_COLOR_MAX,
        pattern=r"^#[0-9a-fA-F]{6}$",
    )
    last_updated_at: datetime | None = None

    @field_validator("label", mode="before")
    @classmethod
    def _validate_label(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        return " ".join(clean_required_text(v, "label", TAG_LABEL_MAX).split())

    @field_validator("color", mode="before")
    @classmethod
    def _validate_color(cls, v: object) -> object:
        if not isinstance(v, (str, type(None))):
            return v
        cleaned = clean_optional_text(v, "color", TAG_COLOR_MAX)
        return cleaned.lower() if cleaned else cleaned


class ReorderTagsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tag_ids: list[str] = Field(min_length=0, max_length=TAG_REGISTRY_MAX)


class TagResponse(BaseModel):
    id: str
    label: str
    color: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None
