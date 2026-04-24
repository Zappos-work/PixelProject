import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ClaimAreaOverlay(Base):
    __tablename__ = "claim_area_overlays"
    __table_args__ = (
        UniqueConstraint("area_id", name="uq_claim_area_overlays_area_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    area_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("claim_areas.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    image_name: Mapped[str] = mapped_column(String(120), default="overlay", nullable=False)
    image_width: Mapped[int] = mapped_column(Integer, nullable=False)
    image_height: Mapped[int] = mapped_column(Integer, nullable=False)
    origin_x: Mapped[int] = mapped_column(Integer, nullable=False)
    origin_y: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    color_mode: Mapped[str] = mapped_column(String(16), default="perceptual", nullable=False)
    color_palette: Mapped[str] = mapped_column(String(64), default="all", nullable=False)
    dithering: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    flip_x: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    flip_y: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    template_pixels: Mapped[list[dict[str, int]]] = mapped_column(JSON, default=list, nullable=False)
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
