"""Intent-scoped phase collaboration writes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, Roadmap
from api.schemas.collaboration import PatchPhaseRequest
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

        next_phases = list(phases)
        next_phases[index] = next_phase
        next_snapshot = dict(snapshot_json)
        next_snapshot["phases"] = next_phases
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
