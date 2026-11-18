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

from api.features.roadmaps.core_schemas import RoadmapResponse
from api.features.roadmaps.mutation_pipeline import commit_roadmap_snapshot_mutation
from api.features.roadmaps.queries import fetch_active_roadmap_for_update
from api.features.roadmaps.snapshot import phases_from_snapshot, roadmap_response
from api.features.roadmaps.tag_schemas import TagDefinitionDTO
from api.features.roadmaps.validation import validate_roadmap_domain
from api.features.tasks.snapshot_patch import (
    patch_task_claim_snapshot,
    patch_task_done_snapshot,
    patch_task_fields_in_snapshot,
)
from api.features.tasks.task_schemas import PatchTaskDoneRequest, PatchTaskRequest
from api.models.roadmap import ActivityLog, Participant, Roadmap
from api.shared.ids import generate_id

logger = logging.getLogger(__name__)


def _validate_snapshot(roadmap: Roadmap, snapshot_json: dict) -> None:
    tag_registry = (
        None
        if roadmap.tag_registry_json is None
        else [TagDefinitionDTO.model_validate(tag) for tag in roadmap.tag_registry_json]
    )
    validate_roadmap_domain(phases_from_snapshot(snapshot_json), tag_registry)


async def patch_task(
    db: AsyncSession,
    roadmap_id: str,
    task_id: str,
    payload: PatchTaskRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)

    updates = payload.model_dump(
        exclude={"last_updated_at"},
        exclude_unset=True,
    )
    patched = patch_task_fields_in_snapshot(roadmap.snapshot_json, task_id, updates)
    if patched is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if not patched.changed_fields:
        return roadmap_response(roadmap, phases_from_snapshot(roadmap.snapshot_json))

    _validate_snapshot(roadmap, patched.snapshot_json)
    before_json = {
        field: patched.before_task.get(field) for field in patched.changed_fields
    }
    after_json = {
        field: patched.after_task.get(field) for field in patched.changed_fields
    }
    roadmap.snapshot_json = patched.snapshot_json
    await commit_roadmap_snapshot_mutation(
        db,
        roadmap,
        participant,
        action="task.updated",
        activity=ActivityLog(
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
        ),
        projection="task",
        task_id=task_id,
        event_payload={
            "task_id": task_id,
            "changed_fields": patched.changed_fields,
        },
    )

    return roadmap_response(roadmap, phases_from_snapshot(roadmap.snapshot_json))


async def patch_task_done(
    db: AsyncSession,
    roadmap_id: str,
    task_id: str,
    payload: PatchTaskDoneRequest,
    participant: Participant,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)

    patched = patch_task_done_snapshot(roadmap.snapshot_json, task_id, payload.done)
    if patched is None:
        raise HTTPException(status_code=404, detail="Task not found")

    snapshot_json, phase, task = patched
    before_done = bool(task.get("done", False))
    if before_done == payload.done:
        return roadmap_response(roadmap, phases_from_snapshot(roadmap.snapshot_json))

    _validate_snapshot(roadmap, snapshot_json)
    action = "task.completed" if payload.done else "task.reopened"
    roadmap.snapshot_json = snapshot_json
    await commit_roadmap_snapshot_mutation(
        db,
        roadmap,
        participant,
        action=action,
        activity=ActivityLog(
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
        ),
        projection="task",
        task_id=task_id,
        event_payload={
            "task_id": task_id,
        },
    )

    return roadmap_response(roadmap, phases_from_snapshot(roadmap.snapshot_json))


async def patch_task_claim(
    db: AsyncSession,
    roadmap_id: str,
    task_id: str,
    participant: Participant,
    *,
    override: bool = False,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    now = datetime.now(timezone.utc)

    patched = patch_task_claim_snapshot(
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
    await commit_roadmap_snapshot_mutation(
        db,
        roadmap,
        participant,
        action="task.claimed",
        activity=ActivityLog(
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
        ),
        projection="task",
        task_id=task_id,
        event_payload={
            "task_id": task_id,
        },
        updated_at=now,
    )

    return roadmap_response(roadmap, phases_from_snapshot(roadmap.snapshot_json))


async def delete_task_claim(
    db: AsyncSession,
    roadmap_id: str,
    task_id: str,
    participant: Participant,
    *,
    override: bool = False,
) -> RoadmapResponse:
    roadmap = await fetch_active_roadmap_for_update(db, roadmap_id)
    now = datetime.now(timezone.utc)

    patched = patch_task_claim_snapshot(
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
        return roadmap_response(roadmap, phases_from_snapshot(roadmap.snapshot_json))

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
    await commit_roadmap_snapshot_mutation(
        db,
        roadmap,
        participant,
        action="task.unclaimed",
        activity=ActivityLog(
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
        ),
        projection="task",
        task_id=task_id,
        event_payload={
            "task_id": task_id,
        },
        updated_at=now,
    )

    return roadmap_response(roadmap, phases_from_snapshot(roadmap.snapshot_json))
