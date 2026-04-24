import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Sequence, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

claim_area_public_id_sequence = Sequence("claim_areas_public_id_seq")


class ClaimArea(Base):
    __tablename__ = "claim_areas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_id: Mapped[int] = mapped_column(
        Integer,
        claim_area_public_id_sequence,
        server_default=claim_area_public_id_sequence.next_value(),
        unique=True,
        index=True,
        nullable=False,
    )
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(20), default="Untitled area", nullable=False)
    description: Mapped[str] = mapped_column(String(250), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)
    claimed_pixels_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    painted_pixels_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
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
