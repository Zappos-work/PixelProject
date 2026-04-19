from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False)

    app_name: str = "PixelProject API"
    app_env: str = "development"
    secret_key: str = "change-me"
    api_v1_prefix: str = "/api/v1"
    sql_echo: bool = False
    database_url: str = "postgresql+asyncpg://pixelproject:pixelproject@db:5432/pixelproject"
    redis_url: str = "redis://redis:6379/0"
    backend_cors_origins: str = "http://localhost:3000"
    world_origin_x: int = 0
    world_origin_y: int = 0
    world_chunk_size: int = 5000
    world_expansion_buffer: int = 5000

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.backend_cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
