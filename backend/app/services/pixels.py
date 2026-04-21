from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import and_, func, insert, or_, select, tuple_
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
    apply_normal_pixel_regeneration,
    build_auth_user_summary,
    spend_holders,
    spend_normal_pixels,
)
from app.schemas.world import (
    PixelClaimResponse,
    PixelBatchClaimResponse,
    PixelBatchPaintResponse,
    PixelPaintResponse,
    AreaContributorSummary,
    ClaimAreaBounds,
    ClaimAreaListItem,
    ClaimAreaListResponse,
    ClaimOutlineSegment,
    ClaimOutlineWindow,
    AreaOwnerSummary,
    ClaimAreaSummary,
    WorldTileCoordinate,
    WorldPixelSummary,
    WorldPixelWindow,
)
from app.services.world import sync_world_growth

# Palette ids are persisted in world_pixels.color_id.
# Reordering or replacing existing ids changes historic art unless the data is migrated first.
TRANSPARENT_COLOR_ID = 31
PIXEL_PALETTE = [
    {"id": 0, "hex": "#000000", "name": "Black"},
    {"id": 1, "hex": "#3c3c3c", "name": "Dark Gray"},
    {"id": 2, "hex": "#787878", "name": "Gray"},
    {"id": 3, "hex": "#d2d2d2", "name": "Light Gray"},
    {"id": 4, "hex": "#ffffff", "name": "White"},
    {"id": 5, "hex": "#600018", "name": "Deep Red"},
    {"id": 6, "hex": "#ed1c24", "name": "Red"},
    {"id": 7, "hex": "#ff7f27", "name": "Orange"},
    {"id": 8, "hex": "#f6aa09", "name": "Gold"},
    {"id": 9, "hex": "#f9dd3b", "name": "Yellow"},
    {"id": 10, "hex": "#fffabc", "name": "Light Yellow"},
    {"id": 11, "hex": "#0eb968", "name": "Dark Green"},
    {"id": 12, "hex": "#13e67b", "name": "Green"},
    {"id": 13, "hex": "#87ff5e", "name": "Light Green"},
    {"id": 14, "hex": "#0c816e", "name": "Dark Teal"},
    {"id": 15, "hex": "#10ae82", "name": "Teal"},
    {"id": 16, "hex": "#13e1be", "name": "Light Teal"},
    {"id": 17, "hex": "#60f7f2", "name": "Cyan"},
    {"id": 18, "hex": "#28509e", "name": "Dark Blue"},
    {"id": 19, "hex": "#4093e4", "name": "Blue"},
    {"id": 20, "hex": "#6b50f6", "name": "Indigo"},
    {"id": 21, "hex": "#99b1fb", "name": "Light Indigo"},
    {"id": 22, "hex": "#780c99", "name": "Dark Purple"},
    {"id": 23, "hex": "#aa38b9", "name": "Purple"},
    {"id": 24, "hex": "#e09ff9", "name": "Light Purple"},
    {"id": 25, "hex": "#cb007a", "name": "Dark Pink"},
    {"id": 26, "hex": "#ec1f80", "name": "Pink"},
    {"id": 27, "hex": "#f38da9", "name": "Light Pink"},
    {"id": 28, "hex": "#684634", "name": "Dark Brown"},
    {"id": 29, "hex": "#95682a", "name": "Brown"},
    {"id": 30, "hex": "#f8b277", "name": "Beige"},
    {"id": 31, "hex": "transparent", "name": "Transparent"},
]
VALID_COLOR_IDS = {color["id"] for color in PIXEL_PALETTE}
MAX_VISIBLE_PIXELS = 50_000
MAX_CLAIM_OUTLINE_PIXELS = 100_000
WORLD_TILE_SIZE = 1000
WORLD_TILE_CACHE_DIR = Path(".tile-cache")
WORLD_TILE_CACHE_LAYER_PATHS = {
    "claims": Path("claims-access-v3"),
    "paint": Path("palette-v2") / "paint",
}
WORLD_TILE_LAYERS = {"claims", "paint"}
MAX_BATCH_CLAIM_PIXELS = 500_000
MAX_BATCH_PAINT_PIXELS = 20_000
CLAIM_EXISTING_QUERY_BATCH_SIZE = 10_000
CLAIM_INSERT_BATCH_SIZE = 10_000
PAINT_QUERY_BATCH_SIZE = 10_000
AREA_NAME_MAX_LENGTH = 80
AREA_DESCRIPTION_MAX_LENGTH = 1200
STARTER_FRONTIER_COORDINATES = [
    (0, 0),
]
CLAIM_TILE_OWNER_RGBA = (64, 208, 188, 30)
CLAIM_TILE_CONTRIBUTOR_RGBA = (255, 173, 92, 30)
CLAIM_TILE_BLOCKED_RGBA = (255, 104, 104, 24)
STARTER_TILE_FILL_RGBA = (255, 223, 122, 30)


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
    if color["hex"] != "transparent"
}


