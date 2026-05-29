from __future__ import annotations

from types import SimpleNamespace

import pytest

from api.config import Settings, get_settings
from api.main import create_app
from api.services.client_ip_service import extract_client_ip


def test_docs_are_disabled_outside_development(monkeypatch):
    monkeypatch.setenv("ROADFORGE_ENVIRONMENT", "production")
    monkeypatch.setenv("ROADFORGE_SECRET_KEY", "x" * 32)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@db.example.com/roadforge")
    get_settings.cache_clear()

    app = create_app()

    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None

    get_settings.cache_clear()


def test_production_requires_strong_secret_key():
    settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@db.example.com/roadforge",
        secret_key="change-me",
    )

    with pytest.raises(RuntimeError, match="ROADFORGE_SECRET_KEY"):
        settings.validate_startup_security()


def test_production_rejects_default_database_url():
    settings = Settings(
        environment="production",
        database_url=(
            "postgresql+asyncpg://roadforge:roadforge_dev@localhost:5432/roadforge"
        ),
        secret_key="x" * 32,
    )

    with pytest.raises(RuntimeError, match="default local development DATABASE_URL"):
        settings.validate_startup_security()


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
