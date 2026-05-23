from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models.roadmap import Participant
from api.services.token_service import hash_token


def get_bearer_token(authorization: str | None) -> str | None:
    """Extract the raw token from an 'Authorization: Bearer <token>' header."""
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1] or None


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
        select(Participant).where(
            Participant.roadmap_id == roadmap_id,
            Participant.session_token_hash == hash_token(raw_token),
            Participant.revoked_at.is_(None),
        )
    )
    participant = result.scalar_one_or_none()

    if participant is None:
        raise HTTPException(status_code=401, detail="Missing or invalid session token")

    if participant.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    participant.last_seen_at = datetime.now(timezone.utc)
    await db.flush()

    return participant
