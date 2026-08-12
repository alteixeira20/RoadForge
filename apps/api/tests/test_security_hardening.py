from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest
from redis.exceptions import RedisError

from api.config import Settings, get_settings
from api.main import create_app
from api.services import realtime_startup
from api.services.client_ip_service import extract_client_ip


async def test_health_response_is_minimal_and_has_security_headers(client):
    response = await client.get("/api/health")

    assert response.status_code == 200
    assert set(response.json()) == {"status", "version"}
    assert response.json()["status"] == "ok"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "authorization" not in response.text.lower()
    assert "database" not in response.text.lower()
    assert "redis" not in response.text.lower()


async def test_access_log_excludes_query_credentials(client, caplog):
    credential = "ticket_should_never_be_logged"

    with caplog.at_level(logging.INFO, logger="uvicorn.error"):
        response = await client.get(f"/api/health?ticket={credential}")

    assert response.status_code == 200
    messages = [record.getMessage() for record in caplog.records]
    assert any(
        "method=GET path=/api/health status=200" in message
        for message in messages
    )
    assert all(credential not in message for message in messages)
    assert all("ticket=" not in message for message in messages)


def test_docs_are_disabled_outside_development(monkeypatch):
    monkeypatch.setenv("ROADFORGE_ENVIRONMENT", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@db.example.com/roadforge")
    monkeypatch.setenv("ROADFORGE_CORS_ORIGINS", "https://app.example.com")
    monkeypatch.setenv("ROADFORGE_WEB_BASE_URL", "https://app.example.com")
    get_settings.cache_clear()

    app = create_app()

    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None

    get_settings.cache_clear()


def test_production_rejects_wildcard_cors_with_credentials():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/roadforge",
        cors_origins=["*"],
    )

    with pytest.raises(RuntimeError, match="wildcard"):
        settings.validate_startup_security()


def test_production_rejects_empty_cors_origins():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/roadforge",
        cors_origins=[],
    )

    with pytest.raises(RuntimeError, match="ROADFORGE_CORS_ORIGINS must list"):
        settings.validate_startup_security()


@pytest.mark.parametrize("malformed", ["", "  ", "not-a-url", "https://example.com/path"])
def test_production_rejects_malformed_cors_origin(malformed):
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/roadforge",
        cors_origins=["https://app.example.com", malformed],
    )

    with pytest.raises(RuntimeError):
        settings.validate_startup_security()


def test_production_accepts_explicit_cors_origins():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/roadforge",
        cors_origins=["https://app.example.com", "https://admin.example.com:8443"],
        web_base_url="https://app.example.com",
    )

    settings.validate_startup_security()


async def test_allowed_origin_receives_cors_headers(client):
    response = await client.get(
        "/api/health", headers={"Origin": "http://localhost:3020"}
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3020"
    assert response.headers.get("access-control-allow-credentials") == "true"


async def test_disallowed_origin_receives_no_cors_headers(client):
    response = await client.get(
        "/api/health", headers={"Origin": "https://evil.example.com"}
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_production_rejects_default_database_url():
    settings = Settings(
        environment="production",
        database_url=(
            "postgresql+asyncpg://roadforge:roadforge_dev@localhost:5432/roadforge"
        ),
    )

    with pytest.raises(RuntimeError, match="default local development DATABASE_URL"):
        settings.validate_startup_security()


def test_memory_realtime_rejects_multiple_workers():
    settings = Settings(realtime_backend="memory", api_workers=2)

    with pytest.raises(RuntimeError, match="ROADFORGE_API_WORKERS must be 1"):
        settings.validate_startup_realtime()


def test_application_startup_rejects_multi_worker_memory_mode(monkeypatch):
    monkeypatch.setenv("ROADFORGE_REALTIME_BACKEND", "memory")
    monkeypatch.setenv("ROADFORGE_API_WORKERS", "2")
    get_settings.cache_clear()

    with pytest.raises(RuntimeError, match="ROADFORGE_API_WORKERS must be 1"):
        create_app()

    get_settings.cache_clear()


def test_redis_realtime_requires_url():
    settings = Settings(realtime_backend="redis", redis_url=None)

    with pytest.raises(RuntimeError, match="REDIS_URL is required"):
        settings.validate_startup_realtime()


@pytest.mark.parametrize(
    ("backend", "workers", "redis_url"),
    [
        ("memory", 1, None),
        ("redis", 1, "redis://redis:6379/0"),
        ("redis", 2, "redis://redis:6379/0"),
    ],
)
def test_safe_realtime_worker_configurations_pass(backend, workers, redis_url):
    settings = Settings(
        realtime_backend=backend,
        api_workers=workers,
        redis_url=redis_url,
    )

    settings.validate_startup_realtime()


async def test_redis_realtime_startup_pings_and_closes_client(monkeypatch):
    calls = []

    class FakeRedis:
        async def ping(self):
            calls.append("ping")

        async def aclose(self):
            calls.append("close")

    monkeypatch.setattr(
        realtime_startup.redis.Redis,
        "from_url",
        lambda *args, **kwargs: FakeRedis(),
    )

    await realtime_startup.validate_realtime_connectivity(
        Settings(realtime_backend="redis", redis_url="redis://redis:6379/0")
    )

    assert calls == ["ping", "close"]


async def test_redis_realtime_startup_fails_when_unreachable(monkeypatch):
    class FakeRedis:
        async def ping(self):
            raise RedisError("unreachable")

        async def aclose(self):
            return None

    monkeypatch.setattr(
        realtime_startup.redis.Redis,
        "from_url",
        lambda *args, **kwargs: FakeRedis(),
    )

    with pytest.raises(RuntimeError, match="Redis is unavailable"):
        await realtime_startup.validate_realtime_connectivity(
            Settings(realtime_backend="redis", redis_url="redis://redis:6379/0")
        )


@pytest.mark.parametrize("trusted_proxy", ["0.0.0.0/0", "::/0"])
def test_trusted_proxy_configuration_rejects_wildcard_networks(trusted_proxy):
    with pytest.raises(ValueError, match="cannot trust every address"):
        Settings(trusted_proxy_ips=[trusted_proxy])


def test_extract_client_ip_trusts_forwarded_header_only_from_trusted_proxy(monkeypatch):
    monkeypatch.setenv("ROADFORGE_TRUSTED_PROXY_IPS", "10.0.0.0/24")
    get_settings.cache_clear()
    trusted_request = SimpleNamespace(
        client=SimpleNamespace(host="10.0.0.12"),
        headers={"x-forwarded-for": "198.51.100.8, 10.0.0.12"},
    )
    untrusted_request = SimpleNamespace(
        client=SimpleNamespace(host="203.0.113.9"),
        headers={"x-forwarded-for": "198.51.100.8"},
    )

    assert extract_client_ip(trusted_request) == "198.51.100.8"
    assert extract_client_ip(untrusted_request) == "203.0.113.9"

    get_settings.cache_clear()


def test_extract_client_ip_ignores_malformed_forwarded_header(monkeypatch):
    monkeypatch.setenv("ROADFORGE_TRUSTED_PROXY_IPS", "10.0.0.0/24")
    get_settings.cache_clear()
    request = SimpleNamespace(
        client=SimpleNamespace(host="10.0.0.12"),
        headers={"x-forwarded-for": "not-an-ip", "x-real-ip": "198.51.100.9"},
    )

    assert extract_client_ip(request) == "198.51.100.9"

    get_settings.cache_clear()
