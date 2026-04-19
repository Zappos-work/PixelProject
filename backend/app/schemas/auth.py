from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AvatarHistoryEntry(BaseModel):
    image_url: str
    label: str
    selected_at: datetime


class AuthUserSummary(BaseModel):
    id: UUID
    public_id: int
    google_subject: str
    email: str
    display_name: str
    display_name_changed_at: datetime | None = None
    avatar_key: str
    avatar_url: str | None
    avatar_history: list[AvatarHistoryEntry]
    role: str
    is_banned: bool
    holders: int
    holder_limit: int
    holder_regeneration_interval_seconds: int
    holders_last_updated_at: datetime
    next_holder_regeneration_at: datetime | None = None
    created_at: datetime
    last_login_at: datetime
    needs_display_name_setup: bool
    can_change_display_name: bool
    next_display_name_change_at: datetime | None = None
    level: int
    level_progress_current: int
    level_progress_target: int
    holders_placed_total: int
    claimed_pixels_count: int


class AuthSessionStatus(BaseModel):
    authenticated: bool
    google_oauth_configured: bool
    user: AuthUserSummary | None = None


class LogoutResponse(BaseModel):
    success: bool


class UpdateDisplayNameRequest(BaseModel):
    display_name: str
