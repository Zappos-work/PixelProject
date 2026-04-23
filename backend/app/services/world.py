from math import ceil

from sqlalchemy import func, select, text, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.world_chunk import WorldChunk
from app.models.world_pixel import WorldPixel
from app.schemas.world import (
    Point,
    WorldBounds,
    WorldChunkSummary,
    WorldGrowthProgress,
    WorldLandmark,
    WorldOverview,
)

ORIGIN_CHUNK = (0, 0)
MAX_GROWTH_STAGE_GUARD = 256
MIN_EXPANSION_CLAIM_FILL_RATIO = 0.01

CHUNK_LABELS = {
    (0, 0): "Origin Anchor",
}

LANDMARK_BLUEPRINTS = [
    {
        "id": "origin-beacon",
        "name": "Origin Beacon",
        "kind": "anchor",
        "description": "The first visible anchor for the shared world and future growth route.",
        "chunk_x": 0,
        "chunk_y": 0,
        "offset_x": 0.5,
        "offset_y": 0.5,
        "tone": "teal",
    },
]


def chunk_origin(chunk_x: int, chunk_y: int, settings: Settings | None = None) -> tuple[int, int]:
    resolved_settings = settings or get_settings()
    origin_x = resolved_settings.world_origin_x + chunk_x * resolved_settings.world_chunk_size
    origin_y = resolved_settings.world_origin_y + chunk_y * resolved_settings.world_chunk_size
    return origin_x, origin_y


def get_growth_shape(stage: int) -> set[tuple[int, int]]:
    if stage <= 0:
        return {ORIGIN_CHUNK}

    radius = (stage + 1) // 2

    if stage % 2 == 1:
        return {
            (chunk_x, chunk_y)
            for chunk_x in range(-radius, radius + 1)
            for chunk_y in range(-radius, radius + 1)
            if abs(chunk_x) + abs(chunk_y) <= radius
        }

    return {
        (chunk_x, chunk_y)
        for chunk_x in range(-radius, radius + 1)
        for chunk_y in range(-radius, radius + 1)
    }


def get_required_growth_stage(coordinates: set[tuple[int, int]]) -> int:
    if not coordinates:
        return 0

    for stage in range(MAX_GROWTH_STAGE_GUARD + 1):
        if coordinates.issubset(get_growth_shape(stage)):
            return stage

    raise ValueError("World growth stage guard exceeded.")


def get_chunk_role(chunk_x: int, chunk_y: int) -> str:
    if chunk_x == 0 and chunk_y == 0:
        return "origin"

    if abs(chunk_x) + abs(chunk_y) == max(abs(chunk_x), abs(chunk_y)):
        return "axis-growth"

    return "growth"


async def ensure_origin_chunk(session: AsyncSession) -> WorldChunk:
    settings = get_settings()

    existing_chunk = await session.scalar(
        select(WorldChunk).where(WorldChunk.chunk_x == 0, WorldChunk.chunk_y == 0)
    )
    origin_x, origin_y = chunk_origin(0, 0, settings)

    if existing_chunk is not None:
        existing_chunk.origin_x = origin_x
        existing_chunk.origin_y = origin_y
        existing_chunk.width = settings.world_chunk_size
        existing_chunk.height = settings.world_chunk_size
        existing_chunk.is_active = True
        await session.commit()
        await session.refresh(existing_chunk)
        return existing_chunk

    origin_chunk = WorldChunk(
        chunk_x=0,
        chunk_y=0,
        origin_x=origin_x,
        origin_y=origin_y,
        width=settings.world_chunk_size,
        height=settings.world_chunk_size,
        is_active=True,
    )
    session.add(origin_chunk)
    await session.commit()
    await session.refresh(origin_chunk)
    return origin_chunk


async def sync_pixel_chunk_coordinates(
    session: AsyncSession,
    settings: Settings | None = None,
) -> None:
    resolved_settings = settings or get_settings()
    await session.execute(
        text(
            """
            UPDATE world_pixels
            SET
                chunk_x = FLOOR(((x - :origin_x)::numeric / :chunk_size))::integer,
                chunk_y = FLOOR(((y - :origin_y)::numeric / :chunk_size))::integer
            WHERE
                chunk_x IS DISTINCT FROM FLOOR(((x - :origin_x)::numeric / :chunk_size))::integer
                OR chunk_y IS DISTINCT FROM FLOOR(((y - :origin_y)::numeric / :chunk_size))::integer
            """
        ),
        {
            "origin_x": resolved_settings.world_origin_x,
            "origin_y": resolved_settings.world_origin_y,
            "chunk_size": resolved_settings.world_chunk_size,
        },
    )


