"""Intent-scoped task structure collaboration schemas."""

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from api.schemas.limits import ID_MAX, TASK_TITLE_MAX, TASKS_PER_PHASE_MAX
from api.schemas.validators import clean_optional_text, clean_required_text


class CreateTaskStructureRequest(BaseModel):
    """Create one task with a client-proposed stable ID.

    `parentId` selects subtask creation. The server owns every other initial
    task field so callers cannot smuggle unrelated task state into creation.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=ID_MAX)
    title: str = Field(min_length=1, max_length=TASK_TITLE_MAX)
    parentId: str | None = Field(default=None, max_length=ID_MAX)

    @field_validator("id", "title", mode="before")
    @classmethod
    def _validate_required(cls, value: object, info) -> object:
        if not isinstance(value, str):
            return value
        limits = {"id": ID_MAX, "title": TASK_TITLE_MAX}
        return clean_required_text(value, info.field_name, limits[info.field_name])

    @field_validator("parentId", mode="before")
    @classmethod
    def _validate_parent(cls, value: object) -> object:
        if not isinstance(value, (str, type(None))):
            return value
        return clean_optional_text(value, "parentId", ID_MAX)


class ReorderTaskStructureRequest(BaseModel):
    """Preferred order for caller-known tasks in one structural scope."""

    model_config = ConfigDict(extra="forbid")

    task_ids: list[str] = Field(min_length=1, max_length=TASKS_PER_PHASE_MAX)

    @field_validator("task_ids", mode="before")
    @classmethod
    def _validate_task_ids(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        return [
            clean_required_text(item, "task_id", ID_MAX) if isinstance(item, str) else item
            for item in value
        ]

    @model_validator(mode="after")
    def _require_unique_ids(self) -> "ReorderTaskStructureRequest":
        if len(self.task_ids) != len(set(self.task_ids)):
            raise ValueError("task_ids must be unique")
        return self