def get_world_tile_key(x: int, y: int) -> tuple[int, int]:
    return x // WORLD_TILE_SIZE, y // WORLD_TILE_SIZE


def get_world_tile_cache_dir(layer: str) -> Path:
    return WORLD_TILE_CACHE_DIR / WORLD_TILE_CACHE_LAYER_PATHS.get(layer, Path(layer))


def _get_claim_tile_viewer_cache_key(viewer: User | None) -> str:
    if viewer is None:
        return "anonymous"

    return f"user-{viewer.id.hex}"


def get_world_tile_cache_path(
    layer: str,
    tile_x: int,
    tile_y: int,
    viewer: User | None = None,
) -> Path:
    cache_dir = get_world_tile_cache_dir(layer)

    if layer == "claims":
        cache_dir = cache_dir / _get_claim_tile_viewer_cache_key(viewer)

    return cache_dir / f"{tile_x}_{tile_y}.png"


def get_world_tile_bounds(tile_x: int, tile_y: int) -> tuple[int, int, int, int]:
    min_x = tile_x * WORLD_TILE_SIZE
    min_y = tile_y * WORLD_TILE_SIZE
    return min_x, min_x + WORLD_TILE_SIZE - 1, min_y, min_y + WORLD_TILE_SIZE - 1


def get_world_tile_range(start: int, length: int) -> range:
    first = start // WORLD_TILE_SIZE
    last = (start + length - 1) // WORLD_TILE_SIZE
    return range(first, last + 1)


def invalidate_world_tile(tile_x: int, tile_y: int, layers: set[str] | None = None) -> None:
    invalidated_layers = layers or WORLD_TILE_LAYERS

    for layer in invalidated_layers:
        paths = [get_world_tile_cache_path(layer, tile_x, tile_y)]

        if layer == "claims":
            paths.extend(get_world_tile_cache_dir(layer).glob(f"*/{tile_x}_{tile_y}.png"))

        for path in paths:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                # A stale tile is acceptable; the next successful invalidation/request will refresh it.
                pass


def invalidate_world_tile_for_pixel(x: int, y: int, layers: set[str] | None = None) -> None:
    tile_x, tile_y = get_world_tile_key(x, y)
    invalidate_world_tile(tile_x, tile_y, layers)


def invalidate_world_tiles(
    tile_coordinates: set[tuple[int, int]],
    layers: set[str] | None = None,
) -> None:
    for tile_x, tile_y in tile_coordinates:
        invalidate_world_tile(tile_x, tile_y, layers)


async def warm_active_world_tile_cache(
    session: AsyncSession,
    layers: list[str] | None = None,
) -> tuple[int, int]:
    selected_layers = layers or sorted(WORLD_TILE_LAYERS)
    active_chunks = (
        await session.scalars(select(WorldChunk).where(WorldChunk.is_active.is_(True)))
    ).all()
    tile_coordinates: set[tuple[int, int]] = set()

    for chunk in active_chunks:
        for tile_x in get_world_tile_range(chunk.origin_x, chunk.width):
            for tile_y in get_world_tile_range(chunk.origin_y, chunk.height):
                tile_coordinates.add((tile_x, tile_y))

    sorted_tiles = sorted(tile_coordinates, key=lambda tile: (tile[1], tile[0]))

    for layer in selected_layers:
        for tile_x, tile_y in sorted_tiles:
            await ensure_world_tile_png(session, layer, tile_x, tile_y)

    return len(sorted_tiles), len(sorted_tiles) * len(selected_layers)


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
        viewer_relation=None,
        created_at=pixel.created_at,
        updated_at=pixel.updated_at,
    )


async def _get_viewer_contributor_area_ids(
    session: AsyncSession,
    viewer: User | None,
    area_ids: set[UUID],
) -> set[UUID]:
    if viewer is None or not area_ids:
        return set()

    result = await session.scalars(
        select(AreaContributor.area_id).where(
            AreaContributor.user_id == viewer.id,
            AreaContributor.area_id.in_(list(area_ids)),
        )
    )
    return set(result.all())


def _get_claim_viewer_relation(
    owner_user_id: UUID | None,
    area_id: UUID | None,
    is_starter: bool,
    viewer: User | None,
    contributor_area_ids: set[UUID],
) -> str | None:
    if is_starter:
        return "starter"

    if owner_user_id is None:
        return "unclaimed"

    if viewer is not None and owner_user_id == viewer.id:
        return "owner"

    if area_id is not None and area_id in contributor_area_ids:
        return "contributor"

    return "blocked"


