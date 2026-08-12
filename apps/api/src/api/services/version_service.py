"""Roadmap version checkpoint, list, detail, and restore logic."""

import logging

import sqlalchemy as sa
from copy import deepcopy
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.models.roadmap import ActivityLog, Participant, Roadmap, RoadmapVersion
from api.services.activity_log_limit import enforce_activity_log_cap
from api.schemas.roadmap import (
    PhaseDTO,
    RoadmapResponse,
    RoadmapVersionDetailResponse,
    RoadmapVersionSummaryResponse,
)
from api.services.event_bus import Event, event_bus
from api.services.id_service import generate_id
from api.services.roadmap_projection_service import sync_roadmap_projection_best_effort
from api.services.session_policy import ensure_aware_utc

logger = logging.getLogger(__name__)

_MAX_ROADMAP_VERSIONS = 100

# Actions that warrant a restore point in version history.
# Default is False for any unknown action — version history is conservative.
_VERSION_WORTHY_ACTIONS: frozenset[str] = frozenset({
    "roadmap.created",
    "roadmap.imported",
    "import.replaced",
    "roadmap.restored",
    "roadmap.checkpoint",
})


def _should_create_version(action: str | None, metadata: dict | None) -> bool:
    if action is None:
        return False
    return action in _VERSION_WORTHY_ACTIONS


def _snapshot_counts(snapshot_json: dict) -> tuple[int, int]:
    phases = snapshot_json.get("phases", [])
    if not isinstance(phases, list):
        return 0, 0
    task_count = sum(len(p.get("tasks", [])) for p in phases if isinstance(p, dict))
    return len(phases), task_count


def _version_snapshot(roadmap: Roadmap) -> dict:
    """Build the portable version envelope without copying volatile server state."""
    phases = roadmap.snapshot_json.get("phases", [])
    return {
        "phases": deepcopy(phases) if isinstance(phases, list) else [],
        "tag_registry": deepcopy(roadmap.tag_registry_json or []),
    }


def _version_tag_registry(snapshot_json: dict) -> list[dict] | None:
    """Return None for legacy phase-only versions so restore can preserve current tags."""
    registry = snapshot_json.get("tag_registry")
    return deepcopy(registry) if isinstance(registry, list) else None


def _roadmap_snapshot_from_version(snapshot_json: dict) -> dict:
    phases = snapshot_json.get("phases", [])
    return {"phases": deepcopy(phases) if isinstance(phases, list) else []}


async def _trim_old_versions(db: AsyncSession, roadmap_id: str) -> None:
    rows_result = await db.execute(
        select(
            RoadmapVersion.id,
            sa.func.pg_column_size(RoadmapVersion.snapshot_json),
        )
        .where(RoadmapVersion.roadmap_id == roadmap_id)
        .order_by(RoadmapVersion.version_number.desc())
    )
    rows = rows_result.all()
    byte_cap = get_settings().max_version_history_bytes_per_roadmap
    total_bytes = 0
    old_ids: list[str] = []
    for index, (version_id, stored_bytes) in enumerate(rows):
        size = int(stored_bytes or 0)
        preserve = index < 3
        if (
            index >= _MAX_ROADMAP_VERSIONS
            or (not preserve and total_bytes + size > byte_cap)
        ):
            old_ids.extend(row[0] for row in rows[index:])
            break
        total_bytes += size
    if old_ids:
        await db.execute(delete(RoadmapVersion).where(RoadmapVersion.id.in_(old_ids)))


