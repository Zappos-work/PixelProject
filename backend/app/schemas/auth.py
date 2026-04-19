from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AuthUserSummary(BaseModel):
    id: UUID
    public_id: int
    display_name: str
    avatar_url: str | None
    holders: int
    holder_limit: int
    created_at: datetime
    last_login_at: datetime
    can_change_display_name: bool
    next_display_name_change_at: datetime | None = None


class AuthSessionStatus(BaseModel):
    authenticated: bool
    google_oauth_configured: bool
    user: AuthUserSummary | None = None


class LogoutResponse(BaseModel):
    success: bool


class UpdateDisplayNameRequest(BaseModel):
    display_name: str
