import logging

import sqlalchemy as sa
from fastapi import HTTPException
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink
from api.services.activity_log_limit import enforce_activity_log_cap
from api.schemas.roadmap import (
    ActivityLogListResponse,
    ActivityLogResponse,
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    RoadmapResponse,
    ShareLinkResponse,
    TagDefinitionDTO,
    UpdateRoadmapRequest,
)

# PatchTaskClaimRequest is intentionally omitted — the claim endpoint has no body.
from api.services.event_bus import Event, event_bus
from api.services.id_service import generate_id
from api.services.password_service import hash_password
from api.services.roadmap_concurrency import ensure_roadmap_is_current
from api.services.roadmap_helpers import (
    RoadmapConflictError,  # noqa: F401 - compatibility re-export for routers/tests
    _change_summary_fields,
    _fetch_active_roadmap,
    _fetch_active_roadmap_for_update,
    _phases_for_read,
    _phases_from_snapshot,
    _roadmap_response,
    _snapshot_from_phases,
)
from api.services.roadmap_join_service import join_roadmap  # noqa: F401
from api.services.roadmap_projection_service import sync_roadmap_projection_best_effort
from api.services.roadmap_validation import validate_roadmap_domain
from api.services.session_policy import session_expires_at
from api.services.sharing_service import _ROLE_LABELS, _ROLE_ORDER, _SHARE_PREFIXES  # noqa: F401
from api.services.token_service import generate_token, hash_token
from api.services.token_service import token_prefix as make_token_prefix

# Re-exports from extracted service modules (backward compat). _MAX_ROADMAP_VERSIONS
# and _trim_old_versions are unused here but imported by tests via this module.
from api.services.version_service import (  # noqa: F401
    _MAX_ROADMAP_VERSIONS,
    _create_roadmap_version,
    _should_create_version,
    _trim_old_versions,
)

logger = logging.getLogger(__name__)
_SERVER_ROADMAP_CAPACITY_LOCK = 0x52464F52


def _stored_tag_registry(roadmap: Roadmap) -> list[TagDefinitionDTO] | None:
    if roadmap.tag_registry_json is None:
        return None
    return [TagDefinitionDTO.model_validate(tag) for tag in roadmap.tag_registry_json]


