from functools import lru_cache
from ipaddress import ip_network
from typing import Union
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_DATABASE_URL = "postgresql+asyncpg://roadforge:roadforge_dev@localhost:5432/roadforge"
_UNSAFE_SECRET_VALUES = {"", "change-me", "changeme", "secret", "roadforge", "development"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = "RoadForge API"
    app_version: str = "0.1.0"
    environment: str = Field(default="development", alias="ROADFORGE_ENVIRONMENT")
    database_url: str = Field(
        default=_DEFAULT_DATABASE_URL,
        alias="DATABASE_URL",
    )
    secret_key: str | None = Field(default=None, alias="ROADFORGE_SECRET_KEY")
    allow_local_database_in_production: bool = Field(
        default=False,
        alias="ROADFORGE_ALLOW_LOCAL_DATABASE_IN_PRODUCTION",
    )
    redis_url: str | None = Field(default=None, alias="REDIS_URL")
    realtime_backend: str = Field(default="memory", alias="ROADFORGE_REALTIME_BACKEND")
    redis_key_prefix: str = Field(default="roadforge", alias="ROADFORGE_REDIS_KEY_PREFIX")
    redis_connect_timeout_seconds: float = Field(
        default=2,
        alias="ROADFORGE_REDIS_CONNECT_TIMEOUT_SECONDS",
    )
    redis_socket_timeout_seconds: float = Field(
        default=2,
        alias="ROADFORGE_REDIS_SOCKET_TIMEOUT_SECONDS",
    )
    cors_origins: Union[list[str], str] = Field(
        default=["http://localhost:3020", "http://127.0.0.1:3020", "http://localhost:3000"],
        alias="ROADFORGE_CORS_ORIGINS",
    )
    trusted_proxy_ips: Union[list[str], str] = Field(
        default=[],
        alias="ROADFORGE_TRUSTED_PROXY_IPS",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, list[str]]) -> list[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        return v # type: ignore

    @field_validator("trusted_proxy_ips", mode="before")
    @classmethod
    def assemble_trusted_proxy_ips(cls, v: Union[str, list[str]]) -> list[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v # type: ignore

    @field_validator("trusted_proxy_ips")
    @classmethod
    def validate_trusted_proxy_ips(cls, v: list[str]) -> list[str]:
        for item in v:
            network = ip_network(item, strict=False)
            if network.prefixlen == 0:
                raise ValueError("ROADFORGE_TRUSTED_PROXY_IPS cannot trust every address")
        return v

    @field_validator("realtime_backend")
    @classmethod
    def validate_realtime_backend(cls, v: str) -> str:
        if v not in {"memory", "redis"}:
            raise ValueError("ROADFORGE_REALTIME_BACKEND must be 'memory' or 'redis'")
        return v

    # Base URL of the Next.js frontend — used to build invite link join URLs.
    web_base_url: str = Field(default="http://localhost:3020", alias="ROADFORGE_WEB_BASE_URL")
    roadmap_projection_read_enabled: bool = Field(
        default=False,
        alias="ROADFORGE_ROADMAP_PROJECTION_READ_ENABLED",
    )

    @property
    def is_development(self) -> bool:
        return self.environment.lower() == "development"

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def is_production_like(self) -> bool:
        return not self.is_development

    def validate_startup_security(self) -> None:
        if not self.is_production_like:
            return
        _validate_production_secret(self.secret_key)
        _validate_production_database_url(
            self.database_url,
            allow_local=self.allow_local_database_in_production,
        )


def _validate_production_secret(secret_key: str | None) -> None:
    value = (secret_key or "").strip()
    lowered = value.lower()
    if (
        len(value) < 32
        or lowered in _UNSAFE_SECRET_VALUES
        or "change-me" in lowered
        or "changeme" in lowered
    ):
        raise RuntimeError(
            "ROADFORGE_SECRET_KEY must be set to a non-default value of at least 32 characters "
            "outside development."
        )


def _validate_production_database_url(database_url: str, *, allow_local: bool) -> None:
    parsed = urlparse(database_url)
    hostname = (parsed.hostname or "").lower()
    username = (parsed.username or "").lower()
    password = parsed.password or ""

    if database_url == _DEFAULT_DATABASE_URL:
        raise RuntimeError("Production cannot use the default local development DATABASE_URL.")

    if hostname in {"localhost", "127.0.0.1", "::1"} and not allow_local:
        raise RuntimeError(
            "Production DATABASE_URL points at localhost. Set a production database URL, or set "
            "ROADFORGE_ALLOW_LOCAL_DATABASE_IN_PRODUCTION=true only for a documented safe topology."
        )

    if username == "roadforge" and password == "roadforge_dev":
        raise RuntimeError(
            "Production DATABASE_URL appears to use development database credentials."
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
