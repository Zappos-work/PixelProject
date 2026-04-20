from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image

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
WORLD_TILE_SIZE = 1000
WORLD_TILE_CACHE_DIR = Path(".tile-cache")
WORLD_TILE_LAYERS = {"claims", "paint"}
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


class WorldTileError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def _hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    normalized = hex_color.lstrip("#")
    return (
        int(normalized[0:2], 16),
        int(normalized[2:4], 16),
        int(normalized[4:6], 16),
        alpha,
    )


PALETTE_RGBA = {
    color["id"]: _hex_to_rgba(color["hex"])
    for color in PIXEL_PALETTE
}


def get_world_tile_key(x: int, y: int) -> tuple[int, int]:
    return x // WORLD_TILE_SIZE, y // WORLD_TILE_SIZE


def get_world_tile_cache_path(layer: str, tile_x: int, tile_y: int) -> Path:
    return WORLD_TILE_CACHE_DIR / layer / f"{tile_x}_{tile_y}.png"


def get_world_tile_bounds(tile_x: int, tile_y: int) -> tuple[int, int, int, int]:
    min_x = tile_x * WORLD_TILE_SIZE
    min_y = tile_y * WORLD_TILE_SIZE
    return min_x, min_x + WORLD_TILE_SIZE - 1, min_y, min_y + WORLD_TILE_SIZE - 1


def invalidate_world_tile_for_pixel(x: int, y: int, layers: set[str] | None = None) -> None:
    tile_x, tile_y = get_world_tile_key(x, y)
    invalidated_layers = layers or WORLD_TILE_LAYERS

    for layer in invalidated_layers:
        path = get_world_tile_cache_path(layer, tile_x, tile_y)

        try:
            path.unlink(missing_ok=True)
        except OSError:
            # A stale tile is acceptable; the next successful invalidation/request will refresh it.
            pass


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


async def ensure_world_tile_png(
    session: AsyncSession,
    layer: str,
    tile_x: int,
    tile_y: int,
) -> Path:
    if layer not in WORLD_TILE_LAYERS:
        raise WorldTileError("Unknown world tile layer.", 404)

    tile_path = get_world_tile_cache_path(layer, tile_x, tile_y)
    if tile_path.exists():
        return tile_path

    tile_path.parent.mkdir(parents=True, exist_ok=True)
    min_x, max_x, min_y, max_y = get_world_tile_bounds(tile_x, tile_y)

    if layer == "paint":
        result = await session.execute(
            select(WorldPixel.x, WorldPixel.y, WorldPixel.color_id)
            .where(
                WorldPixel.x >= min_x,
                WorldPixel.x <= max_x,
                WorldPixel.y >= min_y,
                WorldPixel.y <= max_y,
                WorldPixel.color_id.is_not(None),
            )
        )
        image = Image.new("RGBA", (WORLD_TILE_SIZE, WORLD_TILE_SIZE), (0, 0, 0, 0))
        pixels = image.load()

        for x, y, color_id in result.all():
            if color_id is None:
                continue

            pixels[x - min_x, y - min_y] = PALETTE_RGBA.get(color_id, (255, 255, 255, 255))
    else:
        result = await session.execute(
            select(WorldPixel.x, WorldPixel.y, WorldPixel.owner_user_id, WorldPixel.is_starter)
            .where(
                WorldPixel.x >= min_x,
                WorldPixel.x <= max_x,
                WorldPixel.y >= min_y,
                WorldPixel.y <= max_y,
                or_(WorldPixel.owner_user_id.is_not(None), WorldPixel.is_starter.is_(True)),
            )
        )
        image = Image.new("RGBA", (WORLD_TILE_SIZE, WORLD_TILE_SIZE), (0, 0, 0, 0))
        pixels = image.load()

        for x, y, owner_user_id, is_starter in result.all():
            pixels[x - min_x, y - min_y] = (
                (255, 210, 92, 74)
                if is_starter
                else (70, 208, 164, 48 if owner_user_id is not None else 0)
            )

    temp_path = tile_path.with_suffix(".tmp.png")
    image.save(temp_path, format="PNG", compress_level=4)
    temp_path.replace(tile_path)
    return tile_path


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
    invalidate_world_tile_for_pixel(x, y, {"claims"})
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
    invalidate_world_tile_for_pixel(x, y, {"paint"})
    await session.refresh(pixel)
    await session.refresh(user)

    return PixelPaintResponse(
        pixel=build_world_pixel_summary(pixel, user),
        user=build_auth_user_summary(user, resolved_settings),
    )
