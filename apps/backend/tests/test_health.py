import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import api.routers.health as health_module


async def test_liveness_does_not_probe_external_dependencies(client, monkeypatch):
    database_check = AsyncMock(side_effect=AssertionError("liveness touched database"))
    monkeypatch.setattr(health_module, "_database_is_ready", database_check)

    response = await client.get("/api/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    database_check.assert_not_awaited()


async def test_readiness_and_legacy_health_alias_probe_database(client, monkeypatch):
    database_check = AsyncMock(return_value=True)
    monkeypatch.setattr(health_module, "_database_is_ready", database_check)

    ready = await client.get("/api/health/ready")
    legacy = await client.get("/api/health")

    assert ready.status_code == 200
    assert legacy.status_code == 200
    assert ready.json() == legacy.json()
    assert database_check.await_count == 2


async def test_readiness_fails_closed_when_database_is_unavailable(client, monkeypatch):
    monkeypatch.setattr(
        health_module,
        "_database_is_ready",
        AsyncMock(return_value=False),
    )

    response = await client.get("/api/health/ready")

    assert response.status_code == 503
    assert response.json() == {"detail": "Service dependencies are unavailable"}


async def test_redis_deployment_requires_both_database_and_redis(client, monkeypatch):
    monkeypatch.setattr(
        health_module,
        "get_settings",
        lambda: SimpleNamespace(
            app_version="0.1.0",
            realtime_backend="redis",
            redis_url="redis://redis.test:6379/0",
            redis_connect_timeout_seconds=0.1,
            redis_socket_timeout_seconds=0.1,
        ),
    )
    monkeypatch.setattr(
        health_module,
        "_database_is_ready",
        AsyncMock(return_value=True),
    )
    redis_check = AsyncMock(return_value=False)
    monkeypatch.setattr(health_module, "_redis_is_ready", redis_check)

    response = await client.get("/api/health/ready")

    assert response.status_code == 503
    redis_check.assert_awaited_once_with("redis://redis.test:6379/0")


@pytest.mark.skipif(
    not os.getenv("REAL_REDIS_TEST_URL"),
    reason="REAL_REDIS_TEST_URL is required for the integration probe",
)
async def test_redis_readiness_probe_against_real_server():
    assert await health_module._redis_is_ready(os.environ["REAL_REDIS_TEST_URL"])
