from fastapi import APIRouter

from app.api.routes import health, world

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(world.router, prefix="/world", tags=["world"])

