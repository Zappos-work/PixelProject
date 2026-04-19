from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.world import WorldOverview
from app.services.world import get_world_overview

router = APIRouter()


@router.get("/overview", response_model=WorldOverview)
async def world_overview(session: AsyncSession = Depends(get_db)) -> WorldOverview:
    return await get_world_overview(session)

