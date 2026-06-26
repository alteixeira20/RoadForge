"""Share-link management and participant administration.

Extracted from roadmap_service.py (Slice 2).
"""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, ShareLink
from api.schemas.roadmap import ParticipantResponse, ShareLinkResponse, ShareRole
from api.services.id_service import generate_id
from api.services.token_service import generate_token, hash_token
from api.services.token_service import token_prefix as make_token_prefix

# ---------------------------------------------------------------------------
# Constants (moved from roadmap_service.py)
# ---------------------------------------------------------------------------

_SHARE_PREFIXES: dict[str, str] = {
    "owner": "ow_",
    "editor": "ed_",
    "viewer": "vi_",
}

_ROLE_ORDER: dict[str, int] = {"owner": 0, "editor": 1, "viewer": 2}

_ROLE_LABELS: dict[str, str] = {
    "owner": "Owner link",
    "editor": "Editor link",
    "viewer": "Viewer link",
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _fetch_active_roadmap_for_sharing(
    db: AsyncSession, roadmap_id: str
) -> None:
    """Verify a non-deleted roadmap exists (lightweight check)."""
    from api.models.roadmap import Roadmap

    exists = await db.execute(
        select(Roadmap.id).where(
            Roadmap.id == roadmap_id, Roadmap.deleted_at.is_(None)
        )
    )
    if exists.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")


# ---------------------------------------------------------------------------
# Public API (routers call these directly)
# ---------------------------------------------------------------------------

async def get_share_links(
    db: AsyncSession,
    roadmap_id: str,
    web_base_url: str,
) -> list[ShareLinkResponse]:
    await _fetch_active_roadmap_for_sharing(db, roadmap_id)

    result = await db.execute(
        select(ShareLink).where(ShareLink.roadmap_id == roadmap_id)
    )
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
    await _fetch_active_roadmap_for_sharing(db, roadmap_id)

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

    db.add(
        ActivityLog(
            id=generate_id("al_"),
            roadmap_id=roadmap_id,
            participant_id=participant.id if participant else None,
            actor_name=participant.display_name if participant else None,
            action="share_link.rotated",
            entity_type="share_link",
            entity_id=share_link.id,
            metadata_json={"role": role},
        )
    )

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
    await _fetch_active_roadmap_for_sharing(db, roadmap_id)

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

    db.add(
        ActivityLog(
            id=generate_id("al_"),
            roadmap_id=roadmap_id,
            participant_id=participant.id if participant else None,
            actor_name=participant.display_name if participant else None,
            action="share_link.revoked",
            entity_type="share_link",
            entity_id=share_link.id,
            metadata_json={"role": role},
        )
    )

    await db.commit()


async def get_participants(
    db: AsyncSession,
    roadmap_id: str,
    current_participant: Participant,
) -> list[ParticipantResponse]:
    await _fetch_active_roadmap_for_sharing(db, roadmap_id)

    result = await db.execute(
        select(Participant, ShareLink)
        .outerjoin(ShareLink, Participant.share_link_id == ShareLink.id)
        .where(Participant.roadmap_id == roadmap_id)
        .order_by(Participant.created_at.asc())
    )
    responses: list[ParticipantResponse] = []
    for participant, share_link in result.all():
        joined_via_role = share_link.role if share_link else None
        responses.append(
            ParticipantResponse(
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
                access_source_label=_ROLE_LABELS.get(
                    joined_via_role, "Legacy / unknown link"
                ),
            )
        )
    return responses


async def revoke_participant(
    db: AsyncSession,
    roadmap_id: str,
    participant_id: str,
    actor: Participant,
) -> None:
    await _fetch_active_roadmap_for_sharing(db, roadmap_id)

    if participant_id == actor.id:
        raise HTTPException(
            status_code=400, detail="Cannot revoke your own owner session"
        )

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

    db.add(
        ActivityLog(
            id=generate_id("al_"),
            roadmap_id=roadmap_id,
            participant_id=actor.id,
            actor_name=actor.display_name,
            action="participant.revoked",
            entity_type="participant",
            entity_id=target.id,
        )
    )

    await db.commit()
