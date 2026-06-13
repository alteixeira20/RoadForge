from __future__ import annotations

from starlette.types import Scope

from api.middleware.body_limit import _declared_body_size


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
