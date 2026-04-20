from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.config import get_settings
from app.db.session import get_db
from app.modules.auth.service import resolve_authenticated_user
from app.schemas.world import (
    AreaContributorInviteRequest,
    ClaimAreaSummary,
    ClaimAreaUpdateRequest,
    PixelBatchClaimRequest,
    PixelBatchClaimResponse,
    PixelClaimRequest,
    PixelClaimResponse,
    PixelColor,
    PixelPaintRequest,
    PixelPaintResponse,
    WorldOverview,
    WorldPixelWindow,
)
from app.services.pixels import (
    PIXEL_PALETTE,
    PixelPlacementError,
    WorldTileError,
    claim_world_pixel,
    claim_world_pixels,
    ensure_world_tile_png,
    get_claim_area_details,
    get_visible_world_pixels,
    invite_area_contributor,
    paint_world_pixel,
    update_claim_area_metadata,
)
from app.services.world import get_world_overview

router = APIRouter()


@router.get("/overview", response_model=WorldOverview)
async def world_overview(session: AsyncSession = Depends(get_db)) -> WorldOverview:
    return await get_world_overview(session)


@router.get("/palette", response_model=list[PixelColor])
async def world_palette() -> list[PixelColor]:
    return [PixelColor.model_validate(color) for color in PIXEL_PALETTE]


@router.get("/pixels", response_model=WorldPixelWindow)
async def world_pixels(
    min_x: int = Query(...),
    max_x: int = Query(...),
    min_y: int = Query(...),
    max_y: int = Query(...),
    session: AsyncSession = Depends(get_db),
) -> WorldPixelWindow:
    return await get_visible_world_pixels(session, min_x, max_x, min_y, max_y)


@router.get("/tiles/{layer}/{tile_x}/{tile_y}.png")
async def world_tile(
    layer: str,
    tile_x: int,
    tile_y: int,
    session: AsyncSession = Depends(get_db),
) -> FileResponse:
    try:
        tile_path = await ensure_world_tile_png(session, layer, tile_x, tile_y)
    except WorldTileError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error

    return FileResponse(
        tile_path,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=5, must-revalidate",
            "X-PixelProject-Tile": f"{layer}/{tile_x}/{tile_y}",
        },
    )


@router.post("/claims", response_model=PixelClaimResponse)
async def claim_pixel(
    payload: PixelClaimRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> PixelClaimResponse:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    try:
        return await claim_world_pixel(session, user, payload.x, payload.y, settings)
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.post("/claims/batch", response_model=PixelBatchClaimResponse)
async def claim_pixels(
    payload: PixelBatchClaimRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> PixelBatchClaimResponse:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    try:
        return await claim_world_pixels(
            session,
            user,
            [(pixel.x, pixel.y) for pixel in payload.pixels],
            settings,
        )
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.post("/pixels", response_model=PixelPaintResponse)
async def paint_pixel(
    payload: PixelPaintRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> PixelPaintResponse:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    try:
        return await paint_world_pixel(session, user, payload.x, payload.y, payload.color_id, settings)
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.get("/areas/{area_id}", response_model=ClaimAreaSummary)
async def get_area(
    area_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> ClaimAreaSummary:
    settings = get_settings()
    viewer = await resolve_authenticated_user(request, session, settings)

    try:
        return await get_claim_area_details(session, area_id, viewer)
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.patch("/areas/{area_id}", response_model=ClaimAreaSummary)
async def patch_area(
    area_id: UUID,
    payload: ClaimAreaUpdateRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> ClaimAreaSummary:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    try:
        return await update_claim_area_metadata(session, area_id, user, payload.name, payload.description)
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.post("/areas/{area_id}/contributors", response_model=ClaimAreaSummary)
async def post_area_contributor(
    area_id: UUID,
    payload: AreaContributorInviteRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> ClaimAreaSummary:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    try:
        return await invite_area_contributor(session, area_id, user, payload.public_id)
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
