"""Intent-scoped collaboration write schemas."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from api.schemas.limits import PHASE_COLOR_MAX, PHASE_NAME_MAX, ROADMAP_NAME_MAX
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