def _get_pixel_viewer_relation(
    pixel: WorldPixel,
    viewer: User | None,
    contributor_area_ids: set[UUID],
) -> str | None:
    return _get_claim_viewer_relation(
        pixel.owner_user_id,
        pixel.area_id,
        pixel.is_starter,
        viewer,
        contributor_area_ids,
    )


def _get_claim_tile_rgba(
    owner_user_id: UUID | None,
    area_id: UUID | None,
    is_starter: bool,
    viewer: User | None,
    contributor_area_ids: set[UUID],
) -> tuple[int, int, int, int]:
    if is_starter:
        return STARTER_TILE_FILL_RGBA

    if viewer is not None and owner_user_id == viewer.id:
        return CLAIM_TILE_OWNER_RGBA

    if area_id is not None and area_id in contributor_area_ids:
        return CLAIM_TILE_CONTRIBUTOR_RGBA

    return CLAIM_TILE_BLOCKED_RGBA


def _get_claim_region_key(
    owner_user_id: UUID | None,
    area_id: UUID | None,
    is_starter: bool,
) -> str | None:
    if is_starter:
        return "starter"

    if area_id is not None:
        return f"area:{area_id}"

    if owner_user_id is not None:
        return f"owner:{owner_user_id}"

    return None


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
    viewer: User | None = None,
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
    visible_pixels = [pixel for pixel, _owner in visible_rows]
    contributor_area_ids = await _get_viewer_contributor_area_ids(
        session,
        viewer,
        {
            pixel.area_id
            for pixel in visible_pixels
            if pixel.area_id is not None
        },
    )

    return WorldPixelWindow(
        min_x=low_x,
        max_x=high_x,
        min_y=low_y,
        max_y=high_y,
        truncated=truncated,
        pixels=[
            build_world_pixel_summary(pixel, owner).model_copy(
                update={
                    "viewer_relation": _get_pixel_viewer_relation(
                        pixel,
                        viewer,
                        contributor_area_ids,
                    ),
                },
            )
            for pixel, owner in visible_rows
        ],
    )


async def get_claim_outline_pixels(
    session: AsyncSession,
    min_x: int,
    max_x: int,
    min_y: int,
    max_y: int,
    viewer: User | None = None,
) -> ClaimOutlineWindow:
    low_x, high_x = sorted((min_x, max_x))
    low_y, high_y = sorted((min_y, max_y))
    rows = (
        await session.execute(
            select(
                WorldPixel.x,
                WorldPixel.y,
                WorldPixel.owner_user_id,
                WorldPixel.area_id,
                WorldPixel.is_starter,
                WorldPixel.color_id,
            )
            .where(
                WorldPixel.x >= low_x,
                WorldPixel.x <= high_x,
                WorldPixel.y >= low_y,
                WorldPixel.y <= high_y,
                or_(WorldPixel.owner_user_id.is_not(None), WorldPixel.is_starter.is_(True)),
            )
            .order_by(WorldPixel.y, WorldPixel.x)
            .limit(MAX_CLAIM_OUTLINE_PIXELS + 1)
        )
    ).all()
    truncated = len(rows) > MAX_CLAIM_OUTLINE_PIXELS
    visible_rows = rows[:MAX_CLAIM_OUTLINE_PIXELS]
    contributor_area_ids = await _get_viewer_contributor_area_ids(
        session,
        viewer,
        {
            area_id
            for _x, _y, _owner_user_id, area_id, is_starter, _color_id in visible_rows
            if area_id is not None and not is_starter
        },
    )
    outline_pixels: dict[tuple[int, int], dict[str, object]] = {}

    for x, y, owner_user_id, area_id, is_starter, color_id in visible_rows:
        region_key = _get_claim_region_key(owner_user_id, area_id, bool(is_starter))

        if region_key is None:
            continue

        relation = _get_claim_viewer_relation(
            owner_user_id,
            area_id,
            bool(is_starter),
            viewer,
            contributor_area_ids,
        )
        status = relation if relation in {"owner", "contributor", "blocked", "starter"} else "blocked"
        outline_pixels[(x, y)] = {
            "region_key": region_key,
            "claim_visible": color_id is None,
            "status": status,
        }

    horizontal_edges: dict[tuple[str, int], list[tuple[int, int, str]]] = {}
    vertical_edges: dict[tuple[str, int], list[tuple[int, int, str]]] = {}

    def add_edge(
        target: dict[tuple[str, int], list[tuple[int, int, str]]],
        status: str,
        line: int,
        start: int,
        end: int,
    ) -> None:
        target.setdefault((status, line), []).append((start, end, status))

    for (x, y), state in outline_pixels.items():
        if not state["claim_visible"]:
            continue

        region_key = state["region_key"]
        status = str(state["status"])
        neighbors = (
            ("horizontal", y, x, x + 1, outline_pixels.get((x, y - 1))),
            ("horizontal", y + 1, x, x + 1, outline_pixels.get((x, y + 1))),
            ("vertical", x, y, y + 1, outline_pixels.get((x - 1, y))),
            ("vertical", x + 1, y, y + 1, outline_pixels.get((x + 1, y))),
        )

        for orientation, line, start, end, neighbor in neighbors:
            if neighbor is not None and neighbor["region_key"] == region_key:
                continue

            add_edge(
                horizontal_edges if orientation == "horizontal" else vertical_edges,
                status,
                line,
                start,
                end,
            )

    def build_segments(
        orientation: str,
        edges_by_line: dict[tuple[str, int], list[tuple[int, int, str]]],
    ) -> list[ClaimOutlineSegment]:
        segments: list[ClaimOutlineSegment] = []

        for (status, line), edges in edges_by_line.items():
            edges.sort(key=lambda edge: edge[0])
            current_start: int | None = None
            current_end: int | None = None

            for start, end, _status in edges:
                if current_start is not None and current_end == start:
                    current_end = end
                    continue

                if current_start is not None and current_end is not None:
                    segments.append(
                        ClaimOutlineSegment(
                            orientation=orientation,
                            line=line,
                            start=current_start,
                            end=current_end,
                            status=status,
                        )
                    )

                current_start = start
                current_end = end

            if current_start is not None and current_end is not None:
                segments.append(
                    ClaimOutlineSegment(
                        orientation=orientation,
                        line=line,
                        start=current_start,
                        end=current_end,
                        status=status,
                    )
                )

        return segments

    return ClaimOutlineWindow(
        min_x=low_x,
        max_x=high_x,
        min_y=low_y,
        max_y=high_y,
        truncated=truncated,
        segments=[
            *build_segments("horizontal", horizontal_edges),
            *build_segments("vertical", vertical_edges),
        ],
    )


