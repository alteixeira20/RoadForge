from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink
from api.schemas.roadmap import (
    CreateRoadmapRequest,
    CreateRoadmapResponse,
    PhaseDTO,
    RoadmapResponse,
    ShareLinkResponse,
)
from api.services.id_service import generate_id
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
    db.add(ActivityLog(
        id=generate_id("al_"),
        roadmap_id=roadmap_id,
        participant_id=participant.id,
        actor_name=payload.owner_display_name,
        action="roadmap.created",
        entity_type="roadmap",
        entity_id=roadmap_id,
        after_json={"name": payload.name},
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
        created_at=roadmap.created_at,
        updated_at=roadmap.updated_at,
        share_links=share_links_out,
        owner_session_token=owner_session_token,
    )


_ROLE_ORDER: dict[str, int] = {"owner": 0, "editor": 1, "viewer": 2}


async def get_roadmap(db: AsyncSession, roadmap_id: str) -> RoadmapResponse:
    result = await db.execute(
        select(Roadmap).where(Roadmap.id == roadmap_id, Roadmap.deleted_at.is_(None))
    )
    roadmap = result.scalar_one_or_none()
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    phases = [PhaseDTO(**p) for p in roadmap.snapshot_json.get("phases", [])]
    return RoadmapResponse(
        id=roadmap.id,
        name=roadmap.name,
        owner_display_name=roadmap.owner_display_name,
        schema_version=roadmap.schema_version,
        phases=phases,
        created_at=roadmap.created_at,
        updated_at=roadmap.updated_at,
    )


async def get_share_links(db: AsyncSession, roadmap_id: str) -> list[ShareLinkResponse]:
    exists = await db.execute(
        select(Roadmap.id).where(Roadmap.id == roadmap_id, Roadmap.deleted_at.is_(None))
    )
    if exists.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    result = await db.execute(
        select(ShareLink).where(
            ShareLink.roadmap_id == roadmap_id,
            ShareLink.is_active.is_(True),
        )
    )
    links = sorted(result.scalars().all(), key=lambda sl: _ROLE_ORDER.get(sl.role, 99))
    return [
        ShareLinkResponse(
            id=sl.id,
            role=sl.role,  # type: ignore[arg-type]
            token_prefix=sl.token_prefix,
            url=None,
            is_active=sl.is_active,
            created_at=sl.created_at,
            rotated_at=sl.rotated_at,
        )
        for sl in links
    ]
