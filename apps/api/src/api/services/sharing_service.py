"""Share-link management and participant administration.

Extracted from roadmap_service.py (Slice 2).
"""

import logging
from datetime import datetime, timezone
from typing import AsyncContextManager, Callable

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, ShareLink
from api.schemas.roadmap import (
    ParticipantResponse,
    ParticipantSummaryResponse,
    ShareLinkResponse,
    ShareRole,
)
from api.services.auth_service import is_participant_revoked
from api.services.event_bus import (
    Event,
    RevocationMark,
    RevocationRegistryUnavailableError,
    event_bus,
)
from api.services.id_service import generate_id
from api.services.token_service import generate_token, hash_token
from api.services.token_service import token_prefix as make_token_prefix

logger = logging.getLogger(__name__)

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
                # Raw invite material is reveal-once on create/rotation.
                # Listing an active link never reconstructs a bearer credential.
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
        url=f"{web_base_url}/join#token={raw_token}",
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


async def get_participants_summary(
    db: AsyncSession,
    roadmap_id: str,
    current_participant: Participant,
) -> list[ParticipantSummaryResponse]:
    """Reduced participant projection for editors — active participants only.

    Excludes timestamps, share-link linkage, and access labels that owners
    see in the full listing. Used to feed assignee suggestions without
    exposing session/link metadata to non-owners.
    """
    await _fetch_active_roadmap_for_sharing(db, roadmap_id)

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Participant)
        .where(
            Participant.roadmap_id == roadmap_id,
            Participant.revoked_at.is_(None),
            or_(
                Participant.session_expires_at.is_(None),
                Participant.session_expires_at > now,
            ),
        )
        .order_by(Participant.created_at.asc())
    )
    return [
        ParticipantSummaryResponse(
            id=participant.id,
            display_name=participant.display_name,
            role=participant.role,  # type: ignore[arg-type]
            is_current_participant=participant.id == current_participant.id,
        )
        for participant in result.scalars().all()
    ]


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

    await _commit_revocation(db, roadmap_id, target.id, now)


async def _log_failure(coro, message: str) -> None:
    """Await `coro`, logging (not raising) on failure — for steps that must
    never abort an already-authoritative revocation."""
    try:
        await coro
    except Exception:
        logger.exception(message)


async def _commit_revocation(
    db: AsyncSession, roadmap_id: str, participant_id: str, revoked_at: datetime
) -> None:
    """
    Marks the fast-path revocation registry `PENDING`, commits the database
    revocation, promotes the mark to `COMMITTED`, and publishes the
    `participant.revoked` control event, in that order.

    The `PENDING` mark happens *before* `db.commit()`. A stream reading a
    `PENDING` mark cannot tell an in-flight revocation from one abandoned by
    a crash before this function reached the promote step below, so it
    always falls back to a PostgreSQL check - see
    `resolve_realtime_revocation`. That fallback is what actually closes
    the gap: once the commit below is authoritative, a `PENDING` reader
    resolves to "revoked" from PostgreSQL even if this process crashes
    before promoting the mark to `COMMITTED`.

    If the `PENDING` mark itself fails to write, the whole revocation
    aborts - proceeding without it would report a false success while
    leaving an already-open stream free to keep delivering events until the
    next bounded `is_still_authorized` recheck, which defeats the
    "immediate" cutoff guarantee. The pending database changes are rolled
    back so no partial write survives, and `RevocationRegistryUnavailableError`
    propagates so the caller can report a retryable failure. If the commit
    itself fails, the mark is cleared so it doesn't outlive the (rolled
    back) database state - reconciliation would otherwise treat the
    abandoned `PENDING` mark correctly anyway, but clearing it eagerly
    avoids depending on that fallback for an operation known to have failed.
    Promotion to `COMMITTED` and the final control-event publish are both
    best-effort: the `PENDING` mark plus the PostgreSQL fallback already
    guarantee a revoked participant stops receiving normal events even if
    either one never arrives - they just won't get the fast, no-database
    suppression path or the immediate in-band close signal, respectively.
    """
    try:
        await event_bus.revocations.mark_pending(roadmap_id, participant_id)
    except Exception as exc:
        logger.exception("Failed to mark fast-path revocation registry; aborting revocation")
        await db.rollback()
        if isinstance(exc, RevocationRegistryUnavailableError):
            raise
        raise RevocationRegistryUnavailableError(
            "Failed to mark fast-path revocation registry"
        ) from exc

    try:
        await db.commit()
    except Exception:
        await _log_failure(
            event_bus.revocations.clear(roadmap_id, participant_id),
            "Failed to clear fast-path revocation registry mark after commit failure",
        )
        raise

    await _log_failure(
        event_bus.revocations.promote_committed(roadmap_id, participant_id),
        "Failed to promote fast-path revocation registry mark to committed",
    )

    await _log_failure(
        event_bus.publish(Event(
            roadmap_id=roadmap_id,
            action="participant.revoked",
            payload={
                "roadmap_id": roadmap_id,
                "participant_id": participant_id,
                "revoked_at": revoked_at.isoformat(),
            }
        )),
        "Failed to publish participant.revoked control event",
    )


async def resolve_realtime_revocation(
    db_session_factory: Callable[[], AsyncContextManager[AsyncSession]],
    roadmap_id: str,
    participant_id: str,
) -> bool | None:
    """
    Per-event authorization check for `forward_subscription`
    (`is_participant_revoked_now`).

    Only a `COMMITTED` fast-path mark is trusted directly - it is written
    by `_commit_revocation` only after the PostgreSQL commit lands, so it
    can never be stale in the direction that matters (a participant it
    calls revoked really is). Every other mark, including `ACTIVE` (no
    mark at all), falls back to the authoritative PostgreSQL check:
    `ACTIVE` is ambiguous between "never revoked" and "revoked, but the
    registry lost the mark" (e.g. a Redis restart with no persistence), so
    trusting it directly would let a lost mark silently restore visibility
    to a revoked participant. `PENDING` (in-flight or abandoned) and
    `UNKNOWN` (a failed registry read) are equally untrusted on their own.
    A `PENDING` mark is opportunistically reconciled once the PostgreSQL
    fallback resolves it, clearing an abandoned mark or promoting one
    whose commit had already landed.

    Returns `True` (suppress the event), `False` (forward it), or `None`
    when neither the registry nor PostgreSQL can answer - callers must
    treat `None` as fail-closed, never as "not revoked".
    """
    mark = await event_bus.revocations.get_mark(roadmap_id, participant_id)
    if mark is RevocationMark.COMMITTED:
        return True

    try:
        async with db_session_factory() as db:
            revoked = await is_participant_revoked(db, roadmap_id, participant_id)
    except Exception:
        logger.exception(
            "Failed to resolve participant revocation state against PostgreSQL"
        )
        return None

    if revoked:
        if mark is RevocationMark.PENDING:
            await _log_failure(
                event_bus.revocations.promote_committed(roadmap_id, participant_id),
                "Failed to promote fast-path revocation registry mark to committed",
            )
        return True

    if mark is RevocationMark.PENDING:
        await _log_failure(
            event_bus.revocations.clear(roadmap_id, participant_id),
            "Failed to clear abandoned fast-path revocation registry mark",
        )
    return False
