import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.config import get_settings
from api.models.roadmap import ActivityLog, Participant, Roadmap, RoadmapVersion, ShareLink
from api.schemas.limits import TAG_REGISTRY_MAX
from api.schemas.roadmap import (
    ActivityLogListResponse,
    ActivityLogResponse,
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    CreateTagRequest,
    ParticipantResponse,
    PatchTaskDoneRequest,
    PhaseDTO,
    RoadmapConflictMetadata,
    RoadmapConflictResponse,
    RoadmapConflictServerSnapshot,
    RoadmapConflictSummary,
    RoadmapResponse,
    ShareLinkResponse,
    ShareRole,
    TagResponse,
    UpdateRoadmapRequest,
    UpdateTagRequest,
)
# PatchTaskClaimRequest is intentionally omitted — the claim endpoint has no body.
from api.services.event_bus import Event, event_bus
from api.services.id_service import generate_id
from api.services.password_service import hash_password
from api.services.roadmap_projection_service import (
    serialize_projection_to_snapshot,
    sync_roadmap_projection_best_effort,
    validate_projection_parity,
)
from api.services.session_policy import ensure_aware_utc, session_expires_at
from api.services.token_service import generate_token, hash_token
from api.services.token_service import token_prefix as make_token_prefix

logger = logging.getLogger(__name__)


class RoadmapConflictError(Exception):
    def __init__(self, response: RoadmapConflictResponse) -> None:
        self.response = response
        super().__init__(response.detail)


# ---------------------------------------------------------------------------
# Re-exports from extracted service modules (backward compat)
# ---------------------------------------------------------------------------

# Version constants and helpers
from api.services.version_service import (
    _create_roadmap_version,
    _MAX_ROADMAP_VERSIONS,
    _should_create_version,
    _trim_old_versions,
)

# Share / participant constants (used by create_roadmap and join_roadmap)
from api.services.sharing_service import _ROLE_LABELS, _ROLE_ORDER, _SHARE_PREFIXES  # noqa: F401

# Join / session entry-point (re-export for backward compat)
from api.services.roadmap_join_service import join_roadmap  # noqa: F401


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


def _snapshot_from_phases(phases: list[PhaseDTO]) -> dict:
    return {"phases": [p.model_dump(exclude_none=True) for p in phases]}


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


async def create_roadmap(
    db: AsyncSession,
    payload: CreateRoadmapRequest,
    web_base_url: str,
) -> CreateRoadmapResponse:
    """Persist a new roadmap from a local frontend snapshot.

    Writes one Roadmap, one owner Participant, three ShareLinks (owner/editor/
    viewer), and one ActivityLog row in a single transaction. Owner/editor
    raw tokens are held only in local variables and returned in the response.
    Viewer raw tokens may be persisted because they are public read-only demo links.
    """
    now = datetime.now(timezone.utc)
    roadmap_id = generate_id("rm_")

    # ── Roadmap ───────────────────────────────────────────────────────────────
    roadmap = Roadmap(
        id=roadmap_id,
        name=payload.name,
        owner_display_name=payload.owner_display_name,
        snapshot_json=_snapshot_from_phases(payload.phases),
        schema_version="1.0",
        is_password_enabled=bool(payload.password),
        password_hash=hash_password(payload.password) if payload.password else None,
        tag_registry_json=[t.model_dump(exclude_none=True) for t in payload.tag_registry]
        if payload.tag_registry else None,
    )
    db.add(roadmap)

    # ── Owner participant ─────────────────────────────────────────────────────
    owner_session_token = generate_token("sess_")
    participant = Participant(
        id=generate_id("pt_"),
        roadmap_id=roadmap_id,
        display_name=payload.owner_display_name,
        role="owner",
        session_token_hash=hash_token(owner_session_token),
        session_expires_at=session_expires_at(now),
    )
    db.add(participant)

    # ── Share links — one per role ────────────────────────────────────────────
    # Owner/editor raw tokens live only in this dict and the response.
    raw_tokens: dict[str, str] = {}
    share_link_rows: list[ShareLink] = []
    for role, prefix in _SHARE_PREFIXES.items():
        raw = generate_token(prefix)
        raw_tokens[role] = raw
        sl = ShareLink(
            id=generate_id("sl_"),
            roadmap_id=roadmap_id,
            role=role,
            token_hash=hash_token(raw),
            public_token=raw if role == "viewer" else None,
            token_prefix=make_token_prefix(raw),
        )
        db.add(sl)
        share_link_rows.append(sl)

    # ── Activity log ──────────────────────────────────────────────────────────
    action, entity_type, entity_id, metadata_json = _change_summary_fields(
        payload.change_summary,
        default_action="roadmap.created",
        default_entity_type="roadmap",
        default_entity_id=roadmap_id,
    )

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=payload.owner_display_name,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        after_json={"name": payload.name},
        metadata_json=metadata_json,
    ))
    await _create_roadmap_version(db, roadmap, participant, "roadmap.created", metadata_json)
    await sync_roadmap_projection_best_effort(db, roadmap, "create")

    await db.commit()
    # Refresh roadmap to read server-set created_at / updated_at timestamps.
    await db.refresh(roadmap)

    # Build share link responses while raw_tokens are still in scope.
    share_links_out = [
        ShareLinkResponse(
            id=sl.id,
            role=sl.role,  # type: ignore[arg-type]
            token_prefix=sl.token_prefix,
            url=f"{web_base_url}/join?token={raw_tokens[sl.role]}",
            is_active=True,
            created_at=now,
        )
        for sl in share_link_rows
    ]

    return CreateRoadmapResponse(
        id=roadmap.id,
        name=roadmap.name,
        owner_display_name=roadmap.owner_display_name,
        schema_version=roadmap.schema_version,
        phases=payload.phases,
        tag_registry=roadmap.tag_registry_json or None,
        is_password_enabled=roadmap.is_password_enabled,
        created_at=roadmap.created_at,
        updated_at=roadmap.updated_at,
        share_links=share_links_out,
        owner_session_token=owner_session_token,
    )


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


