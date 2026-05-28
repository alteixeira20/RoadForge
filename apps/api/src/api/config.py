from functools import lru_cache
from typing import Union

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
        default="postgresql+asyncpg://roadforge:roadforge_dev@localhost:5432/roadforge",
        alias="DATABASE_URL",
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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, list[str]]) -> list[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        return v # type: ignore

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
