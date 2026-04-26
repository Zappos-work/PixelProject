import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, Sequence, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

public_id_sequence = Sequence("users_public_id_seq")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index(
            "ux_users_active_google_subject",
            "google_subject",
            unique=True,
            postgresql_where=text("is_deactivated IS FALSE"),
        ),
        Index(
            "ux_users_active_email",
            "email",
            unique=True,
            postgresql_where=text("is_deactivated IS FALSE AND email IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    public_id: Mapped[int] = mapped_column(
        Integer,
        public_id_sequence,
        server_default=public_id_sequence.next_value(),
        unique=True,
        index=True,
        nullable=False,
    )
    google_subject: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), index=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(255), default="Player", nullable=False)
    display_name_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    avatar_key: Mapped[str] = mapped_column(String(64), default="default-avatar", nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String(32), default="player", nullable=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deactivated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    holders: Mapped[int] = mapped_column(Integer, default=128, nullable=False)
    holders_unlimited: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    holder_limit: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    holders_last_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    claim_area_limit: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    normal_pixels: Mapped[int] = mapped_column(Integer, default=64, nullable=False)
    normal_pixel_limit: Mapped[int] = mapped_column(Integer, default=64, nullable=False)
    normal_pixels_last_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    coins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    shop_pixel_pack_50_purchases: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    shop_max_pixels_5_purchases: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pixels_placed_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    holders_placed_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    claimed_pixels_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
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
    last_login_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
