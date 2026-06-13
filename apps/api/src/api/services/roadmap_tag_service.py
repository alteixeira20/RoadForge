"""
Tag registry partial-write operations for a roadmap.

This module handles:
- Listing tags (list_tags)
- Creating a tag (create_tag)
- Updating a tag (update_tag)
- Deleting a tag (delete_tag)
"""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, Roadmap
from api.schemas.limits import TAG_REGISTRY_MAX
from api.schemas.roadmap import (
    CreateTagRequest,
    RoadmapResponse,
    TagResponse,
    UpdateTagRequest,
)
from api.services.event_bus import Event, event_bus
from api.services.id_service import generate_id
from api.services.session_policy import ensure_aware_utc

from api.services.roadmap_helpers import (
    RoadmapConflictError,
    _fetch_active_roadmap,
    _fetch_active_roadmap_for_update,
    _phases_from_snapshot,
    _roadmap_conflict_response,
    _roadmap_response,
)

logger = logging.getLogger(__name__)


def _tag_label_key(label: str) -> str:
    return " ".join(label.split()).casefold()


def _generated_tag_id(label: str) -> str:
    chars: list[str] = []
    separator_pending = False
    for char in label.casefold():
        if char.isascii() and char.isalnum():
            if separator_pending and chars:
                chars.append("-")
            chars.append(char)
            separator_pending = False
        else:
            separator_pending = True
    return "".join(chars).strip("-")[:40].rstrip("-")


def _unique_tag_id(base: str, registry: list[dict]) -> str:
    used = {tag.get("id") for tag in registry}
    if base not in used:
        return base
    for suffix in range(2, 10_000):
        suffix_text = f"-{suffix}"
        candidate = f"{base[:40 - len(suffix_text)]}{suffix_text}"
        if candidate not in used:
            return candidate
    raise HTTPException(status_code=422, detail="Could not generate a unique tag ID")


def _ensure_tag_mutation_is_current(
    roadmap: Roadmap,
    last_updated_at: datetime,
) -> None:
    client_ts = ensure_aware_utc(last_updated_at)
    if roadmap.updated_at > client_ts:
        raise RoadmapConflictError(_roadmap_conflict_response(roadmap, client_ts, None))


def _ensure_unique_tag_label(
    registry: list[dict],
    label: str,
    *,
    excluding_id: str | None = None,
) -> None:
    label_key = _tag_label_key(label)
    if any(
        tag.get("id") != excluding_id
        and isinstance(tag.get("label"), str)
        and _tag_label_key(tag["label"]) == label_key
        for tag in registry
    ):
        raise HTTPException(status_code=409, detail="Tag label already exists")


async def _commit_tag_mutation(
    db: AsyncSession,
    roadmap: Roadmap,
    participant: Participant,
    *,
    action: str,
    tag_id: str,
    before_json: dict | None = None,
    after_json: dict | None = None,
) -> RoadmapResponse:
    roadmap.updated_at = datetime.now(timezone.utc)
    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap.id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action=action,
        entity_type="tag",
        entity_id=tag_id,
        before_json=before_json,
        after_json=after_json,
    ))
    await db.commit()
    await db.refresh(roadmap)
    await event_bus.publish(Event(
        roadmap_id=roadmap.id,
        action="roadmap.updated",
        payload={
            "roadmap_id": roadmap.id,
            "updated_at": roadmap.updated_at.isoformat(),
            "participant_id": participant.id,
            "tag_id": tag_id,
            "action": action,
        },
    ))
    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


def _tag_id_in_snapshot(snapshot_json: dict, tag_id: str) -> bool:
    """Return True if tag_id appears in any task.tags in the roadmap snapshot."""
    for phase in snapshot_json.get("phases", []):
        for task in phase.get("tasks", []):
            if isinstance(task.get("tags"), list) and tag_id in task["tags"]:
                return True
    return False


async def list_tags(db: AsyncSession, roadmap_id: str) -> list[TagResponse]:
    roadmap = await _fetch_active_roadmap(db, roadmap_id)
    registry = roadmap.tag_registry_json or []
    return [TagResponse(**tag) for tag in registry if isinstance(tag, dict)]


async def create_tag(
    db: AsyncSession,
    roadmap_id: str,
    payload: CreateTagRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap_for_update(db, roadmap_id)
    _ensure_tag_mutation_is_current(roadmap, payload.last_updated_at)
    registry: list[dict] = list(roadmap.tag_registry_json or [])

    label = payload.label.strip()
    _ensure_unique_tag_label(registry, label)
    tag_id = payload.id or _unique_tag_id(_generated_tag_id(label), registry)
    if not tag_id:
        raise HTTPException(status_code=422, detail="tag id cannot be empty")
    if any(t.get("id") == tag_id for t in registry):
        raise HTTPException(status_code=409, detail="Tag ID already exists")
    if len(registry) >= TAG_REGISTRY_MAX:
        raise HTTPException(
            status_code=422,
            detail=f"Tag registry is full (max {TAG_REGISTRY_MAX} tags)",
        )

    now = datetime.now(timezone.utc).isoformat()
    tag: dict = {"id": tag_id, "label": label, "createdAt": now, "updatedAt": now}
    if payload.color:
        tag["color"] = payload.color

    registry.append(tag)
    roadmap.tag_registry_json = registry
    return await _commit_tag_mutation(
        db,
        roadmap,
        participant,
        action="tag.created",
        tag_id=tag_id,
        after_json=tag,
    )


async def update_tag(
    db: AsyncSession,
    roadmap_id: str,
    tag_id: str,
    payload: UpdateTagRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap_for_update(db, roadmap_id)
    _ensure_tag_mutation_is_current(roadmap, payload.last_updated_at)
    registry: list[dict] = list(roadmap.tag_registry_json or [])

    tag_index = next((i for i, t in enumerate(registry) if t.get("id") == tag_id), None)
    if tag_index is None:
        raise HTTPException(status_code=404, detail="Tag not found")

    before_tag = dict(registry[tag_index])
    tag = dict(before_tag)
    if payload.label is not None:
        _ensure_unique_tag_label(registry, payload.label, excluding_id=tag_id)
        tag["label"] = payload.label.strip()
    if "color" in payload.model_fields_set:
        if payload.color:
            tag["color"] = payload.color
        else:
            tag.pop("color", None)
    tag["updatedAt"] = datetime.now(timezone.utc).isoformat()

    registry[tag_index] = tag
    roadmap.tag_registry_json = registry
    return await _commit_tag_mutation(
        db,
        roadmap,
        participant,
        action="tag.updated",
        tag_id=tag_id,
        before_json=before_tag,
        after_json=tag,
    )


async def delete_tag(
    db: AsyncSession,
    roadmap_id: str,
    tag_id: str,
    last_updated_at: datetime,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap_for_update(db, roadmap_id)
    _ensure_tag_mutation_is_current(roadmap, last_updated_at)
    registry: list[dict] = list(roadmap.tag_registry_json or [])

    existing_tag = next((tag for tag in registry if tag.get("id") == tag_id), None)
    if existing_tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")

    if _tag_id_in_snapshot(roadmap.snapshot_json, tag_id):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete tag '{tag_id}': it is still used by one or more tasks.",
        )

    roadmap.tag_registry_json = [t for t in registry if t.get("id") != tag_id]
    return await _commit_tag_mutation(
        db,
        roadmap,
        participant,
        action="tag.deleted",
        tag_id=tag_id,
        before_json=existing_tag,
    )
