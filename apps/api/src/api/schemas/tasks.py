"""Task / Phase / Snapshot DTOs — mirror apps/web/src/types/roadmap.ts."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal
from urllib.parse import parse_qsl, unquote, urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from api.schemas.limits import (
    ASSIGNEE_MAX,
    DISPLAY_NAME_MAX,
    ID_MAX,
    PHASE_COLOR_MAX,
    PHASE_NAME_MAX,
    PHASE_NUM_MAX,
    TAG_MAX,
    TASK_ASSIGNEES_MAX,
    TASK_DEPS_MAX,
    TASK_DESC_MAX,
    TASK_EST_MAX,
    TASK_LINK_LABEL_MAX,
    TASK_LINK_OWNER_MAX,
    TASK_LINK_REPO_MAX,
    TASK_LINK_SHA_MAX,
    TASK_LINK_TAG_MAX,
    TASK_LINK_URL_MAX,
    TASK_LINKS_MAX,
    TASK_TAGS_MAX,
    TASK_TITLE_MAX,
    TASKS_PER_PHASE_MAX,
)
from api.schemas.shared import PhaseStatus
from api.schemas.validators import clean_optional_text, clean_required_text

_CREDENTIAL_QUERY_KEYS = {
    "access_token",
    "api_key",
    "apikey",
    "auth",
    "authorization",
    "authorization_code",
    "code",
    "client_secret",
    "credential",
    "credentials",
    "key",
    "oauth_code",
    "password",
    "passwd",
    "private_key",
    "refresh_token",
    "secret",
    "token",
}
_CREDENTIAL_VALUE_RE = re.compile(r"^(?:bearer\s+|gh[pousr]_|github_pat_)", re.IGNORECASE)
_GITHUB_NUMBER_KINDS = {"issue": "issues", "pull": "pull", "discussion": "discussions"}
_GITHUB_OWNER_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")
_GITHUB_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")


def _credential_like_query_key(value: str) -> bool:
    normalized = re.sub(r"([A-Z])", r"_\1", value).lower()
    return normalized in _CREDENTIAL_QUERY_KEYS or bool(
        re.search(
            r"(?:^|_)(?:access|api|auth|client|private|refresh)_(?:key|secret|token)$",
            normalized,
        )
    )


def _normalize_external_url(value: str) -> str:
    try:
        parsed = urlsplit(value.strip())
        port = parsed.port
    except ValueError as exc:
        raise ValueError("url must be a valid URL") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("url must use HTTP or HTTPS")
    if parsed.username or parsed.password:
        raise ValueError("url must not include a username or password")
    for key, query_value in parse_qsl(parsed.query, keep_blank_values=True):
        if _credential_like_query_key(key) or _CREDENTIAL_VALUE_RE.match(query_value.strip()):
            raise ValueError("url must not include credential or token parameters")
    path = parsed.path.rstrip("/")
    hostname = parsed.hostname.lower()
    netloc = f"[{hostname}]" if ":" in hostname else hostname
    is_default_port = (parsed.scheme == "https" and port == 443) or (
        parsed.scheme == "http" and port == 80
    )
    if port is not None and not is_default_port:
        netloc = f"{netloc}:{port}"
    return urlunsplit((parsed.scheme.lower(), netloc, path, "", ""))


class TaskExternalLinkDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(max_length=ID_MAX)
    provider: Literal["github", "url"]
    kind: Literal["issue", "pull", "discussion", "commit", "release", "url"]
    url: str = Field(max_length=TASK_LINK_URL_MAX)
    owner: str | None = Field(default=None, max_length=TASK_LINK_OWNER_MAX)
    repo: str | None = Field(default=None, max_length=TASK_LINK_REPO_MAX)
    number: int | None = Field(default=None, ge=1)
    sha: str | None = Field(default=None, min_length=7, max_length=TASK_LINK_SHA_MAX)
    tag: str | None = Field(default=None, max_length=TASK_LINK_TAG_MAX)
    label: str | None = Field(default=None, max_length=TASK_LINK_LABEL_MAX)

    @field_validator("id", mode="before")
    @classmethod
    def _validate_id(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        return clean_required_text(value, "link.id", ID_MAX)

    @field_validator("label", mode="before")
    @classmethod
    def _validate_label(cls, value: object) -> object:
        if not isinstance(value, (str, type(None))):
            return value
        return clean_optional_text(value, "link.label", TASK_LINK_LABEL_MAX)

    @field_validator("owner", "repo", mode="before")
    @classmethod
    def _validate_github_names(cls, value: object, info) -> object:
        if not isinstance(value, (str, type(None))):
            return value
        limits = {"owner": TASK_LINK_OWNER_MAX, "repo": TASK_LINK_REPO_MAX}
        return clean_optional_text(value, f"link.{info.field_name}", limits[info.field_name])

    @field_validator("tag", mode="before")
    @classmethod
    def _validate_tag(cls, value: object) -> object:
        if not isinstance(value, (str, type(None))):
            return value
        return clean_optional_text(value, "link.tag", TASK_LINK_TAG_MAX)

    @field_validator("url", mode="before")
    @classmethod
    def _validate_url(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        if len(value) > TASK_LINK_URL_MAX:
            raise ValueError(f"url exceeds {TASK_LINK_URL_MAX} characters")
        return _normalize_external_url(value)

    @model_validator(mode="after")
    def _validate_shape(self) -> TaskExternalLinkDTO:
        if self.provider == "url":
            if self.kind != "url":
                raise ValueError('provider "url" requires kind "url"')
            if any((self.owner, self.repo, self.number, self.sha, self.tag)):
                raise ValueError("generic URLs must not include GitHub identifiers")
            parsed = urlsplit(self.url)
            parts = [unquote(part) for part in parsed.path.split("/") if part]
            if (
                parsed.hostname == "github.com"
                and len(parts) >= 3
                and parts[2] in {"issues", "pull", "discussions", "commit", "releases"}
            ):
                raise ValueError("supported GitHub artifact URLs require provider github")
            return self

        if self.kind == "url":
            raise ValueError('provider "github" requires a GitHub artifact kind')
        if (
            self.owner is None
            or self.repo is None
            or _GITHUB_OWNER_RE.fullmatch(self.owner) is None
            or _GITHUB_REPO_RE.fullmatch(self.repo) is None
        ):
            raise ValueError("GitHub owner or repo is invalid")
        parsed = urlsplit(self.url)
        parts = [unquote(part) for part in parsed.path.split("/") if part]
        if (
            parsed.scheme != "https"
            or parsed.hostname != "github.com"
            or parsed.port not in (None, 443)
        ):
            raise ValueError("GitHub links must use github.com")
        if len(parts) < 4 or parts[0:2] != [self.owner, self.repo]:
            raise ValueError("GitHub URL does not match owner and repo")
        if self.kind in _GITHUB_NUMBER_KINDS:
            expected = [self.owner, self.repo, _GITHUB_NUMBER_KINDS[self.kind], str(self.number)]
            valid = (
                parts == expected
                and self.number is not None
                and self.sha is None
                and self.tag is None
            )
        elif self.kind == "commit":
            valid = (
                parts == [self.owner, self.repo, "commit", self.sha]
                and self.sha is not None
                and self.number is None
                and self.tag is None
                and re.fullmatch(r"[0-9a-fA-F]{7,64}", self.sha) is not None
            )
        else:
            valid = (
                parts[:4] == [self.owner, self.repo, "releases", "tag"]
                and "/".join(parts[4:]) == self.tag
                and bool(self.tag)
                and self.number is None
                and self.sha is None
            )
        if not valid:
            raise ValueError("GitHub URL does not match its link kind and identifier")
        return self


def _clean_task_tags(values: list[object]) -> list[object]:
    return [
        clean_required_text(value, "tag", TAG_MAX) if isinstance(value, str) else value
        for value in values
    ]


def _clean_task_assignees(values: list[object]) -> list[object]:
    return [
        clean_required_text(value, "assignee", ASSIGNEE_MAX)
        if isinstance(value, str)
        else value
        for value in values
    ]


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
    links: list[TaskExternalLinkDTO] | None = Field(default=None, max_length=TASK_LINKS_MAX)

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
        return _clean_task_tags(v)

    @field_validator("assignees", mode="before")
    @classmethod
    def _validate_assignees(cls, v: object) -> object:
        if not isinstance(v, list):
            return v
        return _clean_task_assignees(v)

    @field_validator("deps", mode="before")
    @classmethod
    def _validate_deps(cls, v: object) -> object:
        if not isinstance(v, list):
            return v
        return [clean_required_text(s, "dep", ID_MAX) if isinstance(s, str) else s for s in v]

    @field_validator("links")
    @classmethod
    def _validate_links(
        cls,
        value: list[TaskExternalLinkDTO] | None,
    ) -> list[TaskExternalLinkDTO] | None:
        if value is None:
            return None
        ids = [link.id for link in value]
        urls = [link.url for link in value]
        if len(ids) != len(set(ids)) or len(urls) != len(set(urls)):
            raise ValueError("task links must have unique ids and URLs")
        return value


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


class PatchTaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    last_updated_at: datetime
    title: str | None = Field(default=None, max_length=TASK_TITLE_MAX)
    desc: str | None = Field(default=None, max_length=TASK_DESC_MAX)
    est: str | None = Field(default=None, max_length=TASK_EST_MAX)
    assignees: list[str] | None = Field(default=None, max_length=TASK_ASSIGNEES_MAX)
    tags: list[str] | None = Field(default=None, max_length=TASK_TAGS_MAX)

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
        return _clean_task_tags(value)

    @field_validator("assignees", mode="before")
    @classmethod
    def _validate_assignees(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        return _clean_task_assignees(value)

    @model_validator(mode="after")
    def _require_mutable_field(self) -> PatchTaskRequest:
        mutable_fields = {"title", "desc", "est", "assignees", "tags"}
        if not self.model_fields_set.intersection(mutable_fields):
            raise ValueError("at least one task field must be provided")
        return self
