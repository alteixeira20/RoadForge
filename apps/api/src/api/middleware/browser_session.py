from __future__ import annotations

import re

from fastapi import FastAPI
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from api.config import get_settings
from api.services.browser_session import BROWSER_SESSION_COOKIE_NAME

_ROADMAP_PATH = re.compile(r"^/api/roadmaps/([^/]+)(?:/|$)")
_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class BrowserSessionAuthMiddleware:
    """Translate path-scoped HttpOnly browser sessions into internal Bearer auth.

    Explicit Authorization headers win so API and MCP clients keep the existing
    Bearer-token contract. Cookie-authenticated writes additionally require an
    explicitly configured frontend Origin to prevent ambient-cookie CSRF.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._allowed_origins = {
            origin.rstrip("/") for origin in get_settings().cors_origins
        }

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        path = str(scope.get("path") or "")
        match = _ROADMAP_PATH.match(path)
        if match is None or match.group(1) == "join":
            await self.app(scope, receive, send)
            return

        headers = list(scope.get("headers", []))
        if any(name.lower() == b"authorization" for name, _ in headers):
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        token = request.cookies.get(BROWSER_SESSION_COOKIE_NAME)
        if not token:
            await self.app(scope, receive, send)
            return

        method = str(scope.get("method") or "GET").upper()
        if method in _UNSAFE_METHODS:
            origin = request.headers.get("origin", "").rstrip("/")
            if not origin or origin not in self._allowed_origins:
                response = JSONResponse(
                    status_code=403,
                    content={"detail": "Invalid request origin"},
                )
                await response(scope, receive, send)
                return

        next_scope = dict(scope)
        next_scope["headers"] = headers + [
            (b"authorization", f"Bearer {token}".encode("latin-1"))
        ]
        await self.app(next_scope, receive, send)


def add_browser_session_auth(app: FastAPI) -> None:
    app.add_middleware(BrowserSessionAuthMiddleware)