async def get_claimed_chunk_coordinates(session: AsyncSession) -> set[tuple[int, int]]:
    result = await session.execute(
        select(WorldChunk.chunk_x, WorldChunk.chunk_y).where(WorldChunk.claimed_pixels_count > 0)
    )
    return {(chunk_x, chunk_y) for chunk_x, chunk_y in result.all()}


async def count_claimed_pixels_in_shape(
    session: AsyncSession,
    coordinates: set[tuple[int, int]],
) -> int:
    if not coordinates:
        return 0

    return await session.scalar(
        select(func.coalesce(func.sum(WorldChunk.claimed_pixels_count), 0)).where(
            tuple_(WorldChunk.chunk_x, WorldChunk.chunk_y).in_(sorted(coordinates)),
        )
    ) or 0


async def count_painted_pixels_in_shape(
    session: AsyncSession,
    coordinates: set[tuple[int, int]],
) -> int:
    if not coordinates:
        return 0

    return await session.scalar(
        select(func.count(WorldPixel.id)).where(
            tuple_(WorldPixel.chunk_x, WorldPixel.chunk_y).in_(sorted(coordinates)),
            WorldPixel.owner_user_id.is_not(None),
            WorldPixel.is_starter.is_(False),
            WorldPixel.color_id.is_not(None),
        )
    ) or 0


async def get_fill_growth_stage(session: AsyncSession, settings: Settings) -> int:
    fill_ratio = max(
        MIN_EXPANSION_CLAIM_FILL_RATIO,
        min(1.0, settings.world_expansion_claim_fill_ratio),
    )
    stage = 0

    while stage < MAX_GROWTH_STAGE_GUARD:
        shape = get_growth_shape(stage)
        painted_pixels = await count_painted_pixels_in_shape(session, shape)
        capacity = len(shape) * settings.world_chunk_size * settings.world_chunk_size

        if capacity <= 0 or painted_pixels / capacity < fill_ratio:
            break

        stage += 1

    return stage


async def build_growth_progress(
    session: AsyncSession,
    active_coordinates: set[tuple[int, int]],
    settings: Settings,
) -> WorldGrowthProgress:
    active_internal_stage = get_required_growth_stage(active_coordinates)
    fill_ratio = max(
        MIN_EXPANSION_CLAIM_FILL_RATIO,
        min(1.0, settings.world_expansion_claim_fill_ratio),
    )
    internal_stage = await get_fill_growth_stage(session, settings)
    current_shape = get_growth_shape(internal_stage)
    next_shape = get_growth_shape(internal_stage + 1)
    capacity = len(current_shape) * settings.world_chunk_size * settings.world_chunk_size
    required_pixels = ceil(capacity * fill_ratio)
    painted_pixels = await count_painted_pixels_in_shape(session, current_shape)
    remaining_pixels = max(0, required_pixels - painted_pixels)
    filled_percent = 0.0 if capacity <= 0 else min(100.0, painted_pixels / capacity * 100)
    progress_percent = filled_percent
    remaining_percent = 0.0 if capacity <= 0 else max(0.0, fill_ratio * 100 - filled_percent)

    return WorldGrowthProgress(
        stage=internal_stage + 1,
        next_stage=internal_stage + 2,
        active_stage=active_internal_stage + 1,
        active_chunks=len(active_coordinates),
        current_chunks=len(current_shape),
        next_stage_chunks=len(next_shape),
        capacity_pixels=capacity,
        painted_pixels=painted_pixels,
        claimed_pixels=painted_pixels,
        required_pixels=required_pixels,
        remaining_pixels=remaining_pixels,
        filled_percent=round(filled_percent, 2),
        expansion_threshold_percent=round(fill_ratio * 100, 2),
        progress_percent=round(progress_percent, 2),
        remaining_percent=round(remaining_percent, 2),
        fill_ratio=fill_ratio,
    )


async def refresh_world_chunk_claim_counts(session: AsyncSession) -> None:
    await session.execute(text("UPDATE world_chunks SET claimed_pixels_count = 0"))
    await session.execute(
        text(
            """
            WITH counts AS (
                SELECT chunk_x, chunk_y, COUNT(*)::integer AS claimed_count
                FROM world_pixels
                WHERE owner_user_id IS NOT NULL
                  AND is_starter IS FALSE
                GROUP BY chunk_x, chunk_y
            )
            UPDATE world_chunks
            SET claimed_pixels_count = counts.claimed_count
            FROM counts
            WHERE world_chunks.chunk_x = counts.chunk_x
              AND world_chunks.chunk_y = counts.chunk_y
            """
        )
    )


