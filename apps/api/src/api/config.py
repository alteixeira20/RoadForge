from functools import lru_cache
from ipaddress import ip_network
from typing import Union
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_DATABASE_URL = "postgresql+asyncpg://roadforge:roadforge_dev@localhost:5432/roadforge"


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
    api_workers: int = Field(default=1, gt=0, alias="ROADFORGE_API_WORKERS")
    max_server_roadmaps: int = Field(
        default=500, ge=1, le=100_000, alias="ROADFORGE_MAX_SERVER_ROADMAPS"
    )
    max_active_sessions_per_share_link: int = Field(
        default=128, ge=1, le=10_000, alias="ROADFORGE_MAX_ACTIVE_SESSIONS_PER_SHARE_LINK"
    )
    max_realtime_streams_per_participant: int = Field(
        default=3, ge=1, le=20, alias="ROADFORGE_MAX_REALTIME_STREAMS_PER_PARTICIPANT"
    )
    max_activity_logs_per_roadmap: int = Field(
        default=2_000, ge=100, le=100_000, alias="ROADFORGE_MAX_ACTIVITY_LOGS_PER_ROADMAP"
    )
    max_version_history_bytes_per_roadmap: int = Field(
        default=32 * 1024 * 1024,
        ge=16 * 1024 * 1024,
        le=2 * 1024 * 1024 * 1024,
        alias="ROADFORGE_MAX_VERSION_HISTORY_BYTES_PER_ROADMAP",
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
        return v  # type: ignore

    @field_validator("trusted_proxy_ips", mode="before")
    @classmethod
    def assemble_trusted_proxy_ips(cls, v: Union[str, list[str]]) -> list[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v  # type: ignore

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
        _validate_production_database_url(
            self.database_url,
            allow_local=self.allow_local_database_in_production,
        )
        _validate_production_cors_origins(self.cors_origins)
        _validate_production_web_base_url(self.web_base_url, self.cors_origins)

    def validate_startup_realtime(self) -> None:
        if self.realtime_backend == "memory" and self.api_workers != 1:
            raise RuntimeError(
                "ROADFORGE_API_WORKERS must be 1 when "
                "ROADFORGE_REALTIME_BACKEND=memory."
            )
        if self.realtime_backend == "redis" and not (self.redis_url or "").strip():
            raise RuntimeError(
                "REDIS_URL is required when ROADFORGE_REALTIME_BACKEND=redis."
            )


def _validate_production_cors_origins(cors_origins: list[str]) -> None:
    """Reject unsafe production CORS configuration.

    The API always sets `allow_credentials=True` because browser realtime
    bootstrap uses a short-lived HttpOnly cookie and session Bearer tokens
    may be sent cross-origin from an explicitly allowed frontend. A wildcard origin
    combined with credentials must never reach a production deployment —
    fail fast at startup with a diagnosable error rather than depend on the
    browser to refuse the combination.
    """
    if not cors_origins:
        raise RuntimeError(
            "ROADFORGE_CORS_ORIGINS must list at least one explicit origin in production."
        )

    for raw_origin in cors_origins:
        origin = raw_origin.strip()
        if not origin:
            raise RuntimeError(
                "ROADFORGE_CORS_ORIGINS cannot contain an empty origin value."
            )
        if origin == "*":
            raise RuntimeError(
                "ROADFORGE_CORS_ORIGINS cannot include a wildcard '*' in production: "
                "the API always allows credentialed requests, so list explicit "
                "scheme://host[:port] origins instead."
            )
        parsed = urlparse(origin)
        if (
            parsed.scheme != "https"
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.params
            or parsed.query
            or parsed.fragment
        ):
            raise RuntimeError(
                f"ROADFORGE_CORS_ORIGINS entry {origin!r} must be an explicit "
                "HTTPS scheme://host[:port] origin in production."
            )


def _validate_production_web_base_url(
    web_base_url: str, cors_origins: list[str]
) -> None:
    """Invite credentials must only be delivered through the canonical HTTPS frontend."""
    base_url = web_base_url.strip()
    parsed = urlparse(base_url)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.params
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError(
            "ROADFORGE_WEB_BASE_URL must be an HTTPS origin without credentials, "
            "path, query, or fragment in production."
        )
    canonical = base_url.rstrip("/")
    allowed = {origin.strip().rstrip("/") for origin in cors_origins}
    if canonical not in allowed:
        raise RuntimeError(
            "ROADFORGE_WEB_BASE_URL must also appear in ROADFORGE_CORS_ORIGINS."
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