async def ensure_world_tile_png(
    session: AsyncSession,
    layer: str,
    tile_x: int,
    tile_y: int,
    viewer: User | None = None,
) -> Path:
    if layer not in WORLD_TILE_LAYERS:
        raise WorldTileError("Unknown world tile layer.", 404)

    tile_path = get_world_tile_cache_path(layer, tile_x, tile_y, viewer)
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
            select(
                WorldPixel.x,
                WorldPixel.y,
                WorldPixel.owner_user_id,
                WorldPixel.area_id,
                WorldPixel.is_starter,
                WorldPixel.color_id,
            )
            .where(
                WorldPixel.x >= min_x,
                WorldPixel.x <= max_x,
                WorldPixel.y >= min_y,
                WorldPixel.y <= max_y,
                WorldPixel.color_id.is_(None),
                or_(WorldPixel.owner_user_id.is_not(None), WorldPixel.is_starter.is_(True)),
            )
        )
        image = Image.new("RGBA", (WORLD_TILE_SIZE, WORLD_TILE_SIZE), (0, 0, 0, 0))
        pixels = image.load()
        rows = result.all()
        contributor_area_ids = await _get_viewer_contributor_area_ids(
            session,
            viewer,
            {
                area_id
                for _x, _y, _owner_user_id, area_id, is_starter, _color_id in rows
                if area_id is not None and not is_starter
            },
        )

        for x, y, owner_user_id, area_id, is_starter, _color_id in rows:
            if owner_user_id is None and not is_starter:
                continue

            pixels[x - min_x, y - min_y] = _get_claim_tile_rgba(
                owner_user_id,
                area_id,
                bool(is_starter),
                viewer,
                contributor_area_ids,
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


def _normalize_claim_rectangles(
    rectangles: list[tuple[int, int, int, int]] | None,
) -> list[tuple[int, int, int, int]]:
    normalized_rectangles: list[tuple[int, int, int, int]] = []

    for rectangle in rectangles or []:
        min_x, max_x, min_y, max_y = rectangle
        normalized_rectangles.append(
            (
                min(min_x, max_x),
                max(min_x, max_x),
                min(min_y, max_y),
                max(min_y, max_y),
            )
        )

    return normalized_rectangles


def _normalize_batch_pixels(
    pixels: list[tuple[int, int]] | None,
    rectangles: list[tuple[int, int, int, int]] | None = None,
) -> list[tuple[int, int]]:
    unique_pixels: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()

    for pixel in pixels or []:
        if pixel in seen:
            continue

        seen.add(pixel)
        unique_pixels.append(pixel)

    for min_x, max_x, min_y, max_y in _normalize_claim_rectangles(rectangles):
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                pixel = (x, y)
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


def _iter_coordinate_chunks(
    coordinates: list[tuple[int, int]],
    chunk_size: int,
) -> Iterator[list[tuple[int, int]]]:
    for index in range(0, len(coordinates), chunk_size):
        yield coordinates[index:index + chunk_size]


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


async def _get_active_world_chunk_coordinates(session: AsyncSession) -> set[tuple[int, int]]:
    result = await session.execute(
        select(WorldChunk.chunk_x, WorldChunk.chunk_y).where(WorldChunk.is_active.is_(True))
    )
    return {(chunk_x, chunk_y) for chunk_x, chunk_y in result.all()}


def _validate_pixels_inside_active_world(
    pixels: list[tuple[int, int]],
    active_chunk_coordinates: set[tuple[int, int]],
    settings: Settings,
) -> None:
    for x, y in pixels:
        if get_chunk_coordinates_for_pixel(x, y, settings) not in active_chunk_coordinates:
            raise PixelPlacementError("Selected pixel is outside the active world.", 422)


def _get_tile_coordinates_for_pixels(
    pixels: list[tuple[int, int]],
) -> set[tuple[int, int]]:
    return {get_world_tile_key(x, y) for x, y in pixels}


def _get_tile_coordinates_for_bounds(
    min_x: int,
    max_x: int,
    min_y: int,
    max_y: int,
) -> set[tuple[int, int]]:
    return {
        (tile_x, tile_y)
        for tile_x in range(min_x // WORLD_TILE_SIZE, max_x // WORLD_TILE_SIZE + 1)
        for tile_y in range(min_y // WORLD_TILE_SIZE, max_y // WORLD_TILE_SIZE + 1)
    }


async def _get_claim_tile_coordinates_for_area(
    session: AsyncSession,
    area_id: UUID,
) -> set[tuple[int, int]]:
    bounds = (
        await session.execute(
            select(
                func.min(WorldPixel.x),
                func.max(WorldPixel.x),
                func.min(WorldPixel.y),
                func.max(WorldPixel.y),
            ).where(
                WorldPixel.area_id == area_id,
                WorldPixel.color_id.is_(None),
            )
        )
    ).one()
    min_x, max_x, min_y, max_y = bounds

    if min_x is None or max_x is None or min_y is None or max_y is None:
        return set()

    return _get_tile_coordinates_for_bounds(min_x, max_x, min_y, max_y)


def _parse_tile_pixel_key(key: str) -> tuple[int, int]:
    compact = key.strip()

    if ":" in compact:
        raw_x, raw_y = compact.split(":", 1)
        return int(raw_x), int(raw_y)

    if "," in compact:
        raw_x, raw_y = compact.split(",", 1)
        return int(raw_x), int(raw_y)

    offset = int(compact)
    return offset % WORLD_TILE_SIZE, offset // WORLD_TILE_SIZE


def _normalize_paint_tiles(
    tiles: list[tuple[int, int, dict[str, int]]] | None,
) -> dict[tuple[int, int], int | None]:
    normalized_pixels: dict[tuple[int, int], int | None] = {}

    for tile_x, tile_y, pixels in tiles or []:
        for pixel_key, color_id in pixels.items():
            try:
                local_x, local_y = _parse_tile_pixel_key(pixel_key)
            except (TypeError, ValueError) as error:
                raise PixelPlacementError("Paint tile pixel keys must be numeric offsets or x:y pairs.", 422) from error

            if local_x < 0 or local_x >= WORLD_TILE_SIZE or local_y < 0 or local_y >= WORLD_TILE_SIZE:
                raise PixelPlacementError("Paint tile pixel coordinates are outside the tile.", 422)

            if color_id not in VALID_COLOR_IDS:
                raise PixelPlacementError("Invalid palette color.", 422)

            normalized_pixels[
                (tile_x * WORLD_TILE_SIZE + local_x, tile_y * WORLD_TILE_SIZE + local_y)
            ] = None if color_id == TRANSPARENT_COLOR_ID else color_id

    if not normalized_pixels:
        raise PixelPlacementError("No paint pixels were submitted.", 422)

    if len(normalized_pixels) > MAX_BATCH_PAINT_PIXELS:
        raise PixelPlacementError(
            f"Paint batches are limited to {MAX_BATCH_PAINT_PIXELS} pixels.",
            413,
        )

    return normalized_pixels


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


async def _get_existing_pixels_map_at(
    session: AsyncSession,
    coordinates: list[tuple[int, int]],
) -> dict[tuple[int, int], WorldPixel]:
    pixels: dict[tuple[int, int], WorldPixel] = {}

    for coordinate_chunk in _iter_coordinate_chunks(coordinates, PAINT_QUERY_BATCH_SIZE):
        result = await session.scalars(
            select(WorldPixel).where(tuple_(WorldPixel.x, WorldPixel.y).in_(coordinate_chunk))
        )

        for pixel in result.all():
            pixels[(pixel.x, pixel.y)] = pixel

    return pixels


async def _has_existing_pixels_at(
    session: AsyncSession,
    coordinates: list[tuple[int, int]],
) -> bool:
    for coordinate_chunk in _iter_coordinate_chunks(coordinates, CLAIM_EXISTING_QUERY_BATCH_SIZE):
        result = await session.scalar(
            select(WorldPixel.id)
            .where(tuple_(WorldPixel.x, WorldPixel.y).in_(coordinate_chunk))
            .limit(1)
        )
        if result is not None:
            return True

    return False


async def _bulk_insert_claimed_pixels(
    session: AsyncSession,
    user: User,
    area: ClaimArea,
    pixels: list[tuple[int, int]],
    settings: Settings,
) -> None:
    for coordinate_chunk in _iter_coordinate_chunks(pixels, CLAIM_INSERT_BATCH_SIZE):
        rows = []

        for x, y in coordinate_chunk:
            chunk_x, chunk_y = get_chunk_coordinates_for_pixel(x, y, settings)
            rows.append(
                {
                    "id": uuid4(),
                    "x": x,
                    "y": y,
                    "chunk_x": chunk_x,
                    "chunk_y": chunk_y,
                    "color_id": None,
                    "owner_user_id": user.id,
                    "area_id": area.id,
                    "is_starter": False,
                }
            )

        await session.execute(insert(WorldPixel), rows)


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
    claim_area_limit: int,
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

    owned_area_count = int(
        await session.scalar(
            select(func.count(ClaimArea.id)).where(ClaimArea.owner_user_id == user.id)
        )
        or 0
    )
    effective_area_limit = max(1, claim_area_limit)

    if owned_area_count >= effective_area_limit:
        raise PixelPlacementError(
            "You have reached your current claim area limit. Expand your existing territory until more area slots unlock.",
            409,
        )

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


async def list_owned_claim_areas(
    session: AsyncSession,
    user: User,
) -> ClaimAreaListResponse:
    contributor_counts = (
        select(
            AreaContributor.area_id.label("area_id"),
            func.count(AreaContributor.id).label("contributor_count"),
        )
        .group_by(AreaContributor.area_id)
        .subquery()
    )
    pixel_bounds = (
        select(
            WorldPixel.area_id.label("area_id"),
            func.min(WorldPixel.x).label("min_x"),
            func.max(WorldPixel.x).label("max_x"),
            func.min(WorldPixel.y).label("min_y"),
            func.max(WorldPixel.y).label("max_y"),
        )
        .where(WorldPixel.area_id.is_not(None))
        .group_by(WorldPixel.area_id)
        .subquery()
    )
    rows = await session.execute(
        select(
            ClaimArea,
            pixel_bounds.c.min_x,
            pixel_bounds.c.max_x,
            pixel_bounds.c.min_y,
            pixel_bounds.c.max_y,
            func.coalesce(contributor_counts.c.contributor_count, 0),
        )
        .join(pixel_bounds, pixel_bounds.c.area_id == ClaimArea.id)
        .outerjoin(contributor_counts, contributor_counts.c.area_id == ClaimArea.id)
        .where(ClaimArea.owner_user_id == user.id)
        .order_by(ClaimArea.last_activity_at.desc(), ClaimArea.created_at.desc())
    )
    areas: list[ClaimAreaListItem] = []

    for area, min_x, max_x, min_y, max_y, contributor_count in rows.all():
        resolved_min_x = int(min_x)
        resolved_max_x = int(max_x)
        resolved_min_y = int(min_y)
        resolved_max_y = int(max_y)
        width = resolved_max_x - resolved_min_x + 1
        height = resolved_max_y - resolved_min_y + 1

        areas.append(
            ClaimAreaListItem(
                id=area.id,
                name=area.name,
                description=area.description,
                claimed_pixels_count=area.claimed_pixels_count,
                painted_pixels_count=area.painted_pixels_count,
                contributor_count=int(contributor_count or 0),
                bounds=ClaimAreaBounds(
                    min_x=resolved_min_x,
                    max_x=resolved_max_x,
                    min_y=resolved_min_y,
                    max_y=resolved_max_y,
                    width=width,
                    height=height,
                    center_x=resolved_min_x + width / 2,
                    center_y=resolved_min_y + height / 2,
                ),
                created_at=area.created_at,
                updated_at=area.updated_at,
                last_activity_at=area.last_activity_at,
            )
        )

    return ClaimAreaListResponse(areas=areas)


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
        tile_coordinates = await _get_claim_tile_coordinates_for_area(session, area.id)
        session.add(
            AreaContributor(
                area_id=area.id,
                user_id=contributor.id,
                invited_by_user_id=owner.id,
            )
        )
        await session.commit()
        invalidate_world_tiles(tile_coordinates, {"claims"})

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
    pixel = await session.scalar(select(WorldPixel).where(WorldPixel.x == x, WorldPixel.y == y))

    if pixel is None:
        raise PixelPlacementError("Pixel claim could not be loaded after saving.", 500)

    return PixelClaimResponse(
        pixel=build_world_pixel_summary(pixel, user).model_copy(update={"viewer_relation": "owner"}),
        user=batch.user,
    )


async def claim_world_pixels(
    session: AsyncSession,
    user: User,
    pixels: list[tuple[int, int]] | None,
    settings: Settings | None = None,
    rectangles: list[tuple[int, int, int, int]] | None = None,
) -> PixelBatchClaimResponse:
    resolved_settings = settings or get_settings()
    now = datetime.now(timezone.utc)
    normalized_pixels = _normalize_batch_pixels(pixels, rectangles)

    _validate_connected_pixels(normalized_pixels)
    active_chunk_coordinates = await _get_active_world_chunk_coordinates(session)
    _validate_pixels_inside_active_world(normalized_pixels, active_chunk_coordinates, resolved_settings)

    if await _has_existing_pixels_at(session, normalized_pixels):
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

    area = await _resolve_target_area_for_claim(
        session,
        user,
        adjacent_pixels,
        now,
        user.claim_area_limit,
    )
    claimed_count = len(normalized_pixels)

    await _bulk_insert_claimed_pixels(
        session,
        user,
        area,
        normalized_pixels,
        resolved_settings,
    )

    area.claimed_pixels_count += claimed_count
    area.last_activity_at = now
    user.holders_placed_total += claimed_count
    user.claimed_pixels_count += claimed_count

    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise PixelPlacementError("This claim conflicts with a recent claim. Try again.", 409) from error

    tile_coordinates = _get_tile_coordinates_for_pixels(normalized_pixels)
    invalidate_world_tiles(tile_coordinates, {"claims"})
    await session.refresh(area)
    await session.refresh(user)
    await sync_world_growth(session, resolved_settings)

    return PixelBatchClaimResponse(
        pixels=[],
        user=build_auth_user_summary(user, resolved_settings),
        area=await build_claim_area_summary(session, area, user, user),
        claimed_count=claimed_count,
        returned_pixel_count=0,
        claim_tiles=[
            WorldTileCoordinate(tile_x=tile_x, tile_y=tile_y)
            for tile_x, tile_y in sorted(tile_coordinates, key=lambda tile: (tile[1], tile[0]))
        ],
    )


async def paint_world_pixels(
    session: AsyncSession,
    user: User,
    tiles: list[tuple[int, int, dict[str, int]]] | None,
    settings: Settings | None = None,
) -> PixelBatchPaintResponse:
    resolved_settings = settings or get_settings()
    now = datetime.now(timezone.utc)
    requested_pixels = _normalize_paint_tiles(tiles)
    coordinates = list(requested_pixels.keys())

    active_chunk_coordinates = await _get_active_world_chunk_coordinates(session)
    _validate_pixels_inside_active_world(coordinates, active_chunk_coordinates, resolved_settings)

    existing_pixels = await _get_existing_pixels_map_at(session, coordinates)
    if len(existing_pixels) != len(coordinates):
        raise PixelPlacementError("This paint batch includes territory that is not claimed yet.", 422)

    area_ids = {
        pixel.area_id
        for pixel in existing_pixels.values()
        if pixel.area_id is not None
    }
    contributor_area_ids = await _get_viewer_contributor_area_ids(session, user, area_ids)
    area_map: dict[UUID, ClaimArea] = {}

    if area_ids:
        areas = (
            await session.scalars(select(ClaimArea).where(ClaimArea.id.in_(list(area_ids))))
        ).all()
        area_map = {area.id: area for area in areas}

    changes: list[tuple[WorldPixel, int | None, int | None]] = []

    for coordinate, next_color_id in requested_pixels.items():
        pixel = existing_pixels[coordinate]

        if pixel.owner_user_id is None or pixel.is_starter:
            raise PixelPlacementError("This paint batch includes territory that is not claimed yet.", 422)

        if (
            pixel.owner_user_id != user.id
            and (pixel.area_id is None or pixel.area_id not in contributor_area_ids)
        ):
            raise PixelPlacementError("You can only paint inside owned or contributed areas.", 403)

        if pixel.color_id == next_color_id:
            continue

        changes.append((pixel, pixel.color_id, next_color_id))

    await apply_normal_pixel_regeneration(session, user, resolved_settings, now)

    if changes:
        try:
            await spend_normal_pixels(session, user, len(changes), resolved_settings, now)
        except UserStateError as error:
            raise PixelPlacementError(error.detail, error.status_code) from error

    paint_tile_coordinates = _get_tile_coordinates_for_pixels(
        [(pixel.x, pixel.y) for pixel, _previous_color_id, _next_color_id in changes]
    )
    claim_tile_coordinates = _get_tile_coordinates_for_pixels(
        [
            (pixel.x, pixel.y)
            for pixel, previous_color_id, next_color_id in changes
            if (previous_color_id is None) != (next_color_id is None)
        ]
    )

    for pixel, previous_color_id, next_color_id in changes:
        pixel.color_id = next_color_id

        if pixel.area_id is None:
            continue

        area = area_map.get(pixel.area_id)
        if area is None:
            continue

        if previous_color_id is None and next_color_id is not None:
            area.painted_pixels_count += 1
        elif previous_color_id is not None and next_color_id is None:
            area.painted_pixels_count = max(0, area.painted_pixels_count - 1)

        area.last_activity_at = now

    await session.commit()

    if paint_tile_coordinates:
        invalidate_world_tiles(paint_tile_coordinates, {"paint"})

    if claim_tile_coordinates:
        invalidate_world_tiles(claim_tile_coordinates, {"claims"})

    await session.refresh(user)

    return PixelBatchPaintResponse(
        user=build_auth_user_summary(user, resolved_settings),
        painted_count=len(changes),
        paint_tiles=[
            WorldTileCoordinate(tile_x=tile_x, tile_y=tile_y)
            for tile_x, tile_y in sorted(paint_tile_coordinates, key=lambda tile: (tile[1], tile[0]))
        ],
        claim_tiles=[
            WorldTileCoordinate(tile_x=tile_x, tile_y=tile_y)
            for tile_x, tile_y in sorted(claim_tile_coordinates, key=lambda tile: (tile[1], tile[0]))
        ],
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
    now = datetime.now(timezone.utc)

    if color_id not in VALID_COLOR_IDS:
        raise PixelPlacementError("Invalid palette color.", 422)

    normalized_color_id = None if color_id == TRANSPARENT_COLOR_ID else color_id

    await _validate_inside_active_world(session, x, y)

    pixel = await session.scalar(select(WorldPixel).where(WorldPixel.x == x, WorldPixel.y == y))
    if pixel is None or pixel.owner_user_id is None or pixel.is_starter:
        raise PixelPlacementError("This pixel is not claimed yet.", 422)

    area = await session.get(ClaimArea, pixel.area_id) if pixel.area_id is not None else None
    owner = user if pixel.owner_user_id == user.id else await session.get(User, pixel.owner_user_id)

    if pixel.owner_user_id != user.id and not await _user_can_paint_area(session, user, area):
        raise PixelPlacementError("You can only paint inside owned or contributed areas.", 403)

    previous_color_id = pixel.color_id
    await apply_normal_pixel_regeneration(session, user, resolved_settings, now)

    if previous_color_id == normalized_color_id:
        await session.commit()
        await session.refresh(user)
        return PixelPaintResponse(
            pixel=build_world_pixel_summary(pixel, owner),
            user=build_auth_user_summary(user, resolved_settings),
        )

    try:
        await spend_normal_pixels(session, user, 1, resolved_settings, now)
    except UserStateError as error:
        raise PixelPlacementError(error.detail, error.status_code) from error

    pixel.color_id = normalized_color_id

    if area is not None:
        if previous_color_id is None and normalized_color_id is not None:
            area.painted_pixels_count += 1
        elif previous_color_id is not None and normalized_color_id is None:
            area.painted_pixels_count = max(0, area.painted_pixels_count - 1)
        area.last_activity_at = now

    await session.commit()
    dirty_layers = {"paint"}

    if (previous_color_id is None) != (normalized_color_id is None):
        dirty_layers.add("claims")

    invalidate_world_tile_for_pixel(x, y, dirty_layers)
    await session.refresh(pixel)
    await session.refresh(user)

    return PixelPaintResponse(
        pixel=build_world_pixel_summary(pixel, owner),
        user=build_auth_user_summary(user, resolved_settings),
    )
