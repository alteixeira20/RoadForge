"""
Request body size guard.

Checks the Content-Length header and rejects requests that declare a body
larger than REQUEST_BODY_MAX_BYTES with HTTP 413.

MVP note: this guard covers well-behaved clients and common attack tools.
Production deployments should also enforce body size limits at the reverse
proxy (nginx, Caddy, etc.) before traffic reaches the application server.

Limitation: if the client omits Content-Length (e.g. chunked encoding), this
middleware cannot enforce the limit without consuming the body stream, which
would conflict with FastAPI's own body parsing. Omitting Content-Length is
unusual for JSON API clients; the reverse proxy should handle that case.
"""

from fastapi import FastAPI
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from api.schemas.limits import REQUEST_BODY_MAX_BYTES

_TOO_LARGE = JSONResponse({"detail": "Request body too large"}, status_code=413)
_INVALID_LENGTH = JSONResponse({"detail": "Invalid Content-Length header"}, status_code=400)


def _declared_body_size(scope: Scope) -> int | None:
    raw = dict(scope.get("headers", [])).get(b"content-length")
    if raw is None:
        return None
    try:
        size = int(raw)
    except (TypeError, ValueError):
        return -1
    return size if size >= 0 else -1


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int = REQUEST_BODY_MAX_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            declared_size = _declared_body_size(scope)
            if declared_size == -1:
                await _INVALID_LENGTH(scope, receive, send)
                return
            if declared_size is not None and declared_size > self.max_bytes:
                await _TOO_LARGE(scope, receive, send)
                return
        await self.app(scope, receive, send)


def add_body_limit(app: FastAPI) -> None:
    app.add_middleware(BodyLimitMiddleware, max_bytes=REQUEST_BODY_MAX_BYTES)
