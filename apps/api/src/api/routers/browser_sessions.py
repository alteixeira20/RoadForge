from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import get_db
from api.services.auth_service import get_bearer_token, require_participant
from api.services.browser_session import set_browser_session_cookie

router = APIRouter()


@router.post("/{roadmap_id}/session/cookie", status_code=status.HTTP_204_NO_CONTENT)
async def establish_browser_session(
    roadmap_id: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> Response:
    """Exchange a valid roadmap Bearer session for a path-scoped HttpOnly cookie.

    This is primarily a migration/bootstrap bridge for the browser UI. API/MCP
    clients may continue using Bearer sessions directly.
    """
    await require_participant(
        db,
        roadmap_id,
        authorization,
        {"owner", "editor", "viewer"},
    )
    raw_token = get_bearer_token(authorization)
    if not raw_token:
        raise HTTPException(status_code=401, detail="Missing or invalid session token")

    set_browser_session_cookie(response, roadmap_id, raw_token)
    response.status_code = status.HTTP_204_NO_CONTENT
    response.headers["Cache-Control"] = "no-store"
    return response
