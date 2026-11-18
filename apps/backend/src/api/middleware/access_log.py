from __future__ import annotations

import logging

from fastapi import FastAPI
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("uvicorn.error")


class SafeAccessLogMiddleware:
    """Log HTTP method, path, and status without query strings or headers."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        logging.getLogger("uvicorn.access").disabled = True

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        client = scope.get("client")
        client_host = client[0] if client else "-"

        async def send_with_log(message: Message) -> None:
            if message["type"] == "http.response.start":
                logger.info(
                    "access client=%s method=%s path=%s status=%s",
                    client_host,
                    scope.get("method", ""),
                    scope.get("path", ""),
                    message["status"],
                )
            await send(message)

        await self.app(scope, receive, send_with_log)


def add_safe_access_log(app: FastAPI) -> None:
    app.add_middleware(SafeAccessLogMiddleware)
