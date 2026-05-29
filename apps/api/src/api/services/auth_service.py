from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import Participant, Roadmap
from api.services.token_service import hash_token

_SESSION_LIFETIME_DAYS = 30
_PARTICIPANT_TOUCH_INTERVAL = timedelta(minutes=1)


def get_bearer_token(authorization: str | None) -> str | None:
    """Extract the raw token from an 'Authorization: Bearer <token>' header."""
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1] or None


def _ensure_aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _session_expires_at(now: datetime) -> datetime:
    return now + timedelta(days=_SESSION_LIFETIME_DAYS)


def _should_touch_participant(participant: Participant, now: datetime) -> bool:
    if participant.last_seen_at is None:
        return True
    last_seen_at = _ensure_aware_utc(participant.last_seen_at)
    return last_seen_at <= now - _PARTICIPANT_TOUCH_INTERVAL


async def require_participant(
    db: AsyncSession,
    roadmap_id: str,
    authorization: str | None,
    allowed_roles: set[str],
) -> Participant:
    """Resolve the session participant and assert role authorization.

    Raises 401 if the token is missing or unrecognized.
    Raises 403 if the participant's role is not in allowed_roles.
    """
    raw_token = get_bearer_token(authorization)
    if not raw_token:
        raise HTTPException(status_code=401, detail="Missing or invalid session token")

    result = await db.execute(
        select(Participant, Roadmap)
        .join(Roadmap, Participant.roadmap_id == Roadmap.id)
        .where(
            Participant.roadmap_id == roadmap_id,
            Participant.session_token_hash == hash_token(raw_token),
        )
    )
    row = result.one_or_none()

    if row is None:
        raise HTTPException(status_code=401, detail="Missing or invalid session token")
    participant, roadmap = row

    if participant.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Session revoked")

    if roadmap.deleted_at is not None:
        raise HTTPException(status_code=401, detail="Missing or invalid session token")

    now = datetime.now(timezone.utc)
    if participant.session_expires_at is not None:
        expires_at = _ensure_aware_utc(participant.session_expires_at)
        if expires_at <= now:
            raise HTTPException(status_code=401, detail="Session expired")

    if participant.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if _should_touch_participant(participant, now):
        participant.last_seen_at = now
        participant.session_expires_at = _session_expires_at(now)
        await db.flush()
        await db.commit()

    return participant
