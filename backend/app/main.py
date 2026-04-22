import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.redis import close_redis_client
from app.db.bootstrap import initialize_database
from app.db.session import AsyncSessionLocal, dispose_engine
from app.services.pixels import warm_active_world_tile_cache

settings = get_settings()
logger = logging.getLogger(__name__)


async def warm_initial_world_overview_tiles() -> None:
    await asyncio.sleep(0.5)

    try:
        async with AsyncSessionLocal() as session:
            tile_count, total = await warm_active_world_tile_cache(session, ["visual-low"])
        logger.info("Warmed initial world overview tile cache: %s tile(s), %s render(s).", tile_count, total)
    except Exception:
        logger.exception("Initial world overview tile warmup failed.")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await initialize_database()
    overview_warmup_task = asyncio.create_task(warm_initial_world_overview_tiles())

    try:
        yield
    finally:
        overview_warmup_task.cancel()
        with suppress(asyncio.CancelledError):
            await overview_warmup_task
        await close_redis_client()
        await dispose_engine()


app = FastAPI(
    title=settings.app_name,
    version="0.1.8",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    same_site="lax",
    https_only=settings.auth_cookie_secure,
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "status": "ok",
        "docs": "/docs",
        "api_prefix": settings.api_v1_prefix,
    }
