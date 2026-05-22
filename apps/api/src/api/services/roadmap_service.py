from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink
from api.schemas.roadmap import (
    ActivityLogListResponse,
    ActivityLogResponse,
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    JoinRoadmapRequest,
    JoinRoadmapResponse,
    PhaseDTO,
    RoadmapResponse,
    ShareLinkResponse,
    ShareRole,
    UpdateRoadmapRequest,
)
from api.services.event_bus import Event, event_bus
from api.services.id_service import generate_id
from api.services.password_service import hash_password, verify_password
from api.services.token_service import generate_token, hash_token
from api.services.token_service import token_prefix as make_token_prefix

# Role → invite-token prefix (non-secret hint only).
_SHARE_PREFIXES: dict[str, str] = {
    "owner": "ow_",
    "editor": "ed_",
    "viewer": "vi_",
}


async def create_roadmap(
    db: AsyncSession,
    payload: CreateRoadmapRequest,
    web_base_url: str,
) -> CreateRoadmapResponse:
    """Persist a new roadmap from a local frontend snapshot.

    Writes one Roadmap, one owner Participant, three ShareLinks (owner/editor/
    viewer), and one ActivityLog row in a single transaction. Raw tokens are
    held only in local variables and returned in the response — never stored.
    """
    now = datetime.now(timezone.utc)
    roadmap_id = generate_id("rm_")

    # ── Roadmap ───────────────────────────────────────────────────────────────
    roadmap = Roadmap(
        id=roadmap_id,
        name=payload.name,
        owner_display_name=payload.owner_display_name,
        snapshot_json={"phases": [p.model_dump(exclude_none=True) for p in payload.phases]},
        schema_version="1.0",
        is_password_enabled=bool(payload.password),
        password_hash=hash_password(payload.password) if payload.password else None,
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
    )
    db.add(participant)

    # ── Share links — one per role ────────────────────────────────────────────
    # Raw tokens live only in this dict and the response; only hashes are persisted.
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
            token_prefix=make_token_prefix(raw),
        )
        db.add(sl)
        share_link_rows.append(sl)

    # ── Activity log ──────────────────────────────────────────────────────────
    action = "roadmap.created"
    entity_type = "roadmap"
    entity_id = roadmap_id
    metadata_json = None
    if payload.change_summary is not None and isinstance(payload.change_summary.get("action"), str):
        action = payload.change_summary["action"]
        entity_type = payload.change_summary.get("entity_type", "roadmap")
        entity_id = payload.change_summary.get("entity_id", roadmap_id)
        metadata_json = payload.change_summary

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
        is_password_enabled=roadmap.is_password_enabled,
        created_at=roadmap.created_at,
        updated_at=roadmap.updated_at,
        share_links=share_links_out,
        owner_session_token=owner_session_token,
    )


_ROLE_ORDER: dict[str, int] = {"owner": 0, "editor": 1, "viewer": 2}


def _phases_from_snapshot(snapshot_json: dict) -> list[PhaseDTO]:
    return [PhaseDTO(**p) for p in snapshot_json.get("phases", [])]


def _roadmap_response(roadmap: Roadmap, phases: list[PhaseDTO]) -> RoadmapResponse:
    return RoadmapResponse(
        id=roadmap.id,
        name=roadmap.name,
        owner_display_name=roadmap.owner_display_name,
        schema_version=roadmap.schema_version,
        phases=phases,
        is_password_enabled=roadmap.is_password_enabled,
        created_at=roadmap.created_at,
        updated_at=roadmap.updated_at,
    )


async def _fetch_active_roadmap(db: AsyncSession, roadmap_id: str) -> Roadmap:
    result = await db.execute(
        select(Roadmap).where(Roadmap.id == roadmap_id, Roadmap.deleted_at.is_(None))
    )
    roadmap = result.scalar_one_or_none()
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return roadmap


async def get_roadmap(db: AsyncSession, roadmap_id: str) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap(db, roadmap_id)
    return _roadmap_response(roadmap, _phases_from_snapshot(roadmap.snapshot_json))


async def update_roadmap(
    db: AsyncSession,
    roadmap_id: str,
    payload: UpdateRoadmapRequest,
    participant: Participant | None = None,
) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap(db, roadmap_id)

    # ── Concurrency check ─────────────────────────────────────────────────────
    if payload.last_updated_at:
        # DB updated_at might have more precision than the client's version,
        # so we check if the DB is strictly newer.
        if roadmap.updated_at > payload.last_updated_at:
            raise HTTPException(status_code=409, detail="Roadmap changed elsewhere")

    before_json: dict = {}
    after_json: dict = {}

    if payload.name is not None and payload.name != roadmap.name:
        before_json["name"] = roadmap.name
        after_json["name"] = payload.name
        roadmap.name = payload.name

    if payload.phases is not None:
        before_json["phase_count"] = len(roadmap.snapshot_json.get("phases", []))
        after_json["phase_count"] = len(payload.phases)
        roadmap.snapshot_json = {
            "phases": [p.model_dump(exclude_none=True) for p in payload.phases]
        }

    action = "roadmap.updated"
    entity_type = "roadmap"
    entity_id = roadmap_id
    metadata_json = None

    if payload.change_summary is not None and isinstance(payload.change_summary.get("action"), str):
        action = payload.change_summary["action"]
        entity_type = payload.change_summary.get("entity_type", "roadmap")
        entity_id = payload.change_summary.get("entity_id", roadmap_id)
        metadata_json = payload.change_summary

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
    roadmap = await _fetch_active_roadmap(db, roadmap_id)
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


