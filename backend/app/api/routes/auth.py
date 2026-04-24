from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db
from app.modules.auth.service import (
    AvatarUploadError,
    DisplayNameUpdateError,
    GoogleOAuthError,
    append_query_parameter,
    attach_user_session,
    build_auth_status,
    build_auth_user_summary,
    build_google_redirect,
    clear_user_session,
    exchange_google_code_for_profile,
    is_google_oauth_configured,
    normalize_frontend_redirect_url,
    resolve_authenticated_user,
    update_user_display_name,
    upload_user_avatar,
    upsert_google_user,
)
from app.schemas.auth import AuthSessionStatus, AuthUserSummary, LogoutResponse, UpdateDisplayNameRequest

router = APIRouter(prefix="/auth")


def ensure_active_account(user) -> None:
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is banned.")


@router.get("/session", response_model=AuthSessionStatus)
async def get_auth_session(request: Request, db: AsyncSession = Depends(get_db)) -> AuthSessionStatus:
    settings = get_settings()
    user = await resolve_authenticated_user(request, db, settings)
    return build_auth_status(user, settings)


@router.get("/me", response_model=AuthUserSummary)
async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> AuthUserSummary:
    settings = get_settings()
    user = await resolve_authenticated_user(request, db, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    return build_auth_user_summary(user, settings)


@router.get("/google/login")
async def start_google_login(
    request: Request,
    next_url: str | None = Query(default=None, alias="next"),
) -> RedirectResponse:
    settings = get_settings()

    if not is_google_oauth_configured(settings):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured yet.",
        )

    return build_google_redirect(next_url or settings.frontend_app_url, request, settings)


@router.get("/google/callback")
async def finish_google_login(request: Request, db: AsyncSession = Depends(get_db)) -> RedirectResponse:
    settings = get_settings()
    next_url = normalize_frontend_redirect_url(
        request.session.pop("google_oauth_next", settings.frontend_app_url),
        settings,
    )
    expected_state = request.session.pop("google_oauth_state", None)
    returned_state = request.query_params.get("state")
    oauth_error = request.query_params.get("error")
    code = request.query_params.get("code")

    if oauth_error:
        return RedirectResponse(
            append_query_parameter(next_url, "auth", f"error:{oauth_error}"),
            status_code=302,
        )

    if not expected_state or returned_state != expected_state:
        return RedirectResponse(
            append_query_parameter(next_url, "auth", "error:state"),
            status_code=302,
        )

    if not code:
        return RedirectResponse(
            append_query_parameter(next_url, "auth", "error:code"),
            status_code=302,
        )

    try:
        profile = await exchange_google_code_for_profile(code, settings)
        user, is_new_user = await upsert_google_user(db, profile, settings)
    except GoogleOAuthError:
        return RedirectResponse(
            append_query_parameter(next_url, "auth", "error:google"),
            status_code=302,
        )

    redirect_url = append_query_parameter(next_url, "auth", "welcome-name" if is_new_user else "success")
    response = RedirectResponse(redirect_url, status_code=302)
    await attach_user_session(response, db, user, request, settings)
    return response


@router.post("/logout", response_model=LogoutResponse)
async def logout(request: Request, db: AsyncSession = Depends(get_db)) -> JSONResponse:
    settings = get_settings()
    response = JSONResponse(LogoutResponse(success=True).model_dump())
    await clear_user_session(request, response, db, settings)
    return response


@router.patch("/profile/display-name", response_model=AuthUserSummary)
async def patch_display_name(
    payload: UpdateDisplayNameRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AuthUserSummary:
    settings = get_settings()
    user = await resolve_authenticated_user(request, db, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    ensure_active_account(user)

    try:
        updated_user = await update_user_display_name(db, user, payload.display_name)
    except DisplayNameUpdateError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error

    return build_auth_user_summary(updated_user, settings)


@router.post("/profile/avatar-upload", response_model=AuthUserSummary)
async def post_avatar_upload(
    request: Request,
    avatar: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> AuthUserSummary:
    settings = get_settings()
    user = await resolve_authenticated_user(request, db, settings)

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    ensure_active_account(user)

    try:
        contents = await avatar.read()
        updated_user = await upload_user_avatar(db, user, avatar.filename, avatar.content_type, contents)
    except AvatarUploadError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
    finally:
        await avatar.close()

    return build_auth_user_summary(updated_user, settings)
