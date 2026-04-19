from datetime import datetime, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.user import User
from app.models.world_chunk import WorldChunk
from app.models.world_pixel import WorldPixel
from app.modules.auth.service import (
    UserStateError,
    apply_holder_regeneration,
    build_auth_user_summary,
    spend_holders,
)
from app.schemas.world import (
    PixelClaimResponse,
    PixelPaintResponse,
    WorldPixelSummary,
    WorldPixelWindow,
)

PIXEL_PALETTE = [
    {"id": 0, "hex": "#101418", "name": "Void"},
    {"id": 1, "hex": "#1d2b53", "name": "Navy"},
    {"id": 2, "hex": "#7e2553", "name": "Mulberry"},
    {"id": 3, "hex": "#008751", "name": "Pine"},
    {"id": 4, "hex": "#ab5236", "name": "Clay"},
    {"id": 5, "hex": "#5f574f", "name": "Stone"},
    {"id": 6, "hex": "#c2c3c7", "name": "Mist"},
    {"id": 7, "hex": "#fff1e8", "name": "Ivory"},
    {"id": 8, "hex": "#ff004d", "name": "Crimson"},
    {"id": 9, "hex": "#ffa300", "name": "Amber"},
    {"id": 10, "hex": "#ffec27", "name": "Signal Yellow"},
    {"id": 11, "hex": "#00e436", "name": "Lime"},
    {"id": 12, "hex": "#29adff", "name": "Sky"},
    {"id": 13, "hex": "#83769c", "name": "Lilac"},
    {"id": 14, "hex": "#ff77a8", "name": "Blush"},
    {"id": 15, "hex": "#ffccaa", "name": "Peach"},
    {"id": 16, "hex": "#291814", "name": "Umber"},
    {"id": 17, "hex": "#111d35", "name": "Midnight"},
    {"id": 18, "hex": "#422136", "name": "Wine"},
    {"id": 19, "hex": "#125359", "name": "Lagoon"},
    {"id": 20, "hex": "#742f29", "name": "Rust"},
    {"id": 21, "hex": "#49333b", "name": "Dust"},
    {"id": 22, "hex": "#a28879", "name": "Sand"},
    {"id": 23, "hex": "#f3ef7d", "name": "Pollen"},
    {"id": 24, "hex": "#be1250", "name": "Ruby"},
    {"id": 25, "hex": "#ff6c24", "name": "Flare"},
    {"id": 26, "hex": "#a8e72e", "name": "Acid"},
    {"id": 27, "hex": "#00b543", "name": "Emerald"},
    {"id": 28, "hex": "#065ab5", "name": "Azure"},
    {"id": 29, "hex": "#754665", "name": "Mauve"},
    {"id": 30, "hex": "#ff6e59", "name": "Coral"},
    {"id": 31, "hex": "#ff9d81", "name": "Apricot"},
]
VALID_COLOR_IDS = {color["id"] for color in PIXEL_PALETTE}
MAX_VISIBLE_PIXELS = 5000
STARTER_FRONTIER_COORDINATES = [
    (-1, 0),
    (0, -1),
    (0, 0),
    (0, 1),
    (1, 0),
]


class PixelPlacementError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def build_world_pixel_summary(pixel: WorldPixel, owner: User | None) -> WorldPixelSummary:
    return WorldPixelSummary(
        id=pixel.id,
        x=pixel.x,
        y=pixel.y,
        chunk_x=pixel.chunk_x,
        chunk_y=pixel.chunk_y,
        color_id=pixel.color_id,
        owner_user_id=pixel.owner_user_id,
        owner_public_id=owner.public_id if owner is not None else None,
        owner_display_name=owner.display_name if owner is not None else None,
        is_starter=pixel.is_starter,
        created_at=pixel.created_at,
        updated_at=pixel.updated_at,
    )


def get_chunk_coordinates_for_pixel(x: int, y: int, settings: Settings) -> tuple[int, int]:
    chunk_size = settings.world_chunk_size
    chunk_x = (x - settings.world_origin_x) // chunk_size
    chunk_y = (y - settings.world_origin_y) // chunk_size
    return chunk_x, chunk_y


async def ensure_starter_claim_frontier(
    session: AsyncSession,
    settings: Settings | None = None,
) -> None:
    resolved_settings = settings or get_settings()

    for x, y in STARTER_FRONTIER_COORDINATES:
        existing = await session.scalar(select(WorldPixel).where(WorldPixel.x == x, WorldPixel.y == y))
        if existing is not None:
            if not existing.is_starter:
                existing.is_starter = True
                existing.owner_user_id = None
                existing.color_id = None
            continue

        chunk_x, chunk_y = get_chunk_coordinates_for_pixel(x, y, resolved_settings)
        session.add(
            WorldPixel(
                x=x,
                y=y,
                chunk_x=chunk_x,
                chunk_y=chunk_y,
                color_id=None,
                owner_user_id=None,
                is_starter=True,
            )
        )

    await session.commit()


