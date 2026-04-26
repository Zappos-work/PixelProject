import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.config import get_settings
from app.db.session import get_db
from app.modules.auth.service import peek_authenticated_user, resolve_authenticated_user
from app.schemas.world import (
    AreaContributorInviteRequest,
    ClaimAreaInspection,
    ClaimAreaListResponse,
    ClaimAreaMutationResponse,
    ClaimContextPixelWindow,
    ClaimAreaPreviewWindow,
    ClaimAreaReactionRequest,
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
    WorldTileCoordinate,
)
from app.services.pixels import (
    PIXEL_PALETTE,
    PixelPlacementError,
    WorldTileError,
    claim_world_pixel,
    claim_world_pixels,
    ensure_world_tile_png,
    get_claim_context_pixels,
    get_claim_area_at_pixel,
    get_claim_area_details,
    get_claim_outline_pixels,
    get_visible_claim_area_previews,
    get_visible_world_pixels,
    is_claim_world_tile_layer,
    is_world_tile_within_active_world,
    invite_area_contributor,
    list_owned_claim_areas,
    paint_world_pixels,
    paint_world_pixel,
    promote_area_contributor,
    remove_area_contributor,
    update_claim_area_reaction,
    update_claim_area_metadata,
    get_world_tile_key,
)
from app.services.realtime import publish_world_update, world_realtime_hub
from app.services.world import get_world_overview

router = APIRouter()
MAX_WORLD_WINDOW_SPAN = 16_384


def ensure_reasonable_world_window(min_x: int, max_x: int, min_y: int, max_y: int) -> None:
    width = abs(max_x - min_x) + 1
    height = abs(max_y - min_y) + 1

    if width > MAX_WORLD_WINDOW_SPAN or height > MAX_WORLD_WINDOW_SPAN:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"World windows are limited to {MAX_WORLD_WINDOW_SPAN} cells per axis.",
        )


def ensure_active_player(user) -> None:
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is banned.")
    if user.is_deactivated:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated.")


async def publish_world_mutation(
    *,
    source: str,
    user_id: object | None = None,
    area: ClaimAreaSummary | None = None,
    paint_tiles: list[WorldTileCoordinate] | None = None,
    claim_tiles: list[WorldTileCoordinate] | None = None,
    world_dirty: bool = True,
) -> None:
    await publish_world_update(
        source=source,
        actor_user_id=str(user_id) if user_id is not None else None,
        area_id=str(area.id) if area is not None else None,
        area_public_id=area.public_id if area is not None else None,
        paint_tiles=paint_tiles,
        claim_tiles=claim_tiles,
        world_dirty=world_dirty,
    )


@router.get("/overview", response_model=WorldOverview)
async def world_overview(session: AsyncSession = Depends(get_db)) -> WorldOverview:
    return await get_world_overview(session)


