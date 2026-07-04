"""
Task partial-write operations for a roadmap.

This module handles:
- Updating task planning fields (patch_task)
- Marking a task as done / reopening it (patch_task_done)
- Claiming a task (patch_task_claim)
- Releasing a task claim (delete_task_claim)
"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant
from api.schemas.roadmap import PatchTaskDoneRequest, PatchTaskRequest, RoadmapResponse
from api.services.event_bus import Event, event_bus
from api.services.id_service import generate_id
from api.services.roadmap_helpers import (
    RoadmapConflictError,
    _fetch_active_roadmap_for_update,
    _patch_task_claim_snapshot,
    _patch_task_done_snapshot,
    _patch_task_fields_in_snapshot,
    _phases_from_snapshot,
    _roadmap_conflict_response,
    _roadmap_response,
)
from api.services.roadmap_projection_service import sync_roadmap_projection_best_effort
from api.services.session_policy import ensure_aware_utc

logger = logging.getLogger(__name__)


async def patch_task(
    db: AsyncSession,
    roadmap_id: str,
    task_id: str,
    payload: PatchTaskRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap_for_update(db, roadmap_id)

    client_ts = ensure_aware_utc(payload.last_updated_at)
    if roadmap.updated_at > client_ts:
        raise RoadmapConflictError(_roadmap_conflict_response(roadmap, client_ts, None))

    updates = payload.model_dump(
        exclude={"last_updated_at"},
        exclude_unset=True,
    )
    patched = _patch_task_fields_in_snapshot(roadmap.snapshot_json, task_id, updates)
    if patched is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if not patched.changed_fields:
        return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))

    before_json = {
        field: patched.before_task.get(field) for field in patched.changed_fields
    }
    after_json = {
        field: patched.after_task.get(field) for field in patched.changed_fields
    }
    roadmap.snapshot_json = patched.snapshot_json
    roadmap.updated_at = datetime.now(timezone.utc)

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="task.updated",
        entity_type="task",
        entity_id=task_id,
        before_json=before_json,
        after_json=after_json,
        metadata_json={
            "taskId": task_id,
            "taskTitle": patched.after_task.get("title"),
            "phaseId": patched.phase.get("id"),
            "phaseName": patched.phase.get("name"),
            "changedFields": patched.changed_fields,
        },
    ))
    await sync_roadmap_projection_best_effort(db, roadmap, "task_update_patch")

    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(Event(
        roadmap_id=roadmap_id,
        action="roadmap.updated",
        payload={
            "roadmap_id": roadmap_id,
            "updated_at": roadmap.updated_at.isoformat(),
            "participant_id": participant.id,
            "task_id": task_id,
            "action": "task.updated",
            "changed_fields": patched.changed_fields,
        },
    ))

    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


async def patch_task_done(
    db: AsyncSession,
    roadmap_id: str,
    task_id: str,
    payload: PatchTaskDoneRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap_for_update(db, roadmap_id)

    client_ts = ensure_aware_utc(payload.last_updated_at)
    if roadmap.updated_at > client_ts:
        raise RoadmapConflictError(_roadmap_conflict_response(roadmap, client_ts, None))

    patched = _patch_task_done_snapshot(roadmap.snapshot_json, task_id, payload.done)
    if patched is None:
        raise HTTPException(status_code=404, detail="Task not found")

    snapshot_json, phase, task = patched
    before_done = bool(task.get("done", False))
    if before_done == payload.done:
        return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))

    action = "task.completed" if payload.done else "task.reopened"
    roadmap.snapshot_json = snapshot_json
    roadmap.updated_at = datetime.now(timezone.utc)

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action=action,
        entity_type="task",
        entity_id=task_id,
        before_json={"done": before_done},
        after_json={"done": payload.done},
        metadata_json={
            "phase_id": phase.get("id"),
            "task_title": task.get("title"),
        },
    ))
    await sync_roadmap_projection_best_effort(db, roadmap, "task_done_patch")

    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(Event(
        roadmap_id=roadmap_id,
        action="roadmap.updated",
        payload={
            "roadmap_id": roadmap_id,
            "updated_at": roadmap.updated_at.isoformat(),
            "participant_id": participant.id,
            "task_id": task_id,
            "action": action,
        }
    ))

    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


async def patch_task_claim(
    db: AsyncSession,
    roadmap_id: str,
    task_id: str,
    participant: Participant,
    *,
    override: bool = False,
) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap_for_update(db, roadmap_id)
    now = datetime.now(timezone.utc)

    patched = _patch_task_claim_snapshot(
        roadmap.snapshot_json,
        task_id,
        participant.display_name,
        participant.id,
        now.isoformat(),
    )
    if patched is None:
        raise HTTPException(status_code=404, detail="Task not found")

    snapshot_json, phase, task = patched
    if task.get("done"):
        raise HTTPException(status_code=400, detail="Cannot claim a completed task")

    previous_claimed_by = task.get("claimedBy")
    previous_claimed_by_id = task.get("claimedById")
    is_own_claim = (
        previous_claimed_by_id == participant.id
        if previous_claimed_by_id
        else previous_claimed_by == participant.display_name
    )
    is_owner_override = bool(previous_claimed_by and not is_own_claim and override)
    if previous_claimed_by and not is_own_claim:
        if participant.role != "owner" or not override:
            raise HTTPException(
                status_code=409,
                detail=f"Task is already claimed by {previous_claimed_by}",
            )

    roadmap.snapshot_json = snapshot_json
    roadmap.updated_at = now

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="task.claimed",
        entity_type="task",
        entity_id=task_id,
        metadata_json={
            "phase_id": phase.get("id"),
            "task_title": task.get("title"),
            "claimed_by": participant.display_name,
            "override": is_owner_override,
            "previous_claimed_by": previous_claimed_by if is_owner_override else None,
        },
    ))
    await sync_roadmap_projection_best_effort(db, roadmap, "task_claim")

    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(Event(
        roadmap_id=roadmap_id,
        action="roadmap.updated",
        payload={
            "roadmap_id": roadmap_id,
            "updated_at": roadmap.updated_at.isoformat(),
            "participant_id": participant.id,
            "task_id": task_id,
            "action": "task.claimed",
        }
    ))

    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


async def delete_task_claim(
    db: AsyncSession,
    roadmap_id: str,
    task_id: str,
    participant: Participant,
    *,
    override: bool = False,
) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap_for_update(db, roadmap_id)
    now = datetime.now(timezone.utc)

    patched = _patch_task_claim_snapshot(
        roadmap.snapshot_json,
        task_id,
        None,
        None,
        None,
    )
    if patched is None:
        raise HTTPException(status_code=404, detail="Task not found")

    snapshot_json, phase, task = patched
    before_claimed_by = task.get("claimedBy")
    before_claimed_by_id = task.get("claimedById")

    if not before_claimed_by:
        return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))

    is_own_claim = (
        before_claimed_by_id == participant.id
        if before_claimed_by_id
        else before_claimed_by == participant.display_name
    )
    is_owner_override = not is_own_claim and participant.role == "owner" and override
    if not is_own_claim and not is_owner_override:
        raise HTTPException(
            status_code=409,
            detail=f"Task is claimed by {before_claimed_by}",
        )

    roadmap.snapshot_json = snapshot_json
    roadmap.updated_at = now

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="task.unclaimed",
        entity_type="task",
        entity_id=task_id,
        metadata_json={
            "phase_id": phase.get("id"),
            "task_title": task.get("title"),
            "was_claimed_by": before_claimed_by,
            "override": is_owner_override,
        },
    ))
    await sync_roadmap_projection_best_effort(db, roadmap, "task_unclaim")

    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(Event(
        roadmap_id=roadmap_id,
        action="roadmap.updated",
        payload={
            "roadmap_id": roadmap_id,
            "updated_at": roadmap.updated_at.isoformat(),
            "participant_id": participant.id,
            "task_id": task_id,
            "action": "task.unclaimed",
        }
    ))

    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))
