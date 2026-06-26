"""
Shared helpers for roadmap service modules.

This module provides low-level helpers used by multiple roadmap service
modules: snapshot parsing, response construction, conflict detection,
and DB fetch helpers.  It must NOT import from other roadmap service
sub-modules to avoid circular imports.
"""

import logging
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.models.roadmap import Roadmap
from api.schemas.roadmap import (
    PhaseDTO,
    RoadmapConflictMetadata,
    RoadmapConflictResponse,
    RoadmapConflictServerSnapshot,
    RoadmapConflictSummary,
    RoadmapResponse,
)
from api.services.roadmap_projection_service import (
    serialize_projection_to_snapshot,
    validate_projection_parity,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class RoadmapConflictError(Exception):
    def __init__(self, response: RoadmapConflictResponse) -> None:
        self.response = response
        super().__init__(response.detail)


# ---------------------------------------------------------------------------
# Activity-log change summary
# ---------------------------------------------------------------------------


def _change_summary_fields(
    change_summary: dict | None,
    *,
    default_action: str,
    default_entity_type: str,
    default_entity_id: str,
) -> tuple[str, str, str, dict | None]:
    if change_summary is None:
        return default_action, default_entity_type, default_entity_id, None

    action = change_summary["action"]
    entity_type = change_summary.get("entity_type")
    entity_id = change_summary.get("entity_id")
    return (
        action,
        entity_type if isinstance(entity_type, str) else default_entity_type,
        entity_id if isinstance(entity_id, str) else default_entity_id,
        change_summary,
    )


# ---------------------------------------------------------------------------
# Snapshot patching for task partial writes
# ---------------------------------------------------------------------------


def _patch_task_done_snapshot(
    snapshot_json: dict[str, Any],
    task_id: str,
    done: bool,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]] | None:
    phases = snapshot_json.get("phases", [])
    if not isinstance(phases, list):
        return None

    next_phases: list[Any] = []
    found: tuple[dict[str, Any], dict[str, Any]] | None = None
    for phase in phases:
        if not isinstance(phase, dict):
            next_phases.append(phase)
            continue

        tasks = phase.get("tasks", [])
        if not isinstance(tasks, list):
            next_phases.append(dict(phase))
            continue

        next_tasks = []
        for task in tasks:
            if not isinstance(task, dict) or task.get("id") != task_id or found is not None:
                next_tasks.append(task)
                continue

            next_task = dict(task)
            found = (phase, task)
            next_task["done"] = done
            if done:
                # Marking done clears the claim so completed tasks are not stuck as claimed.
                next_task.pop("claimedBy", None)
                next_task.pop("claimedById", None)
                next_task.pop("claimedAt", None)
            next_tasks.append(next_task)

        next_phase = dict(phase)
        next_phase["tasks"] = next_tasks
        next_phases.append(next_phase)

    if found is None:
        return None
    phase, task = found
    return {"phases": next_phases}, phase, task


def _patch_task_claim_snapshot(
    snapshot_json: dict[str, Any],
    task_id: str,
    claimed_by: str | None,
    claimed_by_id: str | None,
    claimed_at: str | None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]] | None:
    """Return (next_snapshot, phase_dict, original_task_dict) or None if task not found."""
    phases = snapshot_json.get("phases", [])
    if not isinstance(phases, list):
        return None

    next_phases: list[Any] = []
    found: tuple[dict[str, Any], dict[str, Any]] | None = None

    for phase in phases:
        if not isinstance(phase, dict):
            next_phases.append(phase)
            continue

        tasks = phase.get("tasks", [])
        if not isinstance(tasks, list):
            next_phases.append(dict(phase))
            continue

        next_tasks = []
        for task in tasks:
            if not isinstance(task, dict) or task.get("id") != task_id or found is not None:
                next_tasks.append(task)
                continue

            found = (phase, task)
            next_task = dict(task)
            if claimed_by is not None:
                next_task["claimedBy"] = claimed_by
                next_task["claimedById"] = claimed_by_id
                next_task["claimedAt"] = claimed_at
            else:
                next_task.pop("claimedBy", None)
                next_task.pop("claimedById", None)
                next_task.pop("claimedAt", None)
            next_tasks.append(next_task)

        next_phase = dict(phase)
        next_phase["tasks"] = next_tasks
        next_phases.append(next_phase)

    if found is None:
        return None
    phase, task = found
    return {"phases": next_phases}, phase, task


# ---------------------------------------------------------------------------
# Snapshot ↔ phases conversion
# ---------------------------------------------------------------------------


