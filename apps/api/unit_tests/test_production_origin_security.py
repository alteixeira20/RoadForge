import pytest

from api.config import Settings

_DATABASE_URL = "postgresql+asyncpg://user:pass@db.example.com/roadforge"


def test_production_accepts_https_frontend_origin() -> None:
    settings = Settings(
        environment="production",
        database_url=_DATABASE_URL,
        cors_origins=["https://app.example.com", "https://admin.example.com:8443"],
        web_base_url="https://app.example.com",
    )

    settings.validate_startup_security()


def test_production_rejects_http_cors_origin() -> None:
    settings = Settings(
        environment="production",
        database_url=_DATABASE_URL,
        cors_origins=["http://app.example.com"],
        web_base_url="https://app.example.com",
    )

    with pytest.raises(RuntimeError, match="HTTPS"):
        settings.validate_startup_security()


def test_production_rejects_http_invite_base_url() -> None:
    settings = Settings(
        environment="production",
        database_url=_DATABASE_URL,
        cors_origins=["https://app.example.com"],
        web_base_url="http://app.example.com",
    )

    with pytest.raises(RuntimeError, match="ROADFORGE_WEB_BASE_URL must be an HTTPS origin"):
        settings.validate_startup_security()


def test_production_invite_base_must_be_an_allowed_origin() -> None:
    settings = Settings(
        environment="production",
        database_url=_DATABASE_URL,
        cors_origins=["https://app.example.com"],
        web_base_url="https://other.example.com",
    )

    with pytest.raises(RuntimeError, match="must also appear"):
        settings.validate_startup_security()