async def get_roadmap(db: AsyncSession, roadmap_id: str) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap(db, roadmap_id)
    return _roadmap_response(roadmap, await _phases_for_read(db, roadmap))


async def update_roadmap(
    db: AsyncSession,
    roadmap_id: str,
    payload: UpdateRoadmapRequest,
    participant: Participant | None = None,
) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap_for_update(db, roadmap_id)

    # ── Concurrency check ─────────────────────────────────────────────────────
    # Strict > (not >=): equal timestamps mean no concurrent write occurred and
    # the update is safe.  >= would cause spurious 409s on first-writer-wins
    # saves because the client echoes back the exact timestamp it received.
    # DB microsecond precision can exceed client serialization precision, so a
    # slightly-truncated client timestamp landing below the DB value correctly
    # fires the conflict (safe direction: spurious 409, never silent overwrite).
    # Coerce naive client timestamps to UTC to avoid TypeError on comparison.
    client_ts = ensure_aware_utc(payload.last_updated_at)
    if roadmap.updated_at > client_ts:
        raise RoadmapConflictError(
            _roadmap_conflict_response(roadmap, client_ts, payload.phases)
        )

    # Advance updated_at explicitly so subsequent stale-check comparisons work.
    # sa.func.now() (onupdate) emits SQL NOW() = transaction_timestamp(), which
    # is pinned to the outer transaction start — shared in tests and in long-lived
    # DB transactions. A Python-side timestamp is always strictly newer.
    roadmap.updated_at = datetime.now(timezone.utc)

    before_json: dict = {}
    after_json: dict = {}

    if payload.name is not None and payload.name != roadmap.name:
        before_json["name"] = roadmap.name
        after_json["name"] = payload.name
        roadmap.name = payload.name

    phases_changed = payload.phases is not None
    if payload.phases is not None:
        before_json["phase_count"] = len(roadmap.snapshot_json.get("phases", []))
        after_json["phase_count"] = len(payload.phases)
        roadmap.snapshot_json = _snapshot_from_phases(payload.phases)

    if payload.tag_registry is not None:
        roadmap.tag_registry_json = [t.model_dump(exclude_none=True) for t in payload.tag_registry]

    action, entity_type, entity_id, metadata_json = _change_summary_fields(
        payload.change_summary,
        default_action="roadmap.updated",
        default_entity_type="roadmap",
        default_entity_id=roadmap_id,
    )

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id if participant else None,
        actor_name=participant.display_name if participant else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_json=before_json or None,
        after_json=after_json or None,
        metadata_json=metadata_json,
    ))
    if _should_create_version(action, metadata_json):
        await _create_roadmap_version(db, roadmap, participant, action, metadata_json)
    if phases_changed:
        await sync_roadmap_projection_best_effort(db, roadmap, "update")

    await db.commit()
    await db.refresh(roadmap)

    # ── Realtime broadcast ────────────────────────────────────────────────────
    await event_bus.publish(Event(
        roadmap_id=roadmap_id,
        action="roadmap.updated",
        payload={
            "roadmap_id": roadmap_id,
            "updated_at": roadmap.updated_at.isoformat(),
            "participant_id": participant.id if participant else None,
        }
    ))

    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


async def delete_roadmap(
    db: AsyncSession,
    roadmap_id: str,
    participant: Participant,
) -> dict[str, bool]:
    roadmap = await _fetch_active_roadmap_for_update(db, roadmap_id)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(ShareLink).where(
            ShareLink.roadmap_id == roadmap_id,
            ShareLink.is_active.is_(True),
        )
    )
    for share_link in result.scalars().all():
        share_link.is_active = False

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="roadmap.deleted",
        entity_type="roadmap",
        entity_id=roadmap_id,
        before_json={"name": roadmap.name},
    ))

    roadmap.deleted_at = now
    await db.commit()

    await event_bus.publish(Event(
        roadmap_id=roadmap_id,
        action="roadmap.deleted",
        payload={
            "roadmap_id": roadmap_id,
            "updated_at": now.isoformat(),
            "participant_id": participant.id,
        }
    ))

    return {"ok": True}


async def get_activity_logs(
    db: AsyncSession,
    roadmap_id: str,
    limit: int = 100,
    offset: int = 0,
) -> ActivityLogListResponse:
    await _fetch_active_roadmap(db, roadmap_id)

    # Max limit 200
    safe_limit = min(limit, 200)

    # Fetch logs + 1 to check for has_more
    stmt = (
        select(ActivityLog)
        .where(ActivityLog.roadmap_id == roadmap_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(safe_limit + 1)
        .offset(offset)
    )
    result = await db.execute(stmt)
    logs = result.scalars().all()

    has_more = len(logs) > safe_limit
    return_logs = logs[:safe_limit]

    return ActivityLogListResponse(
        logs=[
            ActivityLogResponse(
                id=al.id,
                roadmap_id=al.roadmap_id,
                participant_id=al.participant_id,
                actor_name=al.actor_name,
                action=al.action,
                entity_type=al.entity_type,
                entity_id=al.entity_id,
                before_json=al.before_json,
                after_json=al.after_json,
                metadata_json=al.metadata_json,
                created_at=al.created_at,
            )
            for al in return_logs
        ],
        has_more=has_more,
    )


