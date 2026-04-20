from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import and_, or_, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image

from app.core.config import Settings, get_settings
from app.models.area_contributor import AreaContributor
from app.models.claim_area import ClaimArea
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
    PixelBatchClaimResponse,
    PixelPaintResponse,
    AreaContributorSummary,
    AreaOwnerSummary,
    ClaimAreaSummary,
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
MAX_BATCH_CLAIM_PIXELS = 4096
AREA_NAME_MAX_LENGTH = 80
AREA_DESCRIPTION_MAX_LENGTH = 1200
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
        area_id=pixel.area_id,
        is_starter=pixel.is_starter,
        created_at=pixel.created_at,
        updated_at=pixel.updated_at,
    )


async def build_claim_area_summary(
    session: AsyncSession,
    area: ClaimArea,
    owner: User,
    viewer: User | None = None,
) -> ClaimAreaSummary:
    contributor_rows = await session.execute(
        select(User)
        .join(AreaContributor, AreaContributor.user_id == User.id)
        .where(AreaContributor.area_id == area.id)
        .order_by(User.public_id)
    )
    contributors = contributor_rows.scalars().all()
    viewer_can_edit = viewer is not None and viewer.id == area.owner_user_id
    viewer_can_paint = viewer_can_edit or (
        viewer is not None and any(contributor.id == viewer.id for contributor in contributors)
    )

    return ClaimAreaSummary(
        id=area.id,
        name=area.name,
        description=area.description,
        owner=AreaOwnerSummary(
            id=owner.id,
            public_id=owner.public_id,
            display_name=owner.display_name,
        ),
        claimed_pixels_count=area.claimed_pixels_count,
        painted_pixels_count=area.painted_pixels_count,
        contributor_count=len(contributors),
        contributors=[
            AreaContributorSummary(
                id=contributor.id,
                public_id=contributor.public_id,
                display_name=contributor.display_name,
            )
            for contributor in contributors
        ],
        viewer_can_edit=viewer_can_edit,
        viewer_can_paint=viewer_can_paint,
        created_at=area.created_at,
        updated_at=area.updated_at,
        last_activity_at=area.last_activity_at,
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


async def ensure_legacy_claim_areas(session: AsyncSession) -> None:
    result = await session.scalars(
        select(WorldPixel.owner_user_id)
        .where(
            WorldPixel.owner_user_id.is_not(None),
            WorldPixel.area_id.is_(None),
            WorldPixel.is_starter.is_(False),
        )
        .distinct()
    )
    owner_ids = [owner_id for owner_id in result.all() if owner_id is not None]

    for owner_id in owner_ids:
        pixels = (
            await session.scalars(
                select(WorldPixel).where(
                    WorldPixel.owner_user_id == owner_id,
                    WorldPixel.area_id.is_(None),
                    WorldPixel.is_starter.is_(False),
                )
            )
        ).all()

        if not pixels:
            continue

        now = datetime.now(timezone.utc)
        area = ClaimArea(
            owner_user_id=owner_id,
            name="Imported area",
            description="",
            claimed_pixels_count=len(pixels),
            painted_pixels_count=sum(1 for pixel in pixels if pixel.color_id is not None),
            last_activity_at=max((pixel.updated_at for pixel in pixels), default=now),
        )
        session.add(area)
        await session.flush()

        for pixel in pixels:
            pixel.area_id = area.id

    if owner_ids:
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


def _normalize_area_name(name: str | None) -> str:
    compact = " ".join((name or "").split())
    if not compact:
        return "Untitled area"
    return compact[:AREA_NAME_MAX_LENGTH]


def _normalize_area_description(description: str | None) -> str:
    compact = (description or "").strip()
    return compact[:AREA_DESCRIPTION_MAX_LENGTH]


def _normalize_batch_pixels(pixels: list[tuple[int, int]]) -> list[tuple[int, int]]:
    unique_pixels: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()

    for pixel in pixels:
        if pixel in seen:
            continue

        seen.add(pixel)
        unique_pixels.append(pixel)

    if not unique_pixels:
        raise PixelPlacementError("No claim pixels were submitted.", 422)

    if len(unique_pixels) > MAX_BATCH_CLAIM_PIXELS:
        raise PixelPlacementError(
            f"Claim batches are limited to {MAX_BATCH_CLAIM_PIXELS} pixels.",
            413,
        )

    return unique_pixels


def _validate_connected_pixels(pixels: list[tuple[int, int]]) -> None:
    pixel_set = set(pixels)
    visited: set[tuple[int, int]] = set()
    stack = [pixels[0]]

    while stack:
        x, y = stack.pop()

        if (x, y) in visited:
            continue

        visited.add((x, y))

        for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if neighbor in pixel_set and neighbor not in visited:
                stack.append(neighbor)

    if len(visited) != len(pixel_set):
        raise PixelPlacementError("Claim batches must be one connected shape.", 422)


def _get_neighbor_coordinates(pixels: list[tuple[int, int]]) -> list[tuple[int, int]]:
    pixel_set = set(pixels)
    neighbors: set[tuple[int, int]] = set()

    for x, y in pixels:
        for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if neighbor not in pixel_set:
                neighbors.add(neighbor)

    return list(neighbors)


async def _get_existing_pixels_at(
    session: AsyncSession,
    coordinates: list[tuple[int, int]],
) -> list[WorldPixel]:
    if not coordinates:
        return []

    result = await session.scalars(
        select(WorldPixel).where(tuple_(WorldPixel.x, WorldPixel.y).in_(coordinates))
    )
    return result.all()


async def _get_adjacent_claim_pixels(
    session: AsyncSession,
    pixels: list[tuple[int, int]],
) -> list[WorldPixel]:
    return await _get_existing_pixels_at(session, _get_neighbor_coordinates(pixels))


async def _resolve_target_area_for_claim(
    session: AsyncSession,
    user: User,
    adjacent_pixels: list[WorldPixel],
    now: datetime,
) -> ClaimArea:
    owned_area_ids = [
        pixel.area_id
        for pixel in adjacent_pixels
        if pixel.owner_user_id == user.id and pixel.area_id is not None
    ]

    if owned_area_ids:
        area = await session.get(ClaimArea, owned_area_ids[0])
        if area is not None:
            return area

    area = ClaimArea(
        owner_user_id=user.id,
        name="Untitled area",
        description="",
        claimed_pixels_count=0,
        painted_pixels_count=0,
        last_activity_at=now,
    )
    session.add(area)
    await session.flush()
    return area


async def _user_can_paint_area(session: AsyncSession, user: User, area: ClaimArea | None) -> bool:
    if area is None:
        return False

    if area.owner_user_id == user.id:
        return True

    contributor = await session.scalar(
        select(AreaContributor).where(
            AreaContributor.area_id == area.id,
            AreaContributor.user_id == user.id,
        )
    )
    return contributor is not None


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


async def get_claim_area_details(
    session: AsyncSession,
    area_id: UUID,
    viewer: User | None = None,
) -> ClaimAreaSummary:
    row = await session.execute(
        select(ClaimArea, User)
        .join(User, User.id == ClaimArea.owner_user_id)
        .where(ClaimArea.id == area_id)
    )
    result = row.first()

    if result is None:
        raise PixelPlacementError("Area not found.", 404)

    area, owner = result
    return await build_claim_area_summary(session, area, owner, viewer)


async def update_claim_area_metadata(
    session: AsyncSession,
    area_id: UUID,
    user: User,
    name: str | None,
    description: str | None,
) -> ClaimAreaSummary:
    row = await session.execute(
        select(ClaimArea, User)
        .join(User, User.id == ClaimArea.owner_user_id)
        .where(ClaimArea.id == area_id)
    )
    result = row.first()

    if result is None:
        raise PixelPlacementError("Area not found.", 404)

    area, owner = result
    if area.owner_user_id != user.id:
        raise PixelPlacementError("Only the area owner can edit this area.", 403)

    if name is not None:
        area.name = _normalize_area_name(name)

    if description is not None:
        area.description = _normalize_area_description(description)

    await session.commit()
    await session.refresh(area)
    return await build_claim_area_summary(session, area, owner, user)


async def invite_area_contributor(
    session: AsyncSession,
    area_id: UUID,
    owner: User,
    contributor_public_id: int,
) -> ClaimAreaSummary:
    row = await session.execute(
        select(ClaimArea, User)
        .join(User, User.id == ClaimArea.owner_user_id)
        .where(ClaimArea.id == area_id)
    )
    result = row.first()

    if result is None:
        raise PixelPlacementError("Area not found.", 404)

    area, area_owner = result
    if area.owner_user_id != owner.id:
        raise PixelPlacementError("Only the area owner can invite contributors.", 403)

    contributor = await session.scalar(select(User).where(User.public_id == contributor_public_id))
    if contributor is None:
        raise PixelPlacementError("No player with this public number was found.", 404)

    if contributor.id == owner.id:
        raise PixelPlacementError("The owner already has full access to this area.", 409)

    existing = await session.scalar(
        select(AreaContributor).where(
            AreaContributor.area_id == area.id,
            AreaContributor.user_id == contributor.id,
        )
    )

    if existing is None:
        session.add(
            AreaContributor(
                area_id=area.id,
                user_id=contributor.id,
                invited_by_user_id=owner.id,
            )
        )
        await session.commit()

    await session.refresh(area)
    return await build_claim_area_summary(session, area, area_owner, owner)


async def claim_world_pixel(
    session: AsyncSession,
    user: User,
    x: int,
    y: int,
    settings: Settings | None = None,
) -> PixelClaimResponse:
    batch = await claim_world_pixels(session, user, [(x, y)], settings)

    return PixelClaimResponse(
        pixel=batch.pixels[0],
        user=batch.user,
    )


async def claim_world_pixels(
    session: AsyncSession,
    user: User,
    pixels: list[tuple[int, int]],
    settings: Settings | None = None,
) -> PixelBatchClaimResponse:
    resolved_settings = settings or get_settings()
    now = datetime.now(timezone.utc)
    normalized_pixels = _normalize_batch_pixels(pixels)

    _validate_connected_pixels(normalized_pixels)

    for x, y in normalized_pixels:
        await _validate_inside_active_world(session, x, y)

    existing_pixels = await _get_existing_pixels_at(session, normalized_pixels)
    if existing_pixels:
        raise PixelPlacementError("This claim includes territory that is already claimed.", 409)

    adjacent_pixels = await _get_adjacent_claim_pixels(session, normalized_pixels)
    touches_existing_claim = any(pixel.is_starter or pixel.owner_user_id is not None for pixel in adjacent_pixels)

    if not touches_existing_claim:
        raise PixelPlacementError(
            "Claims must touch an existing claimed pixel or the starter frontier.",
            422,
        )

    try:
        await spend_holders(session, user, len(normalized_pixels), resolved_settings, now)
    except UserStateError as error:
        raise PixelPlacementError(error.detail, error.status_code) from error

    area = await _resolve_target_area_for_claim(session, user, adjacent_pixels, now)
    claimed_pixels: list[WorldPixel] = []

    for x, y in normalized_pixels:
        chunk_x, chunk_y = get_chunk_coordinates_for_pixel(x, y, resolved_settings)
        pixel = WorldPixel(
            x=x,
            y=y,
            chunk_x=chunk_x,
            chunk_y=chunk_y,
            color_id=None,
            owner_user_id=user.id,
            area_id=area.id,
            is_starter=False,
        )
        session.add(pixel)
        claimed_pixels.append(pixel)

    area.claimed_pixels_count += len(claimed_pixels)
    area.last_activity_at = now
    user.holders_placed_total += len(claimed_pixels)
    user.claimed_pixels_count += len(claimed_pixels)

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise PixelPlacementError("This claim conflicts with a recent claim. Try again.", 409) from error

    for pixel in claimed_pixels:
        invalidate_world_tile_for_pixel(pixel.x, pixel.y, {"claims"})
        await session.refresh(pixel)

    await session.refresh(area)
    await session.refresh(user)

    return PixelBatchClaimResponse(
        pixels=[build_world_pixel_summary(pixel, user) for pixel in claimed_pixels],
        user=build_auth_user_summary(user, resolved_settings),
        area=await build_claim_area_summary(session, area, user, user),
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

    area = await session.get(ClaimArea, pixel.area_id) if pixel.area_id is not None else None
    owner = user if pixel.owner_user_id == user.id else await session.get(User, pixel.owner_user_id)

    if pixel.owner_user_id != user.id and not await _user_can_paint_area(session, user, area):
        raise PixelPlacementError("You can only paint inside owned or contributed areas.", 403)

    await apply_holder_regeneration(session, user, resolved_settings)
    was_unpainted = pixel.color_id is None
    pixel.color_id = color_id

    if area is not None:
        if was_unpainted:
            area.painted_pixels_count += 1
        area.last_activity_at = datetime.now(timezone.utc)

    await session.commit()
    invalidate_world_tile_for_pixel(x, y, {"paint"})
    await session.refresh(pixel)
    await session.refresh(user)

    return PixelPaintResponse(
        pixel=build_world_pixel_summary(pixel, owner),
        user=build_auth_user_summary(user, resolved_settings),
    )
