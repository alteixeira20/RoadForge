"""
Join / session entry-point for a roadmap via a share-link invite token.

This module handles the full join flow:
- Validating the invite token against the ShareLink table
- Enforcing rate limits per share link
- Password verification when the roadmap is password-protected
- Creating a Participant row with a session token
"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import ActivityLog, Participant, Roadmap, ShareLink
from api.schemas.roadmap import JoinRoadmapRequest, JoinRoadmapResponse
from api.services.id_service import generate_id
from api.services.password_service import verify_password
from api.services.rate_limit_service import rate_limiter
from api.services.session_policy import session_expires_at
from api.services.token_service import generate_token, hash_token

logger = logging.getLogger(__name__)


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

    await rate_limiter.enforce("join.share_link", share_link.id, limit=30, window_seconds=600)

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
            await rate_limiter.enforce(
                "join.password_failure.ip_share",
                f"{client_ip}:{share_link.id}",
                limit=5,
                window_seconds=600,
            )
            await rate_limiter.enforce(
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
        session_expires_at=session_expires_at(now),
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