def _snapshot_from_phases(phases: list[PhaseDTO]) -> dict:
    return {"phases": [p.model_dump(exclude_none=True) for p in phases]}


def _phases_from_snapshot(snapshot_json: dict) -> list[PhaseDTO]:
    return [PhaseDTO(**p) for p in snapshot_json.get("phases", [])]


# ---------------------------------------------------------------------------
# Response construction
# ---------------------------------------------------------------------------


def _roadmap_response(roadmap: Roadmap, phases: list[PhaseDTO]) -> RoadmapResponse:
    return RoadmapResponse(
        id=roadmap.id,
        name=roadmap.name,
        owner_display_name=roadmap.owner_display_name,
        schema_version=roadmap.schema_version,
        phases=phases,
        tag_registry=roadmap.tag_registry_json or None,
        is_password_enabled=roadmap.is_password_enabled,
        created_at=roadmap.created_at,
        updated_at=roadmap.updated_at,
    )


# ---------------------------------------------------------------------------
# Projection-assisted read
# ---------------------------------------------------------------------------


async def _phases_for_read(db: AsyncSession, roadmap: Roadmap) -> list[PhaseDTO]:
    if not get_settings().roadmap_projection_read_enabled:
        return _phases_from_snapshot(roadmap.snapshot_json)

    try:
        parity = await validate_projection_parity(db, roadmap)
        if not parity.ok:
            logger.warning(
                "roadmap projection parity failed; falling back to snapshot",
                extra={"roadmap_id": roadmap.id, "issues": parity.issues},
            )
            return _phases_from_snapshot(roadmap.snapshot_json)

        projection_snapshot = await serialize_projection_to_snapshot(db, roadmap.id)
        return _phases_from_snapshot(projection_snapshot)
    except Exception as exc:
        logger.warning(
            "roadmap projection read failed; falling back to snapshot",
            extra={"roadmap_id": roadmap.id, "error": str(exc)},
            exc_info=True,
        )
        return _phases_from_snapshot(roadmap.snapshot_json)


# ---------------------------------------------------------------------------
# DB fetch helpers
# ---------------------------------------------------------------------------


async def _fetch_active_roadmap(db: AsyncSession, roadmap_id: str) -> Roadmap:
    result = await db.execute(
        select(Roadmap).where(Roadmap.id == roadmap_id, Roadmap.deleted_at.is_(None))
    )
    roadmap = result.scalar_one_or_none()
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return roadmap


async def _fetch_active_roadmap_for_update(db: AsyncSession, roadmap_id: str) -> Roadmap:
    result = await db.execute(
        select(Roadmap)
        .where(Roadmap.id == roadmap_id, Roadmap.deleted_at.is_(None))
        .with_for_update()
    )
    roadmap = result.scalar_one_or_none()
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return roadmap


# ---------------------------------------------------------------------------
# Conflict detection
# ---------------------------------------------------------------------------


def _phase_task_ids(phases: list[PhaseDTO]) -> tuple[set[str], set[str]]:
    phase_ids = {phase.id for phase in phases}
    task_ids = {task.id for phase in phases for task in phase.tasks}
    return phase_ids, task_ids


def _conflict_summary(
    server_phases: list[PhaseDTO], client_phases: list[PhaseDTO] | None
) -> RoadmapConflictSummary:
    phase_count = len(server_phases)
    task_count = sum(len(phase.tasks) for phase in server_phases)
    if client_phases is None:
        return RoadmapConflictSummary(phase_count=phase_count, task_count=task_count)

    server_phase_ids, server_task_ids = _phase_task_ids(server_phases)
    client_phase_ids, client_task_ids = _phase_task_ids(client_phases)
    return RoadmapConflictSummary(
        phase_count=phase_count,
        task_count=task_count,
        phase_ids=sorted(server_phase_ids.symmetric_difference(client_phase_ids)),
        task_ids=sorted(server_task_ids.symmetric_difference(client_task_ids)),
    )


def _roadmap_conflict_response(
    roadmap: Roadmap,
    client_last_updated_at: datetime,
    client_phases: list[PhaseDTO] | None,
) -> RoadmapConflictResponse:
    server_phases = _phases_from_snapshot(roadmap.snapshot_json)
    return RoadmapConflictResponse(
        detail="Roadmap was updated by another session",
        conflict=RoadmapConflictMetadata(
            roadmap_id=roadmap.id,
            server_updated_at=roadmap.updated_at,
            client_last_updated_at=client_last_updated_at,
            server=RoadmapConflictServerSnapshot(
                name=roadmap.name,
                phases=server_phases,
            ),
            summary=_conflict_summary(server_phases, client_phases),
        ),
    )
