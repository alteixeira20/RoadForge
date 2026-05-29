from __future__ import annotations

from fastapi import FastAPI
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from api.config import get_settings

_SENSITIVE_ROADMAP_METHODS = {"GET", "POST", "PUT", "DELETE"}


def _is_sensitive_api_response(scope: Scope) -> bool:
    if scope.get("type") != "http":
        return False
    path = str(scope.get("path") or "")
    method = str(scope.get("method") or "")
    if path.endswith("/events"):
        return False
    return path.startswith("/api/roadmaps") and method in _SENSITIVE_ROADMAP_METHODS


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._is_production = get_settings().is_production

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-content-type-options", b"nosniff"))
                headers.append((b"referrer-policy", b"no-referrer"))
                headers.append((b"x-frame-options", b"DENY"))
                headers.append((
                    b"permissions-policy",
                    b"accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
                    b"magnetometer=(), microphone=(), payment=(), usb=()",
                ))
                if self._is_production:
                    headers.append((
                        b"strict-transport-security",
                        b"max-age=31536000; includeSubDomains",
                    ))
                if _is_sensitive_api_response(scope):
                    headers.append((b"cache-control", b"no-store"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)


def add_security_headers(app: FastAPI) -> None:
    app.add_middleware(SecurityHeadersMiddleware)
