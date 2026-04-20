from app.db.migrations import ensure_auth_schema
from app.db.session import AsyncSessionLocal, engine
from app.models import Base
from app.services.pixels import ensure_legacy_claim_areas, ensure_starter_claim_frontier
from app.services.world import ensure_initial_chunks, ensure_origin_chunk


async def initialize_database() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await ensure_auth_schema(connection)

    async with AsyncSessionLocal() as session:
        await ensure_origin_chunk(session)
        await ensure_initial_chunks(session)
        await ensure_starter_claim_frontier(session)
        await ensure_legacy_claim_areas(session)
