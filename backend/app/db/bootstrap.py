from app.db.session import AsyncSessionLocal, engine
from app.models import Base
from app.services.world import ensure_initial_chunks, ensure_origin_chunk


async def initialize_database() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        await ensure_origin_chunk(session)
        await ensure_initial_chunks(session)
