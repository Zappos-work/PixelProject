from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.world_chunk import WorldChunk
from app.schemas.world import Point, WorldBounds, WorldChunkSummary, WorldLandmark, WorldOverview

STARTER_CHUNK_COORDINATES = [
    (-1, -1),
    (0, -1),
    (1, -1),
    (-1, 0),
    (0, 0),
    (1, 0),
    (-1, 1),
    (0, 1),
    (1, 1),
]

CHUNK_LABELS = {
    (-1, -1): "Southwest Verge",
    (0, -1): "South Gate",
    (1, -1): "Saffron Reach",
    (-1, 0): "West Arcade",
    (0, 0): "Origin Anchor",
    (1, 0): "East Relay",
    (-1, 1): "Pine Frontier",
    (0, 1): "North Watch",
    (1, 1): "Amber Rise",
}

LANDMARK_BLUEPRINTS = [
    {
        "id": "origin-beacon",
        "name": "Origin Beacon",
        "kind": "anchor",
        "description": "The first visible anchor for the shared world and future starter claim route.",
        "chunk_x": 0,
        "chunk_y": 0,
        "offset_x": 0.38,
        "offset_y": 0.42,
        "tone": "teal",
    },
    {
        "id": "north-watch",
        "name": "North Watch",
        "kind": "lookout",
        "description": "A northern lookout marker to make chunk growth and axis orientation readable at a glance.",
        "chunk_x": 0,
        "chunk_y": 1,
        "offset_x": 0.56,
        "offset_y": 0.28,
        "tone": "gold",
    },
    {
        "id": "west-arcade",
        "name": "West Arcade",
        "kind": "district",
        "description": "A placeholder district for the first collaborative art lane and contributor experiments.",
        "chunk_x": -1,
        "chunk_y": 0,
        "offset_x": 0.34,
        "offset_y": 0.54,
        "tone": "rose",
    },
    {
        "id": "east-relay",
        "name": "East Relay",
        "kind": "district",
        "description": "A visible east-side relay marker for future chunk unlock and realtime subscription testing.",
        "chunk_x": 1,
        "chunk_y": 0,
        "offset_x": 0.62,
        "offset_y": 0.46,
        "tone": "sky",
    },
    {
        "id": "south-gate",
        "name": "South Gate",
        "kind": "frontier",
        "description": "A southern entry point reserved for future first-claim bootstrapping by command.",
        "chunk_x": 0,
        "chunk_y": -1,
        "offset_x": 0.47,
        "offset_y": 0.68,
        "tone": "moss",
    },
]


def chunk_origin(chunk_x: int, chunk_y: int) -> tuple[int, int]:
    settings = get_settings()
    origin_x = settings.world_origin_x + chunk_x * settings.world_chunk_size
    origin_y = settings.world_origin_y + chunk_y * settings.world_chunk_size
    return origin_x, origin_y


def get_chunk_role(chunk_x: int, chunk_y: int) -> str:
    if chunk_x == 0 and chunk_y == 0:
        return "origin"
    if abs(chunk_x) == 1 and abs(chunk_y) == 1:
        return "frontier"
    return "starter"


async def ensure_origin_chunk(session: AsyncSession) -> WorldChunk:
    settings = get_settings()

    existing_chunk = await session.scalar(
        select(WorldChunk).where(WorldChunk.chunk_x == 0, WorldChunk.chunk_y == 0)
    )
    if existing_chunk is not None:
        return existing_chunk

    origin_chunk = WorldChunk(
        chunk_x=0,
        chunk_y=0,
        origin_x=settings.world_origin_x,
        origin_y=settings.world_origin_y,
        width=settings.world_chunk_size,
        height=settings.world_chunk_size,
    )
    session.add(origin_chunk)
    await session.commit()
    await session.refresh(origin_chunk)
    return origin_chunk


async def ensure_initial_chunks(session: AsyncSession) -> None:
    settings = get_settings()

    result = await session.scalars(select(WorldChunk))
    existing_chunks = {(chunk.chunk_x, chunk.chunk_y) for chunk in result.all()}
    new_chunks = []

    for chunk_x, chunk_y in STARTER_CHUNK_COORDINATES:
        if (chunk_x, chunk_y) in existing_chunks:
            continue

        origin_x, origin_y = chunk_origin(chunk_x, chunk_y)
        new_chunks.append(
            WorldChunk(
                chunk_x=chunk_x,
                chunk_y=chunk_y,
                origin_x=origin_x,
                origin_y=origin_y,
                width=settings.world_chunk_size,
                height=settings.world_chunk_size,
            )
        )

    if not new_chunks:
        return

    session.add_all(new_chunks)
    await session.commit()


async def get_world_overview(session: AsyncSession) -> WorldOverview:
    settings = get_settings()

    result = await session.scalars(select(WorldChunk).order_by(WorldChunk.chunk_y.desc(), WorldChunk.chunk_x))
    chunks = result.all()
    min_chunk_x = min(chunk.chunk_x for chunk in chunks)
    max_chunk_x = max(chunk.chunk_x for chunk in chunks)
    min_chunk_y = min(chunk.chunk_y for chunk in chunks)
    max_chunk_y = max(chunk.chunk_y for chunk in chunks)

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
        chunk_count=len(chunks),
        bounds=WorldBounds(
            min_chunk_x=min_chunk_x,
            max_chunk_x=max_chunk_x,
            min_chunk_y=min_chunk_y,
            max_chunk_y=max_chunk_y,
            min_world_x=min(chunk.origin_x for chunk in chunks),
            max_world_x=max(chunk.origin_x + chunk.width for chunk in chunks),
            min_world_y=min(chunk.origin_y for chunk in chunks),
            max_world_y=max(chunk.origin_y + chunk.height for chunk in chunks),
        ),
        chunks=chunk_summaries,
        landmarks=landmarks,
    )
