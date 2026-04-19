import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorldPixel(Base):
    __tablename__ = "world_pixels"
    __table_args__ = (UniqueConstraint("x", "y", name="uq_world_pixels_xy"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    x: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    y: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    chunk_x: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    chunk_y: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    color_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    is_starter: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