async def create_roadmap(
    db: AsyncSession,
    payload: CreateRoadmapRequest,
    web_base_url: str,
    max_server_roadmaps: int,
) -> CreateRoadmapResponse:
    """Persist a new roadmap from a local frontend snapshot.

    Writes one Roadmap, one owner Participant, three ShareLinks (owner/editor/
    viewer), and one ActivityLog row in a single transaction. Owner/editor
    raw invite tokens are held only in local variables and returned in the response.
    No role's raw invite credential is persisted server-side.
    """
    # PostgreSQL advisory lock makes the global record cap exact even when
    # many anonymous create requests arrive concurrently. Soft-deleted rows
    # deliberately continue to count until retention hard-purges them.
    await db.execute(
        sa.select(sa.func.pg_advisory_xact_lock(_SERVER_ROADMAP_CAPACITY_LOCK))
    )
    roadmap_count = await db.scalar(sa.select(sa.func.count(Roadmap.id)))
    if int(roadmap_count or 0) >= max_server_roadmaps:
        raise HTTPException(
            status_code=503,
            detail="Server roadmap capacity is temporarily unavailable",
        )
    validate_roadmap_domain(payload.phases, payload.tag_registry)
    now = datetime.now(timezone.utc)
    roadmap_id = generate_id("rm_")

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

    raw_tokens: dict[str, str] = {}
    share_link_rows: list[ShareLink] = []
    for role, prefix in _SHARE_PREFIXES.items():
        raw = generate_token(prefix)
        raw_tokens[role] = raw
        share_link = ShareLink(
            id=generate_id("sl_"),
            roadmap_id=roadmap_id,
            role=role,
            token_hash=hash_token(raw),
            token_prefix=make_token_prefix(raw),
        )
        db.add(share_link)
        share_link_rows.append(share_link)

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

    # Seed the derivative projection once for operators that later run parity
    # checks. Normal edits intentionally update only the canonical snapshot; a
    # backfill is required before projection reads can be enabled.
    await sync_roadmap_projection_best_effort(db, roadmap, "create")

    await enforce_activity_log_cap(db, roadmap.id)
    await db.commit()
    await db.refresh(roadmap)

    share_links_out = [
        ShareLinkResponse(
            id=share_link.id,
            role=share_link.role,  # type: ignore[arg-type]
            token_prefix=share_link.token_prefix,
            url=f"{web_base_url.rstrip('/')}/join#token={raw_tokens[share_link.role]}",
            is_active=True,
            created_at=now,
        )
        for share_link in share_link_rows
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
        owner_participant_id=participant.id,
        owner_session_token=owner_session_token,
    )


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

    # The echoed server timestamp is an opaque compare-and-swap token. Exact
    # equality prevents future client timestamps from bypassing conflict checks.
    ensure_roadmap_is_current(roadmap, payload.last_updated_at, payload.phases)

    next_phases = (
        payload.phases
        if payload.phases is not None
        else _phases_from_snapshot(roadmap.snapshot_json)
    )
    next_tag_registry = (
        payload.tag_registry
        if payload.tag_registry is not None
        else _stored_tag_registry(roadmap)
    )
    validate_roadmap_domain(next_phases, next_tag_registry)

    roadmap.updated_at = datetime.now(timezone.utc)

    before_json: dict = {}
    after_json: dict = {}

    if payload.name is not None and payload.name != roadmap.name:
        before_json["name"] = roadmap.name
        after_json["name"] = payload.name
        roadmap.name = payload.name

    if payload.phases is not None:
        before_json["phase_count"] = len(roadmap.snapshot_json.get("phases", []))
        after_json["phase_count"] = len(payload.phases)
        roadmap.snapshot_json = _snapshot_from_phases(payload.phases)

    if payload.tag_registry is not None:
        roadmap.tag_registry_json = [
            tag.model_dump(exclude_none=True) for tag in payload.tag_registry
        ]

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

    # Full snapshot replacements can move, add, or remove arbitrary phases and
    # tasks, so they require one full derivative projection rebuild. Ordinary
    # task writes use the incremental path in roadmap_task_service instead.
    if payload.phases is not None:
        await sync_roadmap_projection_best_effort(db, roadmap, "roadmap.updated")
    await enforce_activity_log_cap(db, roadmap.id)
    await db.commit()
    await db.refresh(roadmap)

    await event_bus.publish(Event(
        roadmap_id=roadmap_id,
        action="roadmap.updated",
        payload={
            "roadmap_id": roadmap_id,
            "updated_at": roadmap.updated_at.isoformat(),
            "participant_id": participant.id if participant else None,
        },
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
    await enforce_activity_log_cap(db, roadmap.id)
    await db.commit()

    await event_bus.publish(Event(
        roadmap_id=roadmap_id,
        action="roadmap.deleted",
        payload={
            "roadmap_id": roadmap_id,
            "updated_at": now.isoformat(),
            "participant_id": participant.id,
        },
    ))

    return {"ok": True}


async def get_activity_logs(
    db: AsyncSession,
    roadmap_id: str,
    limit: int = 100,
    offset: int = 0,
) -> ActivityLogListResponse:
    await _fetch_active_roadmap(db, roadmap_id)

    safe_limit = min(limit, 200)
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
                id=activity.id,
                roadmap_id=activity.roadmap_id,
                participant_id=activity.participant_id,
                actor_name=activity.actor_name,
                action=activity.action,
                entity_type=activity.entity_type,
                entity_id=activity.entity_id,
                before_json=activity.before_json,
                after_json=activity.after_json,
                metadata_json=activity.metadata_json,
                created_at=activity.created_at,
            )
            for activity in return_logs
        ],
        has_more=has_more,
    )
