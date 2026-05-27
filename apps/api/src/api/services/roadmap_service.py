from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, Roadmap, RoadmapVersion, ShareLink
from api.schemas.roadmap import (
    ActivityLogListResponse,
    ActivityLogResponse,
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    JoinRoadmapRequest,
    JoinRoadmapResponse,
    PhaseDTO,
    ParticipantResponse,
    RoadmapResponse,
    RoadmapVersionDetailResponse,
    RoadmapVersionSummaryResponse,
    ShareLinkResponse,
    ShareRole,
    UpdateRoadmapRequest,
)
from api.services.event_bus import Event, event_bus
from api.services.id_service import generate_id
from api.services.password_service import hash_password, verify_password
from api.services.rate_limit_service import rate_limiter
from api.services.token_service import generate_token, hash_token
from api.services.token_service import token_prefix as make_token_prefix

def _ensure_aware_utc(dt: datetime) -> datetime:
    """Return dt as a timezone-aware UTC datetime.

    If dt is naive (no tzinfo), treat it as UTC.
    If dt already carries timezone info, convert to UTC.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# Role → invite-token prefix (non-secret hint only).
_SHARE_PREFIXES: dict[str, str] = {
    "owner": "ow_",
    "editor": "ed_",
    "viewer": "vi_",
}

_MAX_ROADMAP_VERSIONS = 100
_SESSION_LIFETIME_DAYS = 30

# Actions that warrant a restore point in version history.
# Default is False for any unknown action — version history is conservative.
_VERSION_WORTHY_ACTIONS: frozenset[str] = frozenset({
    "roadmap.created",
    "roadmap.imported",
    "roadmap.restored",
    "roadmap.checkpoint",
})


def _session_expires_at(now: datetime) -> datetime:
    return now + timedelta(days=_SESSION_LIFETIME_DAYS)


def _should_create_version(action: str | None, metadata: dict | None) -> bool:
    if action is None:
        return False
    return action in _VERSION_WORTHY_ACTIONS


def _snapshot_from_phases(phases: list[PhaseDTO]) -> dict:
    return {"phases": [p.model_dump(exclude_none=True) for p in phases]}


def _snapshot_counts(snapshot_json: dict) -> tuple[int, int]:
    phases = snapshot_json.get("phases", [])
    if not isinstance(phases, list):
        return 0, 0
    task_count = sum(len(p.get("tasks", [])) for p in phases if isinstance(p, dict))
    return len(phases), task_count


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

    if not force and latest and latest.roadmap_name == roadmap.name and latest.snapshot_json == roadmap.snapshot_json:
        return

    next_number = (latest.version_number if latest else 0) + 1
    db.add(RoadmapVersion(
        id=generate_id("rv_"),
        roadmap_id=roadmap.id,
        version_number=next_number,
        roadmap_name=roadmap.name,
        snapshot_json=roadmap.snapshot_json,
        participant_id=participant.id if participant else None,
        actor_name=participant.display_name if participant else None,
        action=action,
        metadata_json=metadata_json,
    ))
    await db.flush()

    old_ids_result = await db.execute(
        select(RoadmapVersion.id)
        .where(RoadmapVersion.roadmap_id == roadmap.id)
        .order_by(RoadmapVersion.version_number.desc())
        .offset(_MAX_ROADMAP_VERSIONS)
    )
    old_ids = old_ids_result.scalars().all()
    if old_ids:
        await db.execute(delete(RoadmapVersion).where(RoadmapVersion.id.in_(old_ids)))


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
        session_expires_at=_session_expires_at(now),
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
    await _create_roadmap_version(db, roadmap, participant, "roadmap.created", metadata_json)

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
_ROLE_LABELS: dict[str, str] = {"owner": "Owner link", "editor": "Editor link", "viewer": "Viewer link"}


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
        # Coerce naive client timestamps to UTC to avoid TypeError on comparison.
        client_ts = _ensure_aware_utc(payload.last_updated_at)
        if roadmap.updated_at > client_ts:
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
        roadmap.snapshot_json = _snapshot_from_phases(payload.phases)

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
    if _should_create_version(action, metadata_json):
        await _create_roadmap_version(db, roadmap, participant, action, metadata_json)

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


async def get_roadmap_versions(
    db: AsyncSession,
    roadmap_id: str,
) -> list[RoadmapVersionSummaryResponse]:
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
) -> RoadmapResponse:
    roadmap = await _fetch_active_roadmap(db, roadmap_id)
    result = await db.execute(
        select(RoadmapVersion).where(
            RoadmapVersion.roadmap_id == roadmap_id,
            RoadmapVersion.id == version_id,
        )
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")

    before_json = {
        "name": roadmap.name,
        "phase_count": len(roadmap.snapshot_json.get("phases", [])),
    }
    phase_count, task_count = _snapshot_counts(version.snapshot_json)
    roadmap.name = version.roadmap_name
    roadmap.snapshot_json = version.snapshot_json
    roadmap.updated_at = datetime.now(timezone.utc)

    metadata_json = {
        "version_id": version.id,
        "version_number": version.version_number,
        "phase_count": phase_count,
        "task_count": task_count,
    }

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
    await _create_roadmap_version(db, roadmap, participant, "roadmap.restored", metadata_json, force=True)

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
) -> tuple[bool, "RoadmapVersionSummaryResponse"]:
    """Create a manual checkpoint version.

    Returns (created=True, version) when a new checkpoint is written, or
    (created=False, latest) when the current snapshot already matches the
    latest version and no new version is needed.
    """
    roadmap = await _fetch_active_roadmap(db, roadmap_id)

    latest_result = await db.execute(
        select(RoadmapVersion)
        .where(RoadmapVersion.roadmap_id == roadmap_id)
        .order_by(RoadmapVersion.version_number.desc())
        .limit(1)
    )
    latest = latest_result.scalar_one_or_none()

    # Return latest unchanged when snapshot is identical to current state
    if latest and latest.roadmap_name == roadmap.name and latest.snapshot_json == roadmap.snapshot_json:
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
        snapshot_json=roadmap.snapshot_json,
        participant_id=participant.id,
        actor_name=participant.display_name,
        action="roadmap.checkpoint",
        metadata_json=metadata_json,
    )
    db.add(new_version)
    await db.flush()

    old_ids_result = await db.execute(
        select(RoadmapVersion.id)
        .where(RoadmapVersion.roadmap_id == roadmap_id)
        .order_by(RoadmapVersion.version_number.desc())
        .offset(_MAX_ROADMAP_VERSIONS)
    )
    old_ids = old_ids_result.scalars().all()
    if old_ids:
        await db.execute(delete(RoadmapVersion).where(RoadmapVersion.id.in_(old_ids)))

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


async def get_share_links(
    db: AsyncSession,
    roadmap_id: str,
    web_base_url: str,
) -> list[ShareLinkResponse]:
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
                token_prefix=sl.token_prefix,
                url=(
                    f"{web_base_url}/join?token={sl.public_token}"
                    if sl.role == "viewer" and sl.is_active and sl.public_token
                    else None
                ),
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
            public_token=raw_token if role == "viewer" else None,
            token_prefix=make_token_prefix(raw_token),
            is_active=True,
            rotated_at=now,
        )
        db.add(share_link)
    else:
        share_link.token_hash = hash_token(raw_token)
        share_link.public_token = raw_token if role == "viewer" else None
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
    if role == "viewer":
        share_link.public_token = None

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


async def get_participants(
    db: AsyncSession,
    roadmap_id: str,
    current_participant: Participant,
) -> list[ParticipantResponse]:
    await _fetch_active_roadmap(db, roadmap_id)

    result = await db.execute(
        select(Participant, ShareLink)
        .outerjoin(ShareLink, Participant.share_link_id == ShareLink.id)
        .where(Participant.roadmap_id == roadmap_id)
        .order_by(Participant.created_at.asc())
    )
    responses: list[ParticipantResponse] = []
    for participant, share_link in result.all():
        joined_via_role = share_link.role if share_link else None
        responses.append(ParticipantResponse(
            id=participant.id,
            display_name=participant.display_name,
            role=participant.role,  # type: ignore[arg-type]
            created_at=participant.created_at,
            last_seen_at=participant.last_seen_at,
            session_expires_at=participant.session_expires_at,
            revoked_at=participant.revoked_at,
            is_current_participant=participant.id == current_participant.id,
            share_link_id=participant.share_link_id,
            joined_via_role=joined_via_role,  # type: ignore[arg-type]
            access_source_label=_ROLE_LABELS.get(joined_via_role, "Legacy / unknown link"),
        ))
    return responses


async def revoke_participant(
    db: AsyncSession,
    roadmap_id: str,
    participant_id: str,
    actor: Participant,
) -> None:
    await _fetch_active_roadmap(db, roadmap_id)

    if participant_id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot revoke your own owner session")

    result = await db.execute(
        select(Participant).where(
            Participant.roadmap_id == roadmap_id,
            Participant.id == participant_id,
            Participant.revoked_at.is_(None),
        )
    )
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="Participant not found")

    now = datetime.now(timezone.utc)
    target.revoked_at = now

    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=actor.id,
        actor_name=actor.display_name,
        action="participant.revoked",
        entity_type="participant",
        entity_id=target.id,
        metadata_json={"display_name": target.display_name, "role": target.role},
    ))

    await db.commit()

    await event_bus.publish(Event(
        roadmap_id=roadmap_id,
        action="participant.revoked",
        payload={
            "roadmap_id": roadmap_id,
            "participant_id": target.id,
            "revoked_at": now.isoformat(),
        }
    ))


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


async def join_roadmap(
    db: AsyncSession,
    payload: JoinRoadmapRequest,
    client_ip: str,
) -> JoinRoadmapResponse:
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

    rate_limiter.enforce("join.share_link", share_link.id, limit=30, window_seconds=600)

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
            rate_limiter.enforce(
                "join.password_failure.ip_share",
                f"{client_ip}:{share_link.id}",
                limit=5,
                window_seconds=600,
            )
            rate_limiter.enforce(
                "join.password_failure.share",
                share_link.id,
                limit=30,
                window_seconds=3600,
            )
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
        share_link_id=share_link.id,
        session_token_hash=hash_token(session_token),
        session_expires_at=_session_expires_at(now),
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
