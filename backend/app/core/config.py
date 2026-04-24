from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False)

    app_name: str = "PixelProject API"
    app_version: str = "0.2.2"
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
    holders_unlimited_default: bool = True
    holder_start_amount: int = 128
    holder_start_limit: int = 1000
    holder_regeneration_interval_seconds: int = 10
    claim_area_start_limit: int = 1
    normal_pixel_start_amount: int = 64
    normal_pixel_start_limit: int = 64
    normal_pixel_regeneration_interval_seconds: int = 30
    level_up_holders_step: int = 256
    world_origin_x: int = -2000
    world_origin_y: int = -2000
    world_chunk_size: int = 4000
    world_expansion_buffer: int = 0
    world_expansion_claim_fill_ratio: float = 0.7

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @model_validator(mode="after")
    def normalize_and_validate_runtime_settings(self) -> "Settings":
        centered_origin = -(self.world_chunk_size // 2)
        self.world_origin_x = centered_origin
        self.world_origin_y = centered_origin

        if self.is_production:
            if self.secret_key in {"change-me", "change-me-in-local-dev"} or len(self.secret_key) < 32:
                raise ValueError("SECRET_KEY must be a strong non-default value in production.")
            if not self.auth_cookie_secure:
                raise ValueError("AUTH_COOKIE_SECURE must be true in production.")
            if not self.frontend_app_url.startswith("https://"):
                raise ValueError("FRONTEND_APP_URL must use https in production.")
            if "*" in self.cors_origins:
                raise ValueError("Wildcard CORS origins are not allowed in production.")

        return self

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.backend_cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
