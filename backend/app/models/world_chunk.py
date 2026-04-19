import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorldChunk(Base):
    __tablename__ = "world_chunks"
    __table_args__ = (UniqueConstraint("chunk_x", "chunk_y", name="uq_world_chunks_xy"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chunk_x: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_y: Mapped[int] = mapped_column(Integer, nullable=False)
    origin_x: Mapped[int] = mapped_column(Integer, nullable=False)
    origin_y: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
