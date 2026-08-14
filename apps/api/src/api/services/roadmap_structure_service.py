"""Intent-scoped roadmap structure collaboration writes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, Roadmap
from api.schemas.collaboration import (
    CreatePhaseRequest,
    PatchPhaseRequest,
    PatchRoadmapNameRequest,
    ReorderPhasesRequest,
)
from api.schemas.limits import PHASES_MAX
from api.schemas.roadmap import RoadmapResponse, TagDefinitionDTO
from api.services.activity_log_limit import enforce_activity_log_cap
from api.services.event_bus import Event, event_bus
from api.services.id_service import generate_id
from api.services.projection import sync_roadmap_projection_best_effort
from api.services.roadmap_helpers import _phases_from_snapshot, _roadmap_response
from api.services.roadmap_query import fetch_active_roadmap_for_update
from api.services.roadmap_validation import validate_roadmap_domain


def _stored_tag_registry(roadmap: Roadmap) -> list[TagDefinitionDTO] | None:
    if roadmap.tag_registry_json is None:
        return None
    return [TagDefinitionDTO.model_validate(tag) for tag in roadmap.tag_registry_json]


def _phase_dicts(snapshot_json: dict[str, Any]) -> list[dict[str, Any]]:
    phases = snapshot_json.get("phases")
    if not isinstance(phases, list):
        return []
    return [phase for phase in phases if isinstance(phase, dict)]


def _with_phases(snapshot_json: dict[str, Any], phases: list[dict[str, Any]]) -> dict[str, Any]:
    next_snapshot = dict(snapshot_json)
    next_snapshot["phases"] = phases
    return next_snapshot


def _renumber_phase_dicts(phases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {**phase, "num": str(index + 1).zfill(2)}
        for index, phase in enumerate(phases)
    ]


def _phase_summary(phase: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": phase.get("id"),
        "num": phase.get("num"),
        "name": phase.get("name"),
        "color": phase.get("color"),
        "colorMode": phase.get("colorMode"),
    }


async def patch_roadmap_name(
    db: AsyncSession,
    roadmap_id: str,
    payload: PatchRoadmapNameRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    if roadmap.name == payload.name:
        return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))

    previous_name = roadmap.name
    roadmap.name = payload.name
    roadmap.updated_at = datetime.now(timezone.utc)
    db.add(
        ActivityLog(
            id=generate_id("al_"),
            roadmap_id=roadmap_id,
            participant_id=participant.id,
            actor_name=participant.display_name,
            action="roadmap.renamed",
            entity_type="roadmap",
            entity_id=roadmap_id,
            before_json={"name": previous_name},
            after_json={"name": payload.name},
            metadata_json={"changedFields": ["name"]},
        )
    )

    await enforce_activity_log_cap(db, roadmap_id)
    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(
        Event(
            roadmap_id=roadmap_id,
            action="roadmap.updated",
            payload={
                "roadmap_id": roadmap_id,
                "updated_at": roadmap.updated_at.isoformat(),
                "participant_id": participant.id,
                "action": "roadmap.renamed",
                "roadmap_fields": ["name"],
            },
        )
    )

    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


async def create_phase(
    db: AsyncSession,
    roadmap_id: str,
    payload: CreatePhaseRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    phases = _phase_dicts(roadmap.snapshot_json)
    if len(phases) >= PHASES_MAX:
        raise HTTPException(status_code=422, detail=f"Roadmap supports at most {PHASES_MAX} phases")
    if any(phase.get("id") == payload.id for phase in phases):
        raise HTTPException(status_code=409, detail="Phase ID already exists")

    created = {
        "id": payload.id,
        "num": str(len(phases) + 1).zfill(2),
        "name": payload.name,
        "color": payload.color,
        "colorMode": payload.colorMode,
        "status": "active" if not phases else "future",
        "progress": 0,
        "tasks": [],
    }
    next_snapshot = _with_phases(roadmap.snapshot_json, [*phases, created])
    next_phases = _phases_from_snapshot(next_snapshot)
    validate_roadmap_domain(next_phases, _stored_tag_registry(roadmap))

    roadmap.snapshot_json = next_snapshot
    roadmap.updated_at = datetime.now(timezone.utc)
    db.add(
        ActivityLog(
            id=generate_id("al_"),
            roadmap_id=roadmap_id,
            participant_id=participant.id,
            actor_name=participant.display_name,
            action="phase.created",
            entity_type="phase",
            entity_id=payload.id,
            before_json=None,
            after_json=_phase_summary(created),
            metadata_json={
                "phaseId": payload.id,
                "phaseName": payload.name,
                "phaseNum": created["num"],
            },
        )
    )

    await sync_roadmap_projection_best_effort(db, roadmap, "phase.created")
    await enforce_activity_log_cap(db, roadmap_id)
    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(
        Event(
            roadmap_id=roadmap_id,
            action="roadmap.updated",
            payload={
                "roadmap_id": roadmap_id,
                "updated_at": roadmap.updated_at.isoformat(),
                "participant_id": participant.id,
                "phase_id": payload.id,
                "action": "phase.created",
                "phase_operation": "created",
            },
        )
    )
    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


async def delete_phase(
    db: AsyncSession,
    roadmap_id: str,
    phase_id: str,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    phases = _phase_dicts(roadmap.snapshot_json)
    deleted = next((phase for phase in phases if phase.get("id") == phase_id), None)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Phase not found")

    remaining = [phase for phase in phases if phase.get("id") != phase_id]
    renumbered = _renumber_phase_dicts(remaining)
    next_snapshot = _with_phases(roadmap.snapshot_json, renumbered)
    next_phases = _phases_from_snapshot(next_snapshot)
    validate_roadmap_domain(next_phases, _stored_tag_registry(roadmap))

    roadmap.snapshot_json = next_snapshot
    roadmap.updated_at = datetime.now(timezone.utc)
    db.add(
        ActivityLog(
            id=generate_id("al_"),
            roadmap_id=roadmap_id,
            participant_id=participant.id,
            actor_name=participant.display_name,
            action="phase.deleted",
            entity_type="phase",
            entity_id=phase_id,
            before_json=_phase_summary(deleted),
            after_json=None,
            metadata_json={
                "phaseId": phase_id,
                "phaseName": deleted.get("name"),
                "phaseNum": deleted.get("num"),
            },
        )
    )

    await sync_roadmap_projection_best_effort(db, roadmap, "phase.deleted")
    await enforce_activity_log_cap(db, roadmap_id)
    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(
        Event(
            roadmap_id=roadmap_id,
            action="roadmap.updated",
            payload={
                "roadmap_id": roadmap_id,
                "updated_at": roadmap.updated_at.isoformat(),
                "participant_id": participant.id,
                "phase_id": phase_id,
                "action": "phase.deleted",
                "phase_operation": "deleted",
            },
        )
    )
    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


async def reorder_phases(
    db: AsyncSession,
    roadmap_id: str,
    payload: ReorderPhasesRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    phases = _phase_dicts(roadmap.snapshot_json)
    by_id = {phase.get("id"): phase for phase in phases}

    # The caller supplies its preferred order for the phases it knows. IDs
    # deleted by another collaborator are ignored; server-only phases created
    # concurrently remain present and keep their relative order after the
    # caller-known phases. This makes reordering mergeable instead of requiring
    # an exact whole-roadmap phase set.
    requested_known = [phase_id for phase_id in payload.phase_ids if phase_id in by_id]
    requested_set = set(requested_known)
    server_only = [phase for phase in phases if phase.get("id") not in requested_set]
    reordered = [by_id[phase_id] for phase_id in requested_known]
    reordered.extend(server_only)
    renumbered = _renumber_phase_dicts(reordered)

    before_ids = [phase.get("id") for phase in phases]
    after_ids = [phase.get("id") for phase in renumbered]
    if before_ids == after_ids:
        return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))

    next_snapshot = _with_phases(roadmap.snapshot_json, renumbered)
    next_phases = _phases_from_snapshot(next_snapshot)
    validate_roadmap_domain(next_phases, _stored_tag_registry(roadmap))

    roadmap.snapshot_json = next_snapshot
    roadmap.updated_at = datetime.now(timezone.utc)
    db.add(
        ActivityLog(
            id=generate_id("al_"),
            roadmap_id=roadmap_id,
            participant_id=participant.id,
            actor_name=participant.display_name,
            action="phase.reordered",
            entity_type="roadmap",
            entity_id=roadmap_id,
            before_json={"phaseIds": before_ids},
            after_json={"phaseIds": after_ids},
            metadata_json={"phaseIds": after_ids},
        )
    )

    await sync_roadmap_projection_best_effort(db, roadmap, "phase.reordered")
    await enforce_activity_log_cap(db, roadmap_id)
    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(
        Event(
            roadmap_id=roadmap_id,
            action="roadmap.updated",
            payload={
                "roadmap_id": roadmap_id,
                "updated_at": roadmap.updated_at.isoformat(),
                "participant_id": participant.id,
                "action": "phase.reordered",
                "phase_operation": "reordered",
                "phase_ids": after_ids,
            },
        )
    )
    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


def _patch_phase_snapshot(
    snapshot_json: dict[str, Any],
    phase_id: str,
    updates: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], list[str]] | None:
    phases = snapshot_json.get("phases")
    if not isinstance(phases, list):
        return None

    for index, phase in enumerate(phases):
        if not isinstance(phase, dict) or phase.get("id") != phase_id:
            continue

        next_phase = dict(phase)
        changed_fields: list[str] = []
        for field, value in updates.items():
            if phase.get(field) == value:
                continue
            next_phase[field] = value
            changed_fields.append(field)

        if not changed_fields:
            return snapshot_json, phase, phase, []

        next_phases_raw = list(phases)
        next_phases_raw[index] = next_phase
        next_snapshot = dict(snapshot_json)
        next_snapshot["phases"] = next_phases_raw
        return next_snapshot, phase, next_phase, changed_fields

    return None


async def patch_phase(
    db: AsyncSession,
    roadmap_id: str,
    phase_id: str,
    payload: PatchPhaseRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    updates = payload.model_dump(exclude_unset=True)
    patched = _patch_phase_snapshot(roadmap.snapshot_json, phase_id, updates)
    if patched is None:
        raise HTTPException(status_code=404, detail="Phase not found")

    snapshot_json, before_phase, after_phase, changed_fields = patched
    if not changed_fields:
        return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))

    phases = _phases_from_snapshot(snapshot_json)
    validate_roadmap_domain(phases, _stored_tag_registry(roadmap))

    roadmap.snapshot_json = snapshot_json
    roadmap.updated_at = datetime.now(timezone.utc)
    db.add(
        ActivityLog(
            id=generate_id("al_"),
            roadmap_id=roadmap_id,
            participant_id=participant.id,
            actor_name=participant.display_name,
            action="phase.updated",
            entity_type="phase",
            entity_id=phase_id,
            before_json={field: before_phase.get(field) for field in changed_fields},
            after_json={field: after_phase.get(field) for field in changed_fields},
            metadata_json={
                "phaseId": phase_id,
                "phaseName": after_phase.get("name"),
                "phaseNum": after_phase.get("num"),
                "changedFields": changed_fields,
            },
        )
    )

    await sync_roadmap_projection_best_effort(db, roadmap, "phase.updated")
    await enforce_activity_log_cap(db, roadmap_id)
    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(
        Event(
            roadmap_id=roadmap_id,
            action="roadmap.updated",
            payload={
                "roadmap_id": roadmap_id,
                "updated_at": roadmap.updated_at.isoformat(),
                "participant_id": participant.id,
                "phase_id": phase_id,
                "action": "phase.updated",
                "changed_fields": changed_fields,
            },
        )
    )

    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))
