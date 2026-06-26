import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink
from api.schemas.roadmap import (
    ActivityLogListResponse,
    ActivityLogResponse,
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    RoadmapResponse,
    ShareLinkResponse,
    UpdateRoadmapRequest,
)

# PatchTaskClaimRequest is intentionally omitted — the claim endpoint has no body.
from api.services.event_bus import Event, event_bus
from api.services.id_service import generate_id
from api.services.password_service import hash_password
from api.services.roadmap_helpers import (
    RoadmapConflictError,
    _change_summary_fields,
    _fetch_active_roadmap,
    _fetch_active_roadmap_for_update,
    _phases_for_read,
    _phases_from_snapshot,
    _roadmap_conflict_response,
    _roadmap_response,
    _snapshot_from_phases,
)
from api.services.roadmap_join_service import join_roadmap  # noqa: F401
from api.services.roadmap_projection_service import (
    sync_roadmap_projection_best_effort,
)
from api.services.session_policy import ensure_aware_utc, session_expires_at
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


