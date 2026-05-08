from functools import lru_cache

from pydantic import Field
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
    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:3001"],
    )
    # Base URL of the Next.js frontend — used to build invite link join URLs.
    web_base_url: str = Field(default="http://localhost:3000", alias="ROADFORGE_WEB_BASE_URL")


@lru_cache
def get_settings() -> Settings:
    return Settings()