async def sync_world_growth(
    session: AsyncSession,
    settings: Settings | None = None,
    *,
    sync_pixels: bool = False,
) -> int:
    resolved_settings = settings or get_settings()
    chunk_size = resolved_settings.world_chunk_size

    if sync_pixels:
        await sync_pixel_chunk_coordinates(session, resolved_settings)
        await refresh_world_chunk_claim_counts(session)

    stage = await get_fill_growth_stage(session, resolved_settings)

    active_coordinates = get_growth_shape(stage)
    result = await session.scalars(select(WorldChunk))
    chunks = result.all()
    existing_by_coordinate = {(chunk.chunk_x, chunk.chunk_y): chunk for chunk in chunks}

    for coordinate, chunk in existing_by_coordinate.items():
        origin_x, origin_y = chunk_origin(chunk.chunk_x, chunk.chunk_y, resolved_settings)
        chunk.origin_x = origin_x
        chunk.origin_y = origin_y
        chunk.width = chunk_size
        chunk.height = chunk_size
        chunk.is_active = coordinate in active_coordinates

    for chunk_x, chunk_y in sorted(active_coordinates):
        if (chunk_x, chunk_y) in existing_by_coordinate:
            continue

        origin_x, origin_y = chunk_origin(chunk_x, chunk_y, resolved_settings)
        session.add(
            WorldChunk(
                chunk_x=chunk_x,
                chunk_y=chunk_y,
                origin_x=origin_x,
                origin_y=origin_y,
                width=chunk_size,
                height=chunk_size,
                is_active=True,
            )
        )

    await session.commit()
    return stage


async def ensure_initial_chunks(session: AsyncSession) -> None:
    await ensure_origin_chunk(session)


async def get_world_overview(session: AsyncSession) -> WorldOverview:
    settings = get_settings()

    result = await session.scalars(select(WorldChunk).order_by(WorldChunk.chunk_y.desc(), WorldChunk.chunk_x))
    chunks = result.all()
    active_chunks = [chunk for chunk in chunks if chunk.is_active]

    if not active_chunks:
        await ensure_origin_chunk(session)
        result = await session.scalars(select(WorldChunk).order_by(WorldChunk.chunk_y.desc(), WorldChunk.chunk_x))
        chunks = result.all()
        active_chunks = [chunk for chunk in chunks if chunk.is_active]

    min_chunk_x = min(chunk.chunk_x for chunk in active_chunks)
    max_chunk_x = max(chunk.chunk_x for chunk in active_chunks)
    min_chunk_y = min(chunk.chunk_y for chunk in active_chunks)
    max_chunk_y = max(chunk.chunk_y for chunk in active_chunks)
    active_coordinates = {(chunk.chunk_x, chunk.chunk_y) for chunk in active_chunks}
    growth_progress = await build_growth_progress(session, active_coordinates, settings)

    chunk_summaries = [
        WorldChunkSummary(
            id=chunk.id,
            chunk_x=chunk.chunk_x,
            chunk_y=chunk.chunk_y,
            origin_x=chunk.origin_x,
            origin_y=chunk.origin_y,
            width=chunk.width,
            height=chunk.height,
            is_active=chunk.is_active,
            created_at=chunk.created_at,
            label=CHUNK_LABELS.get((chunk.chunk_x, chunk.chunk_y), f"Chunk {chunk.chunk_x}:{chunk.chunk_y}"),
            role=get_chunk_role(chunk.chunk_x, chunk.chunk_y),
        )
        for chunk in chunks
    ]

    landmarks = [WorldLandmark.model_validate(blueprint) for blueprint in LANDMARK_BLUEPRINTS]

    return WorldOverview(
        origin=Point(x=settings.world_origin_x, y=settings.world_origin_y),
        chunk_size=settings.world_chunk_size,
        expansion_buffer=settings.world_expansion_buffer,
        chunk_count=len(active_chunks),
        bounds=WorldBounds(
            min_chunk_x=min_chunk_x,
            max_chunk_x=max_chunk_x,
            min_chunk_y=min_chunk_y,
            max_chunk_y=max_chunk_y,
            min_world_x=min(chunk.origin_x for chunk in active_chunks),
            max_world_x=max(chunk.origin_x + chunk.width for chunk in active_chunks),
            min_world_y=min(chunk.origin_y for chunk in active_chunks),
            max_world_y=max(chunk.origin_y + chunk.height for chunk in active_chunks),
        ),
        growth=growth_progress,
        chunks=chunk_summaries,
        landmarks=landmarks,
    )
