from __future__ import annotations

from starlette.types import Message, Receive, Scope, Send

from api.middleware.body_limit import BodyLimitMiddleware, _declared_body_size

_MAX_BYTES = 20


def _scope(content_length: bytes | None) -> Scope:
    headers = [] if content_length is None else [(b"content-length", content_length)]
    return {"type": "http", "headers": headers}  # type: ignore[typeddict-item]


def test_declared_body_size_returns_none_without_header():
    assert _declared_body_size(_scope(None)) is None


def test_declared_body_size_parses_non_negative_integer():
    assert _declared_body_size(_scope(b"512")) == 512


def test_declared_body_size_rejects_malformed_value():
    assert _declared_body_size(_scope(b"not-a-number")) == -1


def test_declared_body_size_rejects_negative_value():
    assert _declared_body_size(_scope(b"-1")) == -1


async def _echo_app(scope: Scope, receive: Receive, send: Send) -> None:
    """Minimal downstream ASGI app: reads the full body, then replies 200."""
    while True:
        message = await receive()
        if message["type"] == "http.request" and not message.get("more_body", False):
            break
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok"})


def _make_receive(messages: list[Message]) -> Receive:
    queue = list(messages)

    async def receive() -> Message:
        if queue:
            return queue.pop(0)
        return {"type": "http.disconnect"}

    return receive


def _make_send() -> tuple[Send, list[Message]]:
    sent: list[Message] = []

    async def send(message: Message) -> None:
        sent.append(message)

    return send, sent


def _response_status(sent: list[Message]) -> int:
    start = next(m for m in sent if m["type"] == "http.response.start")
    return start["status"]


async def test_middleware_rejects_oversized_declared_content_length():
    middleware = BodyLimitMiddleware(_echo_app, max_bytes=_MAX_BYTES)
    scope = _scope(str(_MAX_BYTES + 1).encode())
    scope["method"] = "POST"
    send, sent = _make_send()

    await middleware(scope, _make_receive([]), send)

    assert _response_status(sent) == 413


async def test_middleware_rejects_malformed_content_length():
    middleware = BodyLimitMiddleware(_echo_app, max_bytes=_MAX_BYTES)
    scope = _scope(b"not-a-number")
    scope["method"] = "POST"
    send, sent = _make_send()

    await middleware(scope, _make_receive([]), send)

    assert _response_status(sent) == 400


async def test_middleware_rejects_oversized_streamed_body_without_content_length():
    middleware = BodyLimitMiddleware(_echo_app, max_bytes=_MAX_BYTES)
    scope = _scope(None)
    scope["method"] = "POST"
    send, sent = _make_send()
    # Three chunks of 8 bytes each (24 total) exceed the 20 byte limit,
    # simulating a chunked-transfer body delivered across multiple messages.
    messages: list[Message] = [
        {"type": "http.request", "body": b"12345678", "more_body": True},
        {"type": "http.request", "body": b"12345678", "more_body": True},
        {"type": "http.request", "body": b"12345678", "more_body": False},
    ]

    await middleware(scope, _make_receive(messages), send)

    assert _response_status(sent) == 413


async def test_middleware_rejects_actual_body_exceeding_declared_content_length():
    middleware = BodyLimitMiddleware(_echo_app, max_bytes=_MAX_BYTES)
    # Declares 5 bytes (under the limit) but actually streams 24 bytes,
    # simulating a client that lies about Content-Length.
    scope = _scope(b"5")
    scope["method"] = "POST"
    send, sent = _make_send()
    messages: list[Message] = [
        {"type": "http.request", "body": b"12345678", "more_body": True},
        {"type": "http.request", "body": b"12345678", "more_body": True},
        {"type": "http.request", "body": b"12345678", "more_body": False},
    ]

    await middleware(scope, _make_receive(messages), send)

    assert _response_status(sent) == 413


async def test_middleware_allows_streamed_body_under_limit():
    middleware = BodyLimitMiddleware(_echo_app, max_bytes=_MAX_BYTES)
    scope = _scope(None)
    scope["method"] = "POST"
    send, sent = _make_send()
    messages: list[Message] = [
        {"type": "http.request", "body": b"12345", "more_body": True},
        {"type": "http.request", "body": b"12345", "more_body": False},
    ]

    await middleware(scope, _make_receive(messages), send)

    assert _response_status(sent) == 200
