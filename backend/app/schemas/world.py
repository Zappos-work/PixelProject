from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


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
