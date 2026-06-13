"""Tag registry schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.schemas.limits import TAG_COLOR_MAX, TAG_LABEL_MAX, TAG_MAX
from api.schemas.validators import clean_optional_text, clean_required_text


class TagDefinitionDTO(BaseModel):
    id: str = Field(max_length=TAG_MAX, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    label: str = Field(max_length=TAG_LABEL_MAX)
    color: str | None = Field(
        default=None,
        max_length=TAG_COLOR_MAX,
        pattern=r"^#[0-9a-fA-F]{6}$",
    )
    createdAt: str | None = None
    updatedAt: str | None = None

    @field_validator("id", "label", mode="before")
    @classmethod
    def _validate_required(cls, v: object, info) -> object:
        if not isinstance(v, str):
            return v
        limits = {"id": TAG_MAX, "label": TAG_LABEL_MAX}
        cleaned = clean_required_text(v, info.field_name, limits[info.field_name])
        return " ".join(cleaned.split()) if info.field_name == "label" else cleaned

    @field_validator("color", mode="before")
    @classmethod
    def _validate_color(cls, v: object) -> object:
        if not isinstance(v, (str, type(None))):
            return v
        cleaned = clean_optional_text(v, "color", TAG_COLOR_MAX)
        return cleaned.lower() if cleaned else cleaned


class CreateTagRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = Field(
        default=None,
        max_length=TAG_MAX,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
    )
    label: str = Field(min_length=1, max_length=TAG_LABEL_MAX)
    color: str | None = Field(
        default=None,
        max_length=TAG_COLOR_MAX,
        pattern=r"^#[0-9a-fA-F]{6}$",
    )
    last_updated_at: datetime

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
    last_updated_at: datetime

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


class TagResponse(BaseModel):
    id: str
    label: str
    color: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None


def validate_tag_registry_uniqueness(
    registry: list[TagDefinitionDTO] | None,
) -> list[TagDefinitionDTO] | None:
    if registry is None:
        return None
    ids: set[str] = set()
    labels: set[str] = set()
    for tag in registry:
        label_key = " ".join(tag.label.split()).casefold()
        if tag.id in ids:
            raise ValueError(f"duplicate tag id: {tag.id}")
        if label_key in labels:
            raise ValueError(f"duplicate tag label: {tag.label}")
        ids.add(tag.id)
        labels.add(label_key)
    return registry