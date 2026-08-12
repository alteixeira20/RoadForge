from __future__ import annotations

import pytest
from httpx import AsyncClient
from redis.exceptions import RedisError

from api.services.rate_limit_service import RedisRateLimiter
from tests.conftest import create_roadmap

pytestmark = pytest.mark.asyncio

_ALLOWED_ORIGIN = "http://localhost:3020"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_bearer_session_exchanges_for_path_scoped_http_only_cookie(
    client: AsyncClient,
):
    body = await create_roadmap(client, name="Cookie roadmap")
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    exchanged = await client.post(
        f"/api/roadmaps/{roadmap_id}/session/cookie",
        headers=_auth(owner_token),
    )
    assert exchanged.status_code == 204, exchanged.text
    cookie = exchanged.headers.get("set-cookie", "")
    assert "roadforge_session=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    assert f"Path=/api/roadmaps/{roadmap_id}" in cookie
    assert exchanged.headers["cache-control"] == "no-store"

    # No Authorization header: the path-scoped cookie authenticates the read.
    read = await client.get(f"/api/roadmaps/{roadmap_id}")
    assert read.status_code == 200, read.text


async def test_cookie_authenticated_write_requires_allowed_origin(client: AsyncClient):
    body = await create_roadmap(client, name="CSRF protected")
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    exchanged = await client.post(
        f"/api/roadmaps/{roadmap_id}/session/cookie",
        headers=_auth(owner_token),
    )
    assert exchanged.status_code == 204, exchanged.text

    rejected = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        json={"name": "Rejected", "last_updated_at": body["updated_at"]},
    )
    assert rejected.status_code == 403
    assert rejected.json()["detail"] == "Invalid request origin"

    accepted = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers={"Origin": _ALLOWED_ORIGIN},
        json={"name": "Accepted", "last_updated_at": body["updated_at"]},
    )
    assert accepted.status_code == 200, accepted.text


async def test_explicit_bearer_clients_keep_existing_non_browser_contract(
    client: AsyncClient,
):
    body = await create_roadmap(client, name="API client")
    roadmap_id = body["id"]
    owner_token = body["owner_session_token"]

    # Explicit Bearer auth is not ambient browser-cookie authentication and does
    # not require an Origin header.
    updated = await client.put(
        f"/api/roadmaps/{roadmap_id}",
        headers=_auth(owner_token),
        json={"name": "API client updated", "last_updated_at": body["updated_at"]},
    )
    assert updated.status_code == 200, updated.text


async def test_cookie_is_scoped_to_its_roadmap(client: AsyncClient):
    first = await create_roadmap(client, name="First")
    second = await create_roadmap(client, name="Second")

    exchanged = await client.post(
        f"/api/roadmaps/{first['id']}/session/cookie",
        headers=_auth(first["owner_session_token"]),
    )
    assert exchanged.status_code == 204

    first_read = await client.get(f"/api/roadmaps/{first['id']}")
    assert first_read.status_code == 200

    second_read = await client.get(f"/api/roadmaps/{second['id']}")
    assert second_read.status_code == 401


async def test_redis_rate_limiter_fails_closed(monkeypatch):
    limiter = RedisRateLimiter(
        redis_url="redis://localhost:6379/0",
        key_prefix="test",
        connect_timeout_seconds=0.1,
        socket_timeout_seconds=0.1,
    )

    async def broken_eval(*args, **kwargs):
        raise RedisError("down")

    monkeypatch.setattr(limiter._redis, "eval", broken_eval)

    with pytest.raises(Exception) as exc_info:
        await limiter.check("join.ip", "127.0.0.1", 20, 60)
    exc = exc_info.value
    assert getattr(exc, "status_code", None) == 503
    assert getattr(exc, "detail", None) == "Rate limiter temporarily unavailable"
    assert getattr(exc, "headers", None) == {"Retry-After": "1"}
