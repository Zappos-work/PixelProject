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
    frontend_app_url: str = "http://localhost:3000"
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"
    auth_session_cookie_name: str = "pixelproject_session"
    auth_session_max_age_hours: int = 720
    auth_cookie_secure: bool = False
    holder_start_amount: int = 128
    holder_start_limit: int = 1000
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