async def get_share_links(db: AsyncSession, roadmap_id: str) -> list[ShareLinkResponse]:
    exists = await db.execute(
        select(Roadmap.id).where(Roadmap.id == roadmap_id, Roadmap.deleted_at.is_(None))
    )
    if exists.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    result = await db.execute(select(ShareLink).where(ShareLink.roadmap_id == roadmap_id))
    links_by_role = {sl.role: sl for sl in result.scalars().all()}

    responses: list[ShareLinkResponse] = []
    for role in sorted(_SHARE_PREFIXES.keys(), key=lambda r: _ROLE_ORDER.get(r, 99)):
        sl = links_by_role.get(role)
        if sl is None:
            responses.append(
                ShareLinkResponse(
                    id=None,
                    role=role,  # type: ignore[arg-type]
                    token_prefix=None,
                    url=None,
                    is_active=False,
                    created_at=None,
                    rotated_at=None,
                )
            )
            continue

        responses.append(
            ShareLinkResponse(
                id=sl.id,
                role=sl.role,  # type: ignore[arg-type]
                token_prefix=None,
                url=None,
                is_active=sl.is_active,
                created_at=sl.created_at,
                rotated_at=sl.rotated_at,
            )
        )
    return responses


async def rotate_share_link(
    db: AsyncSession,
    roadmap_id: str,
    role: ShareRole,
    web_base_url: str,
    participant: Participant | None = None,
) -> ShareLinkResponse:
    await _fetch_active_roadmap(db, roadmap_id)

    result = await db.execute(
        select(ShareLink).where(
            ShareLink.roadmap_id == roadmap_id,
            ShareLink.role == role,
        )
    )
    share_link = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    raw_token = generate_token(_SHARE_PREFIXES[role])

    if share_link is None:
        share_link = ShareLink(
            id=generate_id("sl_"),
            roadmap_id=roadmap_id,
            role=role,
            token_hash=hash_token(raw_token),
            token_prefix=make_token_prefix(raw_token),
            is_active=True,
            rotated_at=now,
        )
        db.add(share_link)
    else:
        share_link.token_hash = hash_token(raw_token)
        share_link.token_prefix = make_token_prefix(raw_token)
        share_link.is_active = True
        share_link.rotated_at = now
        share_link.last_used_at = None

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id if participant else None,
        actor_name=participant.display_name if participant else None,
        action="share_link.rotated",
        entity_type="share_link",
        entity_id=share_link.id,
        metadata_json={"role": role},
    ))

    await db.commit()
    await db.refresh(share_link)

    return ShareLinkResponse(
        id=share_link.id,
        role=share_link.role,  # type: ignore[arg-type]
        token_prefix=share_link.token_prefix,
        url=f"{web_base_url}/join?token={raw_token}",
        is_active=True,
        created_at=share_link.created_at,
        rotated_at=share_link.rotated_at,
    )


async def revoke_share_link(
    db: AsyncSession,
    roadmap_id: str,
    role: ShareRole,
    participant: Participant | None = None,
) -> None:
    await _fetch_active_roadmap(db, roadmap_id)

    result = await db.execute(
        select(ShareLink).where(
            ShareLink.roadmap_id == roadmap_id,
            ShareLink.role == role,
            ShareLink.is_active.is_(True),
        )
    )
    share_link = result.scalar_one_or_none()
    if share_link is None:
        raise HTTPException(status_code=404, detail="Share link not found")

    share_link.is_active = False

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id if participant else None,
        actor_name=participant.display_name if participant else None,
        action="share_link.revoked",
        entity_type="share_link",
        entity_id=share_link.id,
        metadata_json={"role": role},
    ))

    await db.commit()


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


async def join_roadmap(db: AsyncSession, payload: JoinRoadmapRequest) -> JoinRoadmapResponse:
    token_hash = hash_token(payload.token)

    # Resolve active share link by the hashed invite token.
    sl_result = await db.execute(
        select(ShareLink).where(
            ShareLink.token_hash == token_hash,
            ShareLink.is_active.is_(True),
        )
    )
    share_link = sl_result.scalar_one_or_none()

    if share_link is None:
        raise HTTPException(status_code=401, detail="Invalid or expired invite token")

    # Verify the linked roadmap is not soft-deleted.
    rm_result = await db.execute(
        select(Roadmap).where(
            Roadmap.id == share_link.roadmap_id,
            Roadmap.deleted_at.is_(None),
        )
    )
    roadmap = rm_result.scalar_one_or_none()
    if roadmap is None:
        raise HTTPException(status_code=401, detail="Invalid or expired invite token")

    if roadmap.is_password_enabled:
        pw = payload.password
        ph = roadmap.password_hash
        if not pw or not ph or not verify_password(pw, ph):
            raise HTTPException(status_code=401, detail="Invalid invite token or password")

    now = datetime.now(timezone.utc)
    share_link.last_used_at = now

    _role_defaults = {"owner": "Guest Owner", "editor": "Guest Editor", "viewer": "Guest Viewer"}
    display_name = payload.display_name or _role_defaults.get(share_link.role, "Guest")

    # Raw session token is held only in this local variable and the response body.
    session_token = generate_token("sess_")
    participant = Participant(
        id=generate_id("pt_"),
        roadmap_id=roadmap.id,
        display_name=display_name,
        role=share_link.role,
        session_token_hash=hash_token(session_token),
    )
    db.add(participant)

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap.id,
        participant_id=participant.id,
        actor_name=display_name,
        action="participant.joined",
        entity_type="participant",
        entity_id=participant.id,
        metadata_json={"role": share_link.role},
    ))

    await db.commit()

    return JoinRoadmapResponse(
        roadmap_id=roadmap.id,
        roadmap_name=roadmap.name,
        role=share_link.role,  # type: ignore[arg-type]
        session_token=session_token,
        participant_id=participant.id,
    )
