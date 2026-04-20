from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.auth import AuthUserSummary


class Point(BaseModel):
    x: int
    y: int


class WorldChunkSummary(BaseModel):
    id: UUID
    chunk_x: int
    chunk_y: int
    origin_x: int
    origin_y: int
    width: int
    height: int
    is_active: bool
    created_at: datetime
    label: str
    role: str


class WorldBounds(BaseModel):
    min_chunk_x: int
    max_chunk_x: int
    min_chunk_y: int
    max_chunk_y: int
    min_world_x: int
    max_world_x: int
    min_world_y: int
    max_world_y: int


class WorldLandmark(BaseModel):
    id: str
    name: str
    kind: str
    description: str
    chunk_x: int
    chunk_y: int
    offset_x: float
    offset_y: float
    tone: str


class WorldOverview(BaseModel):
    origin: Point
    chunk_size: int
    expansion_buffer: int
    chunk_count: int
    bounds: WorldBounds
    chunks: list[WorldChunkSummary]
    landmarks: list[WorldLandmark]


class PixelColor(BaseModel):
    id: int
    hex: str
    name: str


class WorldPixelSummary(BaseModel):
    id: UUID
    x: int
    y: int
    chunk_x: int
    chunk_y: int
    color_id: int | None
    owner_user_id: UUID | None
    owner_public_id: int | None
    owner_display_name: str | None
    area_id: UUID | None
    is_starter: bool
    created_at: datetime
    updated_at: datetime


class WorldPixelWindow(BaseModel):
    min_x: int
    max_x: int
    min_y: int
    max_y: int
    truncated: bool
    pixels: list[WorldPixelSummary]


class PixelClaimRequest(BaseModel):
    x: int
    y: int


class PixelBatchClaimRequest(BaseModel):
    pixels: list[Point]


class PixelClaimResponse(BaseModel):
    pixel: WorldPixelSummary
    user: AuthUserSummary


class PixelPaintRequest(BaseModel):
    x: int
    y: int
    color_id: int


class PixelPaintResponse(BaseModel):
    pixel: WorldPixelSummary
    user: AuthUserSummary


class AreaOwnerSummary(BaseModel):
    id: UUID
    public_id: int
    display_name: str


class AreaContributorSummary(BaseModel):
    id: UUID
    public_id: int
    display_name: str


class ClaimAreaSummary(BaseModel):
    id: UUID
    name: str
    description: str
    owner: AreaOwnerSummary
    claimed_pixels_count: int
    painted_pixels_count: int
    contributor_count: int
    contributors: list[AreaContributorSummary]
    viewer_can_edit: bool
    viewer_can_paint: bool
    created_at: datetime
    updated_at: datetime
    last_activity_at: datetime


class PixelBatchClaimResponse(BaseModel):
    pixels: list[WorldPixelSummary]
    user: AuthUserSummary
    area: ClaimAreaSummary


class ClaimAreaUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None


class AreaContributorInviteRequest(BaseModel):
    public_id: int
