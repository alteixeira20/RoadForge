from __future__ import annotations

from fastapi import Request, Response

from api.config import get_settings
from api.services.session_policy import SESSION_LIFETIME_DAYS

BROWSER_SESSION_COOKIE_NAME = "roadforge_session"
BROWSER_SESSION_MODE_HEADER = "x-roadforge-session-mode"
BROWSER_SESSION_MODE_COOKIE = "cookie"
BROWSER_SESSION_MAX_AGE_SECONDS = SESSION_LIFETIME_DAYS * 24 * 60 * 60


def browser_session_cookie_path(roadmap_id: str) -> str:
    return f"/api/roadmaps/{roadmap_id}"


def wants_browser_session(request: Request) -> bool:
    return (
        request.headers.get(BROWSER_SESSION_MODE_HEADER, "").lower()
        == BROWSER_SESSION_MODE_COOKIE
    )


def set_browser_session_cookie(
    response: Response, roadmap_id: str, raw_token: str
) -> None:
    response.set_cookie(
        BROWSER_SESSION_COOKIE_NAME,
        raw_token,
        max_age=BROWSER_SESSION_MAX_AGE_SECONDS,
        path=browser_session_cookie_path(roadmap_id),
        secure=get_settings().is_production_like,
        httponly=True,
        samesite="strict",
    )
