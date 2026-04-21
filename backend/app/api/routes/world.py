from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.config import get_settings
from app.db.session import get_db
from app.modules.auth.service import peek_authenticated_user, resolve_authenticated_user
from app.schemas.world import (
    AreaContributorInviteRequest,
    ClaimAreaListResponse,
    ClaimOutlineWindow,
    ClaimAreaSummary,
    ClaimAreaUpdateRequest,
    PixelBatchClaimRequest,
    PixelBatchClaimResponse,
    PixelBatchPaintRequest,
    PixelBatchPaintResponse,
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
    get_claim_outline_pixels,
    get_visible_world_pixels,
    invite_area_contributor,
    list_owned_claim_areas,
    paint_world_pixels,
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
    request: Request,
    min_x: int = Query(...),
    max_x: int = Query(...),
    min_y: int = Query(...),
    max_y: int = Query(...),
    session: AsyncSession = Depends(get_db),
) -> WorldPixelWindow:
    settings = get_settings()
    viewer = await peek_authenticated_user(request, session, settings)
    return await get_visible_world_pixels(session, min_x, max_x, min_y, max_y, viewer)


@router.get("/claims/outline", response_model=ClaimOutlineWindow)
async def claim_outline(
    request: Request,
    min_x: int = Query(...),
    max_x: int = Query(...),
    min_y: int = Query(...),
    max_y: int = Query(...),
    session: AsyncSession = Depends(get_db),
) -> ClaimOutlineWindow:
    settings = get_settings()
    viewer = await peek_authenticated_user(request, session, settings)
    return await get_claim_outline_pixels(session, min_x, max_x, min_y, max_y, viewer)


@router.get("/tiles/{layer}/{tile_x}/{tile_y}.png")
async def world_tile(
    request: Request,
    layer: str,
    tile_x: int,
    tile_y: int,
    session: AsyncSession = Depends(get_db),
) -> Response:
    settings = get_settings()
    viewer = await peek_authenticated_user(request, session, settings) if layer == "claims" else None

    try:
        tile_path = await ensure_world_tile_png(session, layer, tile_x, tile_y, viewer)
        try:
            tile_bytes = tile_path.read_bytes()
        except FileNotFoundError:
            tile_path = await ensure_world_tile_png(session, layer, tile_x, tile_y, viewer)
            tile_bytes = tile_path.read_bytes()
    except WorldTileError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail="World tile refresh is still in progress. Please retry.") from error

    headers = {
        "Cache-Control": (
            "private, max-age=5, must-revalidate"
            if layer == "claims"
            else "public, max-age=5, must-revalidate"
        ),
        "X-PixelProject-Tile": f"{layer}/{tile_x}/{tile_y}",
    }

    if layer == "claims":
        headers["Vary"] = "Cookie"

    return Response(content=tile_bytes, media_type="image/png", headers=headers)


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
            rectangles=[
                (rectangle.min_x, rectangle.max_x, rectangle.min_y, rectangle.max_y)
                for rectangle in payload.rectangles
            ],
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


@router.post("/paint", response_model=PixelBatchPaintResponse)
async def paint_pixels(
    payload: PixelBatchPaintRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> PixelBatchPaintResponse:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    try:
        return await paint_world_pixels(
            session,
            user,
            [(tile.x, tile.y, tile.pixels) for tile in payload.tiles],
            settings,
        )
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.get("/areas/mine", response_model=ClaimAreaListResponse)
async def my_areas(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> ClaimAreaListResponse:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    return await list_owned_claim_areas(session, user)


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
