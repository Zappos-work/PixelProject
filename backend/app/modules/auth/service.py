import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from fastapi import Request
from fastapi.responses import RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.auth_session import AuthSession
from app.models.user import User
from app.schemas.auth import AuthSessionStatus, AuthUserSummary

GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
DEFAULT_DISPLAY_NAME = "Player"
DISPLAY_NAME_MIN_LENGTH = 3
DISPLAY_NAME_MAX_LENGTH = 24
DISPLAY_NAME_COOLDOWN_DAYS = 30
DISPLAY_NAME_PATTERN = re.compile(r"^[A-Za-z0-9 _-]+$")


class GoogleOAuthError(Exception):
    pass


class DisplayNameUpdateError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def is_google_oauth_configured(settings: Settings | None = None) -> bool:
    resolved_settings = settings or get_settings()
    return bool(resolved_settings.google_client_id and resolved_settings.google_client_secret)


def append_query_parameter(url: str, name: str, value: str) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query[name] = value
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def normalize_frontend_redirect_url(raw_url: str | None, settings: Settings) -> str:
    if not raw_url:
        return settings.frontend_app_url

    candidate = urlsplit(raw_url)
    frontend = urlsplit(settings.frontend_app_url)

    if (
        candidate.scheme == frontend.scheme
        and candidate.netloc == frontend.netloc
        and candidate.path.startswith("/")
    ):
        return urlunsplit(candidate)

    return settings.frontend_app_url


def hash_session_token(token: str, settings: Settings) -> str:
    return hashlib.sha256(f"{settings.secret_key}:{token}".encode("utf-8")).hexdigest()


def get_display_name_change_available_at(user: User) -> datetime | None:
    if user.display_name_changed_at is None:
        return None

    return user.display_name_changed_at + timedelta(days=DISPLAY_NAME_COOLDOWN_DAYS)


def can_change_display_name(user: User, now: datetime | None = None) -> bool:
    available_at = get_display_name_change_available_at(user)

    if available_at is None:
        return True

    current_time = now or datetime.now(timezone.utc)
    return current_time >= available_at


def build_auth_user_summary(user: User) -> AuthUserSummary:
    available_at = get_display_name_change_available_at(user)
    current_time = datetime.now(timezone.utc)

    return AuthUserSummary(
        id=user.id,
        public_id=user.public_id,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        holders=user.holders,
        holder_limit=user.holder_limit,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        can_change_display_name=available_at is None or current_time >= available_at,
        next_display_name_change_at=available_at,
    )


def build_auth_status(user: User | None, settings: Settings | None = None) -> AuthSessionStatus:
    resolved_settings = settings or get_settings()

    if user is None:
        return AuthSessionStatus(
            authenticated=False,
            google_oauth_configured=is_google_oauth_configured(resolved_settings),
        )

    return AuthSessionStatus(
        authenticated=True,
        google_oauth_configured=is_google_oauth_configured(resolved_settings),
        user=build_auth_user_summary(user),
    )


def build_google_redirect(next_url: str, request: Request, settings: Settings | None = None) -> RedirectResponse:
    resolved_settings = settings or get_settings()
    state = secrets.token_urlsafe(32)

    request.session["google_oauth_state"] = state
    request.session["google_oauth_next"] = normalize_frontend_redirect_url(next_url, resolved_settings)

    params = urlencode(
        {
            "client_id": resolved_settings.google_client_id,
            "redirect_uri": resolved_settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }
    )

    return RedirectResponse(url=f"{GOOGLE_AUTHORIZATION_ENDPOINT}?{params}", status_code=302)


async def exchange_google_code_for_profile(code: str, settings: Settings | None = None) -> dict[str, str | bool | None]:
    resolved_settings = settings or get_settings()

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_response = await client.post(
            GOOGLE_TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": resolved_settings.google_client_id,
                "client_secret": resolved_settings.google_client_secret,
                "redirect_uri": resolved_settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )

        if token_response.is_error:
            raise GoogleOAuthError("Google token exchange failed.")

        token_payload = token_response.json()
        access_token = token_payload.get("access_token")

        if not access_token:
            raise GoogleOAuthError("Google did not return an access token.")

        userinfo_response = await client.get(
            GOOGLE_USERINFO_ENDPOINT,
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        )

        if userinfo_response.is_error:
            raise GoogleOAuthError("Google userinfo request failed.")

        profile = userinfo_response.json()

    if not profile.get("sub") or not profile.get("email"):
        raise GoogleOAuthError("Google profile payload is incomplete.")

    if profile.get("email_verified") is not True:
        raise GoogleOAuthError("Google email address is not verified.")

    return profile