@router.websocket("/live")
async def world_live(websocket: WebSocket) -> None:
    connection = await world_realtime_hub.connect(websocket)

    try:
        await world_realtime_hub.send(connection, {"type": "world:connected"})

        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=45)
            except asyncio.TimeoutError:
                await world_realtime_hub.send(connection, {"type": "world:ping"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await world_realtime_hub.disconnect(connection)


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
    ensure_reasonable_world_window(min_x, max_x, min_y, max_y)
    settings = get_settings()
    viewer = await peek_authenticated_user(request, session, settings)
    return await get_visible_world_pixels(session, min_x, max_x, min_y, max_y, viewer)


@router.get("/claims/context", response_model=ClaimContextPixelWindow)
async def claim_context_pixels(
    min_x: int = Query(...),
    max_x: int = Query(...),
    min_y: int = Query(...),
    max_y: int = Query(...),
    session: AsyncSession = Depends(get_db),
) -> ClaimContextPixelWindow:
    ensure_reasonable_world_window(min_x, max_x, min_y, max_y)
    return await get_claim_context_pixels(session, min_x, max_x, min_y, max_y)


@router.get("/claims/outline", response_model=ClaimOutlineWindow)
async def claim_outline(
    request: Request,
    min_x: int = Query(...),
    max_x: int = Query(...),
    min_y: int = Query(...),
    max_y: int = Query(...),
    focus_area_id: UUID | None = Query(default=None),
    focus_area_public_id: int | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
) -> ClaimOutlineWindow:
    ensure_reasonable_world_window(min_x, max_x, min_y, max_y)
    settings = get_settings()
    viewer = await peek_authenticated_user(request, session, settings)
    return await get_claim_outline_pixels(
        session,
        min_x,
        max_x,
        min_y,
        max_y,
        viewer,
        focus_area_id,
        focus_area_public_id,
    )


@router.get("/tiles/{layer}/{tile_x}/{tile_y}.png")
async def world_tile(
    request: Request,
    layer: str,
    tile_x: int,
    tile_y: int,
    session: AsyncSession = Depends(get_db),
) -> Response:
    settings = get_settings()
    viewer = await peek_authenticated_user(request, session, settings) if is_claim_world_tile_layer(layer) else None

    try:
        if not await is_world_tile_within_active_world(session, layer, tile_x, tile_y):
            raise WorldTileError("World tile is outside the active world.", 404)

        tile_path = await ensure_world_tile_png(session, layer, tile_x, tile_y, viewer)
        if not tile_path.exists():
            tile_path = await ensure_world_tile_png(session, layer, tile_x, tile_y, viewer)
    except WorldTileError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail="World tile refresh is still in progress. Please retry.") from error

    headers = {
        "Cache-Control": (
            "private, max-age=5, must-revalidate"
            if is_claim_world_tile_layer(layer)
            else "public, max-age=5, must-revalidate"
        ),
        "X-PixelProject-Tile": f"{layer}/{tile_x}/{tile_y}",
    }

    if is_claim_world_tile_layer(layer):
        headers["Vary"] = "Cookie"

    return FileResponse(tile_path, media_type="image/png", headers=headers)


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
    ensure_active_player(user)

    try:
        result = await claim_world_pixel(
            session,
            user,
            payload.x,
            payload.y,
            settings,
            payload.claim_mode,
            payload.target_area_id,
        )
        tile_x, tile_y = get_world_tile_key(payload.x, payload.y)
        await publish_world_mutation(
            source="claim",
            user_id=user.id,
            claim_tiles=[WorldTileCoordinate(tile_x=tile_x, tile_y=tile_y)],
        )
        return result
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
    ensure_active_player(user)

    try:
        result = await claim_world_pixels(
            session,
            user,
            [(pixel.x, pixel.y) for pixel in payload.pixels],
            settings,
            rectangles=[
                (rectangle.min_x, rectangle.max_x, rectangle.min_y, rectangle.max_y)
                for rectangle in payload.rectangles
            ],
            claim_mode=payload.claim_mode,
            target_area_id=payload.target_area_id,
            overlay=payload.overlay,
        )
        await publish_world_mutation(
            source="claim",
            user_id=user.id,
            area=result.area,
            claim_tiles=result.claim_tiles,
        )
        return result
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
    ensure_active_player(user)

    try:
        result = await paint_world_pixel(session, user, payload.x, payload.y, payload.color_id, settings)
        tile_x, tile_y = get_world_tile_key(payload.x, payload.y)
        await publish_world_mutation(
            source="paint",
            user_id=user.id,
            paint_tiles=[WorldTileCoordinate(tile_x=tile_x, tile_y=tile_y)],
        )
        return result
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
    ensure_active_player(user)

    try:
        result = await paint_world_pixels(
            session,
            user,
            [(tile.x, tile.y, tile.pixels) for tile in payload.tiles],
            settings,
        )
        await publish_world_mutation(
            source="paint",
            user_id=user.id,
            paint_tiles=result.paint_tiles,
            claim_tiles=result.claim_tiles,
        )
        return result
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.get("/areas/mine", response_model=ClaimAreaListResponse)
async def my_areas(
    request: Request,
    include_outlines: bool = Query(default=False),
    session: AsyncSession = Depends(get_db),
) -> ClaimAreaListResponse:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    return await list_owned_claim_areas(session, user, include_outlines=include_outlines)


@router.get("/areas/by-pixel", response_model=ClaimAreaInspection)
async def get_area_by_pixel(
    request: Request,
    x: int = Query(...),
    y: int = Query(...),
    session: AsyncSession = Depends(get_db),
) -> ClaimAreaInspection:
    settings = get_settings()
    viewer = await peek_authenticated_user(request, session, settings)
    return await get_claim_area_at_pixel(session, x, y, viewer)


@router.get("/areas/visible", response_model=ClaimAreaPreviewWindow)
async def get_visible_areas(
    request: Request,
    min_x: int = Query(...),
    max_x: int = Query(...),
    min_y: int = Query(...),
    max_y: int = Query(...),
    session: AsyncSession = Depends(get_db),
) -> ClaimAreaPreviewWindow:
    ensure_reasonable_world_window(min_x, max_x, min_y, max_y)
    settings = get_settings()
    viewer = await peek_authenticated_user(request, session, settings)
    return await get_visible_claim_area_previews(session, min_x, max_x, min_y, max_y, viewer)


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


@router.patch("/areas/{area_id}", response_model=ClaimAreaMutationResponse)
async def patch_area(
    area_id: UUID,
    payload: ClaimAreaUpdateRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> ClaimAreaMutationResponse:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    ensure_active_player(user)

    try:
        result = await update_claim_area_metadata(
            session,
            area_id,
            user,
            payload.name,
            payload.description,
            payload.status,
        )
        await publish_world_mutation(
            source="area_finish" if payload.status == "finished" else "area_update",
            user_id=user.id,
            area=result.area,
            claim_tiles=result.claim_tiles,
        )
        return result
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.patch("/areas/{area_id}/reaction", response_model=ClaimAreaSummary)
async def patch_area_reaction(
    area_id: UUID,
    payload: ClaimAreaReactionRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> ClaimAreaSummary:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    ensure_active_player(user)

    try:
        return await update_claim_area_reaction(session, area_id, user, payload.reaction)
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
    ensure_active_player(user)

    try:
        return await invite_area_contributor(session, area_id, user, payload.public_id)
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.delete("/areas/{area_id}/contributors/{contributor_public_id}", response_model=ClaimAreaSummary)
async def delete_area_contributor(
    area_id: UUID,
    contributor_public_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> ClaimAreaSummary:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    ensure_active_player(user)

    try:
        return await remove_area_contributor(session, area_id, user, contributor_public_id)
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.post("/areas/{area_id}/contributors/{contributor_public_id}/promote", response_model=ClaimAreaSummary)
async def post_area_contributor_promote(
    area_id: UUID,
    contributor_public_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> ClaimAreaSummary:
    settings = get_settings()
    user = await resolve_authenticated_user(request, session, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    ensure_active_player(user)

    try:
        return await promote_area_contributor(session, area_id, user, contributor_public_id)
    except PixelPlacementError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
