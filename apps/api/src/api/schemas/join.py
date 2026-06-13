"""Join flow request / response schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from api.schemas.limits import DISPLAY_NAME_MAX, PASSWORD_MAX, TOKEN_MAX
from api.schemas.shared import ShareRole
from api.schemas.validators import clean_optional_text


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