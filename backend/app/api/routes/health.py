from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.redis import get_redis_client
from app.db.session import get_db
from app.schemas.health import HealthResponse, ServiceStatus

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check(session: AsyncSession = Depends(get_db)) -> JSONResponse:
    settings = get_settings()
    service_status = ServiceStatus(api=True, database=False, redis=False)
    http_status = status.HTTP_200_OK

    try:
        await session.execute(text("SELECT 1"))
        service_status.database = True
    except Exception:
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE

    try:
        redis_client = get_redis_client()
        await redis_client.ping()
        service_status.redis = True
    except Exception:
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE

    response = HealthResponse(
        status="ok" if service_status.database and service_status.redis else "degraded",
        environment=settings.app_env,
        service_status=service_status,
    )

    return JSONResponse(
        status_code=http_status,
        content=response.model_dump(mode="json"),
    )