async def get_visible_world_pixels(
    session: AsyncSession,
    min_x: int,
    max_x: int,
    min_y: int,
    max_y: int,
) -> WorldPixelWindow:
    low_x, high_x = sorted((min_x, max_x))
    low_y, high_y = sorted((min_y, max_y))

    result = await session.execute(
        select(WorldPixel, User)
        .outerjoin(User, User.id == WorldPixel.owner_user_id)
        .where(
            WorldPixel.x >= low_x,
            WorldPixel.x <= high_x,
            WorldPixel.y >= low_y,
            WorldPixel.y <= high_y,
        )
        .order_by(WorldPixel.updated_at.desc())
        .limit(MAX_VISIBLE_PIXELS + 1)
    )
    rows = result.all()
    truncated = len(rows) > MAX_VISIBLE_PIXELS
    visible_rows = rows[:MAX_VISIBLE_PIXELS]

    return WorldPixelWindow(
        min_x=low_x,
        max_x=high_x,
        min_y=low_y,
        max_y=high_y,
        truncated=truncated,
        pixels=[build_world_pixel_summary(pixel, owner) for pixel, owner in visible_rows],
    )


async def _validate_inside_active_world(session: AsyncSession, x: int, y: int) -> None:
    active_chunk = await session.scalar(
        select(WorldChunk).where(
            and_(
                WorldChunk.is_active.is_(True),
                WorldChunk.origin_x <= x,
                WorldChunk.origin_x + WorldChunk.width > x,
                WorldChunk.origin_y <= y,
                WorldChunk.origin_y + WorldChunk.height > y,
            )
        )
    )

    if active_chunk is None:
        raise PixelPlacementError("Selected pixel is outside the active world.", 422)


async def _has_adjacent_claim(session: AsyncSession, x: int, y: int) -> bool:
    neighbors = [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]
    clauses = [and_(WorldPixel.x == nx, WorldPixel.y == ny) for nx, ny in neighbors]
    result = await session.scalars(
        select(WorldPixel).where(or_(*clauses))
    )

    return any(pixel.is_starter or pixel.owner_user_id is not None for pixel in result.all())


async def claim_world_pixel(
    session: AsyncSession,
    user: User,
    x: int,
    y: int,
    settings: Settings | None = None,
) -> PixelClaimResponse:
    resolved_settings = settings or get_settings()
    now = datetime.now(timezone.utc)

    await _validate_inside_active_world(session, x, y)

    existing = await session.scalar(select(WorldPixel).where(WorldPixel.x == x, WorldPixel.y == y))
    if existing is not None:
        raise PixelPlacementError("This pixel is already part of an existing claim.", 409)

    if not await _has_adjacent_claim(session, x, y):
        raise PixelPlacementError(
            "Claims must touch an existing claimed pixel or the starter frontier.",
            422,
        )

    try:
        await spend_holders(session, user, 1, resolved_settings, now)
    except UserStateError as error:
        raise PixelPlacementError(error.detail, error.status_code) from error

    chunk_x, chunk_y = get_chunk_coordinates_for_pixel(x, y, resolved_settings)
    pixel = WorldPixel(
        x=x,
        y=y,
        chunk_x=chunk_x,
        chunk_y=chunk_y,
        color_id=None,
        owner_user_id=user.id,
        is_starter=False,
    )
    session.add(pixel)
    user.holders_placed_total += 1
    user.claimed_pixels_count += 1

    await session.commit()
    await session.refresh(pixel)
    await session.refresh(user)

    return PixelClaimResponse(
        pixel=build_world_pixel_summary(pixel, user),
        user=build_auth_user_summary(user, resolved_settings),
    )


async def paint_world_pixel(
    session: AsyncSession,
    user: User,
    x: int,
    y: int,
    color_id: int,
    settings: Settings | None = None,
) -> PixelPaintResponse:
    resolved_settings = settings or get_settings()

    if color_id not in VALID_COLOR_IDS:
        raise PixelPlacementError("Invalid palette color.", 422)

    await _validate_inside_active_world(session, x, y)

    pixel = await session.scalar(select(WorldPixel).where(WorldPixel.x == x, WorldPixel.y == y))
    if pixel is None or pixel.owner_user_id is None or pixel.is_starter:
        raise PixelPlacementError("This pixel is not claimed yet.", 422)

    if pixel.owner_user_id != user.id:
        raise PixelPlacementError("You can only paint inside your own claimed area.", 403)

    await apply_holder_regeneration(session, user, resolved_settings)
    pixel.color_id = color_id

    await session.commit()
    await session.refresh(pixel)
    await session.refresh(user)

    return PixelPaintResponse(
        pixel=build_world_pixel_summary(pixel, user),
        user=build_auth_user_summary(user, resolved_settings),
    )
