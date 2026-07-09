"""
Request body size guard.

Checks the Content-Length header and rejects requests that declare a body
larger than REQUEST_BODY_MAX_BYTES with HTTP 413.

MVP note: this guard covers well-behaved clients and common attack tools.
Production deployments should also enforce body size limits at the reverse
proxy (nginx, Caddy, etc.) before traffic reaches the application server.

Streaming bodies: if the client omits Content-Length (e.g. chunked encoding),
this middleware wraps the ASGI `receive` callable and tallies the cumulative
byte count of each `http.request` message as the application consumes it,
aborting with HTTP 413 as soon as the running total exceeds
REQUEST_BODY_MAX_BYTES. This never buffers the full body in memory. The
reverse proxy remains useful as defense-in-depth but is no longer the only
enforcement point.
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


class _BodyTooLarge(Exception):
    """Internal sentinel: raised when a streamed (no Content-Length) body
    exceeds max_bytes. Never leaked outside this module."""


def _wrap_receive_with_limit(receive: Receive, max_bytes: int) -> Receive:
    """Wrap `receive` to tally cumulative body bytes across messages and
    raise `_BodyTooLarge` once the running total exceeds max_bytes, without
    buffering the body itself."""
    total = 0

    async def _limited_receive() -> dict:
        nonlocal total
        message = await receive()
        if message["type"] == "http.request":
            total += len(message.get("body", b""))
            if total > max_bytes:
                raise _BodyTooLarge
        return message

    return _limited_receive


def _wrap_send_tracking_start(send: Send, started: list[bool]) -> Send:
    """Wrap `send` to flag once the response has started, so an abort after
    that point can propagate instead of sending a second response."""

    async def _tracking_send(message: dict) -> None:
        if message["type"] == "http.response.start":
            started[0] = True
        await send(message)

    return _tracking_send


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
            if declared_size is not None:
                if declared_size > self.max_bytes:
                    await _TOO_LARGE(scope, receive, send)
                    return
            else:
                await self._call_with_streaming_limit(scope, receive, send)
                return
        await self.app(scope, receive, send)

    async def _call_with_streaming_limit(self, scope: Scope, receive: Receive, send: Send) -> None:
        started = [False]
        wrapped_receive = _wrap_receive_with_limit(receive, self.max_bytes)
        wrapped_send = _wrap_send_tracking_start(send, started)
        try:
            await self.app(scope, wrapped_receive, wrapped_send)
        except _BodyTooLarge:
            if started[0]:
                raise
            await _TOO_LARGE(scope, receive, send)


def add_body_limit(app: FastAPI) -> None:
    app.add_middleware(BodyLimitMiddleware, max_bytes=REQUEST_BODY_MAX_BYTES)