async def _create_roadmap_version(
    db: AsyncSession,
    roadmap: Roadmap,
    participant: Participant | None,
    action: str | None,
    metadata_json: dict | None = None,
    force: bool = False,
) -> None:
    latest_result = await db.execute(
        select(RoadmapVersion)
        .where(RoadmapVersion.roadmap_id == roadmap.id)
        .order_by(RoadmapVersion.version_number.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()
    current_snapshot = _version_snapshot(roadmap)

    if not force and latest and (
        latest.roadmap_name == roadmap.name and latest.snapshot_json == current_snapshot
    ):
        return

    next_number = (latest.version_number if latest else 0) + 1
    db.add(RoadmapVersion(
        id=generate_id("rv_"),
        roadmap_id=roadmap.id,
        version_number=next_number,
        roadmap_name=roadmap.name,
        snapshot_json=current_snapshot,
        participant_id=participant.id if participant else None,
        actor_name=participant.display_name if participant else None,
        action=action,
        metadata_json=metadata_json,
    ))
    await db.flush()
    # Trim is called after flush so the freshly inserted version is visible
    # in the count, ensuring the cap is accurate.
    await _trim_old_versions(db, roadmap.id)


# ── helpers (shared with roadmap_service) ──────────────────────────────────

def _phases_from_snapshot(snapshot_json: dict) -> list[PhaseDTO]:
    return [PhaseDTO(**p) for p in snapshot_json.get("phases", [])]


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


# ── public version endpoints ──────────────────────────────────────────────


async def get_roadmap_versions(
    db: AsyncSession,
    roadmap_id: str,
) -> list[RoadmapVersionSummaryResponse]:
    from api.services.roadmap_helpers import _fetch_active_roadmap

    await _fetch_active_roadmap(db, roadmap_id)

    result = await db.execute(
        select(RoadmapVersion)
        .where(RoadmapVersion.roadmap_id == roadmap_id)
        .order_by(RoadmapVersion.version_number.desc())
    )
    versions = result.scalars().all()
    responses: list[RoadmapVersionSummaryResponse] = []
    for version in versions:
        phase_count, task_count = _snapshot_counts(version.snapshot_json)
        responses.append(RoadmapVersionSummaryResponse(
            id=version.id,
            version_number=version.version_number,
            created_at=version.created_at,
            actor_name=version.actor_name,
            action=version.action,
            phase_count=phase_count,
            task_count=task_count,
        ))
    return responses


async def get_roadmap_version(
    db: AsyncSession,
    roadmap_id: str,
    version_id: str,
) -> RoadmapVersionDetailResponse:
    from api.services.roadmap_helpers import _fetch_active_roadmap

    await _fetch_active_roadmap(db, roadmap_id)
    result = await db.execute(
        select(RoadmapVersion).where(
            RoadmapVersion.roadmap_id == roadmap_id,
            RoadmapVersion.id == version_id,
        )
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")

    phase_count, task_count = _snapshot_counts(version.snapshot_json)
    return RoadmapVersionDetailResponse(
        id=version.id,
        version_number=version.version_number,
        roadmap_name=version.roadmap_name,
        phases=_phases_from_snapshot(version.snapshot_json),
        tag_registry=_version_tag_registry(version.snapshot_json),
        created_at=version.created_at,
        actor_name=version.actor_name,
        action=version.action,
        phase_count=phase_count,
        task_count=task_count,
        metadata_json=version.metadata_json,
    )


async def restore_roadmap_version(
    db: AsyncSession,
    roadmap_id: str,
    version_id: str,
    participant: Participant,
    last_updated_at: datetime,
    *,
    force: bool = False,
) -> RoadmapResponse:
    from api.services.roadmap_helpers import (
        RoadmapConflictError,
        _fetch_active_roadmap_for_update,
        _roadmap_conflict_response,
    )

    roadmap = await _fetch_active_roadmap_for_update(db, roadmap_id)
    result = await db.execute(
        select(RoadmapVersion).where(
            RoadmapVersion.roadmap_id == roadmap_id,
            RoadmapVersion.id == version_id,
        )
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")

    # ── Conflict check ───────────────────────────────────────────────────────
    # Same compare-and-swap contract as PUT/PATCH writes (see roadmap_service
    # .update_roadmap): `last_updated_at` must exactly match the roadmap's
    # current revision or nothing is written. `force` never bypasses this —
    # it only changes what happens once the match succeeds (see below). This
    # keeps a second collaborator's save, made after a 409 was already shown
    # and force-confirmed against, from being silently overwritten: the
    # force request still carries the now-stale revision, so it gets another
    # 409 instead of proceeding.
    client_ts = ensure_aware_utc(last_updated_at)
    if roadmap.updated_at != client_ts:
        raise RoadmapConflictError(_roadmap_conflict_response(roadmap, client_ts, None))

    # `force=True` is the owner's explicit, separately confirmed
    # acknowledgement that this restore replaces the roadmap's current
    # state (which they may have only just reviewed via a 409) rather than
    # a plain restore of a base they already had loaded. Always audit it.
    overwritten_updated_at: datetime | None = roadmap.updated_at if force else None

    # Safety checkpoint of the current (pre-restore) state, so a restore —
    # forced or not — is always recoverable.
    await _create_roadmap_version(
        db, roadmap, participant, "roadmap.checkpoint",
        {"label": "Pre-restore safety checkpoint"}, force=True,
    )

    before_json = {
        "name": roadmap.name,
        "phase_count": len(roadmap.snapshot_json.get("phases", [])),
    }
    phase_count, task_count = _snapshot_counts(version.snapshot_json)
    roadmap.name = version.roadmap_name
    roadmap.snapshot_json = _roadmap_snapshot_from_version(version.snapshot_json)
    restored_registry = _version_tag_registry(version.snapshot_json)
    if restored_registry is not None:
        roadmap.tag_registry_json = restored_registry
    roadmap.updated_at = datetime.now(timezone.utc)

    metadata_json: dict = {
        "version_id": version.id,
        "version_number": version.version_number,
        "phase_count": phase_count,
        "task_count": task_count,
    }
    if overwritten_updated_at is not None:
        metadata_json["force"] = True
        metadata_json["overwritten_updated_at"] = overwritten_updated_at.isoformat()

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="roadmap.restored",
        entity_type="roadmap",
        entity_id=roadmap_id,
        before_json=before_json,
        after_json={"name": roadmap.name, "phase_count": phase_count},
        metadata_json=metadata_json,
    ))
    await _create_roadmap_version(
        db, roadmap, participant, "roadmap.restored", metadata_json, force=True
    )
    await sync_roadmap_projection_best_effort(db, roadmap, "restore")

    await enforce_activity_log_cap(db, roadmap_id)
    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(Event(
        roadmap_id=roadmap_id,
        action="roadmap.updated",
        payload={
            "roadmap_id": roadmap_id,
            "updated_at": roadmap.updated_at.isoformat(),
            "participant_id": participant.id,
        }
    ))

    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


async def create_roadmap_checkpoint(
    db: AsyncSession,
    roadmap_id: str,
    participant: Participant,
) -> tuple[bool, RoadmapVersionSummaryResponse]:
    """Create a manual checkpoint version.

    Returns (created=True, version) when a new checkpoint is written, or
    (created=False, latest) when the current snapshot already matches the
    latest version and no new version is needed.
    """
    from api.services.roadmap_helpers import _fetch_active_roadmap_for_update

    roadmap = await _fetch_active_roadmap_for_update(db, roadmap_id)

    latest_result = await db.execute(
        select(RoadmapVersion)
        .where(RoadmapVersion.roadmap_id == roadmap_id)
        .order_by(RoadmapVersion.version_number.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()
    current_snapshot = _version_snapshot(roadmap)

    # Return latest unchanged when snapshot is identical to current state
    if latest and (
        latest.roadmap_name == roadmap.name and latest.snapshot_json == current_snapshot
    ):
        phase_count, task_count = _snapshot_counts(latest.snapshot_json)
        return False, RoadmapVersionSummaryResponse(
            id=latest.id,
            version_number=latest.version_number,
            created_at=latest.created_at,
            actor_name=latest.actor_name,
            action=latest.action,
            phase_count=phase_count,
            task_count=task_count,
        )

    next_number = (latest.version_number if latest else 0) + 1
    metadata_json: dict = {"label": "Manual checkpoint"}
    new_version = RoadmapVersion(
        id=generate_id("rv_"),
        roadmap_id=roadmap_id,
        version_number=next_number,
        roadmap_name=roadmap.name,
        snapshot_json=current_snapshot,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="roadmap.checkpoint",
        metadata_json=metadata_json,
    )
    db.add(new_version)
    await db.flush()
    await _trim_old_versions(db, roadmap_id)

    await enforce_activity_log_cap(db, roadmap_id)
    await db.commit()
    await db.refresh(new_version)

    phase_count, task_count = _snapshot_counts(new_version.snapshot_json)
    return True, RoadmapVersionSummaryResponse(
        id=new_version.id,
        version_number=new_version.version_number,
        created_at=new_version.created_at,
        actor_name=new_version.actor_name,
        action=new_version.action,
        phase_count=phase_count,
        task_count=task_count,
    )
