from datetime import datetime
from uuid import UUID

from typing import Literal

from pydantic import BaseModel, Field, StrictInt


class ShopItemPurchaseSummary(BaseModel):
    purchased: int
    item_size: int
    total_received: int


class ShopItemsPurchasedSummary(BaseModel):
    pixel_pack_50: ShopItemPurchaseSummary
    max_pixels_5: ShopItemPurchaseSummary


class AuthUserSummary(BaseModel):
    id: UUID
    public_id: int
    display_name: str
    display_name_changed_at: datetime | None = None
    avatar_key: str
    avatar_url: str | None
    role: str
    is_banned: bool
    is_deactivated: bool
    holders: int
    holders_unlimited: bool
    holder_limit: int
    holder_regeneration_interval_seconds: int
    holders_last_updated_at: datetime
    next_holder_regeneration_at: datetime | None = None
    claim_area_limit: int
    normal_pixels: int
    normal_pixel_limit: int
    normal_pixel_regeneration_interval_seconds: int
    normal_pixels_last_updated_at: datetime
    next_normal_pixel_regeneration_at: datetime | None = None
    created_at: datetime
    last_login_at: datetime
    needs_display_name_setup: bool
    can_change_display_name: bool
    next_display_name_change_at: datetime | None = None
    xp: int
    level: int
    level_progress_current: int
    level_progress_target: int
    coins: int
    shop_items_purchased: ShopItemsPurchasedSummary
    pixels_placed_total: int
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


ShopItemId = Literal["pixel_pack_50", "max_pixels_5"]


class ShopPurchaseRequest(BaseModel):
    item_id: ShopItemId
    quantity: StrictInt = Field(default=1, ge=1, le=999)