async def upsert_google_user(
    db: AsyncSession,
    profile: dict[str, str | bool | None],
    settings: Settings | None = None,
) -> User:
    resolved_settings = settings or get_settings()
    google_subject = str(profile["sub"])
    email = str(profile["email"]).lower()

    user = await db.scalar(select(User).where(User.google_subject == google_subject))

    if user is None:
        user = await db.scalar(select(User).where(User.email == email))

    now = datetime.now(timezone.utc)

    if user is None:
        user = User(
            google_subject=google_subject,
            email=email,
            display_name=DEFAULT_DISPLAY_NAME,
            avatar_url=None,
            role="player",
            is_banned=False,
            holders=resolved_settings.holder_start_amount,
            holder_limit=resolved_settings.holder_start_limit,
            last_login_at=now,
        )
        db.add(user)
    else:
        user.google_subject = google_subject
        user.email = email
        user.display_name = user.display_name or DEFAULT_DISPLAY_NAME
        if user.avatar_url and user.avatar_url.startswith("https://lh3.googleusercontent.com/"):
            user.avatar_url = None
        user.last_login_at = now

    await db.commit()
    await db.refresh(user)
    return user


def normalize_display_name(raw_display_name: str) -> str:
    compact = " ".join(raw_display_name.split())

    if len(compact) < DISPLAY_NAME_MIN_LENGTH or len(compact) > DISPLAY_NAME_MAX_LENGTH:
        raise DisplayNameUpdateError(
            f"Display name must be between {DISPLAY_NAME_MIN_LENGTH} and {DISPLAY_NAME_MAX_LENGTH} characters.",
            422,
        )

    if not DISPLAY_NAME_PATTERN.fullmatch(compact):
        raise DisplayNameUpdateError(
            "Display name may only contain English letters, numbers, spaces, hyphens, and underscores.",
            422,
        )

    return compact


async def update_user_display_name(
    db: AsyncSession,
    user: User,
    next_display_name: str,
) -> User:
    normalized = normalize_display_name(next_display_name)
    now = datetime.now(timezone.utc)

    if normalized == user.display_name:
        return user

    if not can_change_display_name(user, now):
        raise DisplayNameUpdateError(
            "Display name changes are only available once every 30 days.",
            429,
        )

    user.display_name = normalized
    user.display_name_changed_at = now
    await db.commit()
    await db.refresh(user)
    return user


async def attach_user_session(
    response: Response,
    db: AsyncSession,
    user: User,
    request: Request,
    settings: Settings | None = None,
) -> None:
    resolved_settings = settings or get_settings()
    issued_at = datetime.now(timezone.utc)
    max_age_seconds = resolved_settings.auth_session_max_age_hours * 3600
    session_token = secrets.token_urlsafe(48)
    session_record = AuthSession(
        user_id=user.id,
        token_hash=hash_session_token(session_token, resolved_settings),
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=issued_at + timedelta(seconds=max_age_seconds),
        last_seen_at=issued_at,
    )

    db.add(session_record)
    await db.commit()

    response.set_cookie(
        key=resolved_settings.auth_session_cookie_name,
        value=session_token,
        max_age=max_age_seconds,
        httponly=True,
        secure=resolved_settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


async def resolve_authenticated_user(
    request: Request,
    db: AsyncSession,
    settings: Settings | None = None,
) -> User | None:
    resolved_settings = settings or get_settings()
    session_token = request.cookies.get(resolved_settings.auth_session_cookie_name)

    if not session_token:
        return None

    session_record = await db.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == hash_session_token(session_token, resolved_settings)
        )
    )

    if session_record is None:
        return None

    now = datetime.now(timezone.utc)

    if session_record.expires_at <= now:
        await db.delete(session_record)
        await db.commit()
        return None

    session_record.last_seen_at = now
    user = await db.get(User, session_record.user_id)

    if user is None:
        await db.delete(session_record)
        await db.commit()
        return None

    await db.commit()
    return user


async def clear_user_session(
    request: Request,
    response: Response,
    db: AsyncSession,
    settings: Settings | None = None,
) -> None:
    resolved_settings = settings or get_settings()
    session_token = request.cookies.get(resolved_settings.auth_session_cookie_name)

    if session_token:
        session_record = await db.scalar(
            select(AuthSession).where(
                AuthSession.token_hash == hash_session_token(session_token, resolved_settings)
            )
        )

        if session_record is not None:
            await db.delete(session_record)
            await db.commit()

    response.delete_cookie(
        key=resolved_settings.auth_session_cookie_name,
        httponly=True,
        secure=resolved_settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )
