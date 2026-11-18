"""Intent-scoped collaboration write schemas."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from api.schemas.limits import (
    ID_MAX,
    PHASE_COLOR_MAX,
    PHASE_NAME_MAX,
    PHASES_MAX,
    ROADMAP_NAME_MAX,
)
from api.schemas.validators import clean_required_text


class PatchRoadmapNameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=ROADMAP_NAME_MAX)

    @field_validator("name", mode="before")
    @classmethod
    def _validate_name(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return clean_required_text(value, "name", ROADMAP_NAME_MAX)


class CreatePhaseRequest(BaseModel):
    """Create one empty phase with a client-proposed stable ID."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=ID_MAX)
    name: str = Field(min_length=1, max_length=PHASE_NAME_MAX)
    color: str = Field(min_length=1, max_length=PHASE_COLOR_MAX)
    colorMode: Literal["auto", "manual"] = "auto"

    @field_validator("id", "name", "color", mode="before")
    @classmethod
    def _validate_required(cls, value: object, info) -> object:
        if not isinstance(value, str):
            return value
        limits = {
            "id": ID_MAX,
            "name": PHASE_NAME_MAX,
            "color": PHASE_COLOR_MAX,
        }
        return clean_required_text(value, info.field_name, limits[info.field_name])


class ReorderPhasesRequest(BaseModel):
    """Preferred order for phase IDs currently known by the caller."""

    model_config = ConfigDict(extra="forbid")

    phase_ids: list[str] = Field(min_length=1, max_length=PHASES_MAX)

    @field_validator("phase_ids", mode="before")
    @classmethod
    def _validate_phase_ids(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        return [
            clean_required_text(item, "phase_id", ID_MAX) if isinstance(item, str) else item
            for item in value
        ]

    @model_validator(mode="after")
    def _require_unique_ids(self) -> "ReorderPhasesRequest":
        if len(self.phase_ids) != len(set(self.phase_ids)):
            raise ValueError("phase_ids must be unique")
        return self


class PatchPhaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=PHASE_NAME_MAX)
    color: str | None = Field(default=None, max_length=PHASE_COLOR_MAX)
    colorMode: Literal["auto", "manual"] | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _validate_name(cls, value: object) -> object:
        if value is None:
            raise ValueError("name must not be null")
        if not isinstance(value, str):
            return value
        return clean_required_text(value, "name", PHASE_NAME_MAX)

    @field_validator("color", mode="before")
    @classmethod
    def _validate_color(cls, value: object) -> object:
        if value is None:
            raise ValueError("color must not be null")
        if not isinstance(value, str):
            return value
        return clean_required_text(value, "color", PHASE_COLOR_MAX)

    @model_validator(mode="after")
    def _require_update(self) -> "PatchPhaseRequest":
        if not self.model_fields_set:
            raise ValueError("at least one phase field must be provided")
        return self
