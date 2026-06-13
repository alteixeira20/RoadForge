"""Roadmap request & response schemas for CRUD operations."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.schemas.limits import (
    DISPLAY_NAME_MAX,
    PASSWORD_MAX,
    PASSWORD_MIN,
    PHASES_MAX,
    ROADMAP_NAME_MAX,
    TAG_REGISTRY_MAX,
)
from api.schemas.shared import validate_change_summary
from api.schemas.sharing import ShareLinkResponse
from api.schemas.tags import TagDefinitionDTO, validate_tag_registry_uniqueness
from api.schemas.tasks import PhaseDTO
from api.schemas.validators import clean_required_text


class CreateRoadmapRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=ROADMAP_NAME_MAX)
    owner_display_name: str = Field(min_length=1, max_length=DISPLAY_NAME_MAX)
    phases: list[PhaseDTO] = Field(default=[], max_length=PHASES_MAX)
    tag_registry: list[TagDefinitionDTO] | None = Field(default=None, max_length=TAG_REGISTRY_MAX)
    password: str | None = Field(default=None, min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)
    change_summary: dict[str, Any] | None = None

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

    @field_validator("change_summary", mode="before")
    @classmethod
    def _validate_change_summary(cls, v: object) -> object:
        return validate_change_summary(v)

    @field_validator("tag_registry")
    @classmethod
    def _validate_tag_registry(
        cls,
        v: list[TagDefinitionDTO] | None,
    ) -> list[TagDefinitionDTO] | None:
        return validate_tag_registry_uniqueness(v)


class UpdateRoadmapRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=ROADMAP_NAME_MAX)
    phases: list[PhaseDTO] | None = Field(default=None, max_length=PHASES_MAX)
    tag_registry: list[TagDefinitionDTO] | None = Field(default=None, max_length=TAG_REGISTRY_MAX)
    last_updated_at: datetime
    change_summary: dict[str, Any] | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _validate_name(cls, v: object) -> object:
        if not isinstance(v, str):
            return v
        return clean_required_text(v, "name", ROADMAP_NAME_MAX)

    @field_validator("change_summary", mode="before")
    @classmethod
    def _validate_change_summary(cls, v: object) -> object:
        return validate_change_summary(v)

    @field_validator("tag_registry")
    @classmethod
    def _validate_tag_registry(
        cls,
        v: list[TagDefinitionDTO] | None,
    ) -> list[TagDefinitionDTO] | None:
        return validate_tag_registry_uniqueness(v)


class RoadmapResponse(BaseModel):
    id: str
    name: str
    owner_display_name: str
    schema_version: str
    phases: list[PhaseDTO]
    tag_registry: list[TagDefinitionDTO] | None = None
    is_password_enabled: bool
    created_at: datetime
    updated_at: datetime


class CreateRoadmapResponse(BaseModel):
    id: str
    name: str
    owner_display_name: str
    schema_version: str
    phases: list[PhaseDTO]
    tag_registry: list[TagDefinitionDTO] | None = None
    is_password_enabled: bool
    created_at: datetime
    updated_at: datetime
    share_links: list[ShareLinkResponse]
    # Opaque session token for the owner participant; shown once, never stored raw.
    owner_session_token: str


class DeleteRoadmapResponse(BaseModel):
    ok: bool