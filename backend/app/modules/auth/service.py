import base64
import hashlib
import io
import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from fastapi import Request
from fastapi.responses import RedirectResponse, Response
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.auth_session import AuthSession
from app.models.user import User
from app.schemas.auth import AvatarHistoryEntry, AuthSessionStatus, AuthUserSummary

GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
DEFAULT_DISPLAY_NAME = "Player"
DISPLAY_NAME_MIN_LENGTH = 3
DISPLAY_NAME_MAX_LENGTH = 24
DISPLAY_NAME_COOLDOWN_DAYS = 30
DISPLAY_NAME_PATTERN = re.compile(r"^[A-Za-z0-9 _-]+$")
DEFAULT_AVATAR_KEY = "default-avatar"
CUSTOM_AVATAR_KEY = "custom-upload"
AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024
AVATAR_RENDER_SIZE = 128


class GoogleOAuthError(Exception):
    pass


class DisplayNameUpdateError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class UserStateError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class AvatarUploadError(Exception):
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


def make_avatar_label(filename: str | None, selected_at: datetime) -> str:
    if filename:
        stem = Path(filename).stem.strip()
        if stem:
            return stem[:32]

    return selected_at.strftime("Avatar %d %b %Y %H:%M")


def normalize_avatar_history(user: User) -> list[AvatarHistoryEntry]:
    entries: list[AvatarHistoryEntry] = []
    raw_history = user.avatar_history or []

    for entry in raw_history:
        image_url = str(entry.get("image_url") or "").strip()
        if not image_url:
            continue

        selected_at_raw = entry.get("selected_at")
        if selected_at_raw is None:
            continue

        try:
            selected_at = datetime.fromisoformat(str(selected_at_raw).replace("Z", "+00:00"))
        except ValueError:
            continue

        label = str(entry.get("label") or make_avatar_label(None, selected_at))
        entries.append(
            AvatarHistoryEntry(
                image_url=image_url,
                label=label,
                selected_at=selected_at,
            )
        )

    if user.avatar_url:
        already_present = any(entry.image_url == user.avatar_url for entry in entries)
        if not already_present:
            entries.insert(
                0,
                AvatarHistoryEntry(
                    image_url=user.avatar_url,
                    label=make_avatar_label(None, user.updated_at),
                    selected_at=user.updated_at,
                ),
            )

    unique_entries: list[AvatarHistoryEntry] = []
    seen: set[tuple[str, datetime]] = set()

    for entry in sorted(entries, key=lambda item: item.selected_at, reverse=True):
        key = (entry.image_url, entry.selected_at)
        if key in seen:
            continue
        seen.add(key)
        unique_entries.append(entry)

    return unique_entries[:8]


def needs_display_name_setup(user: User) -> bool:
    return user.display_name_changed_at is None and user.display_name == DEFAULT_DISPLAY_NAME


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


def get_user_level(user: User, settings: Settings) -> tuple[int, int, int]:
    step = max(1, settings.level_up_holders_step)
    level = 1 + user.holders_placed_total // step
    progress_current = user.holders_placed_total % step
    return level, progress_current, step


def get_next_holder_regeneration_at(user: User, settings: Settings) -> datetime | None:
    if user.holders >= user.holder_limit:
        return None

    return user.holders_last_updated_at + timedelta(seconds=settings.holder_regeneration_interval_seconds)


def build_auth_user_summary(user: User, settings: Settings | None = None) -> AuthUserSummary:
    resolved_settings = settings or get_settings()
    available_at = get_display_name_change_available_at(user)
    current_time = datetime.now(timezone.utc)
    level, progress_current, progress_target = get_user_level(user, resolved_settings)

    return AuthUserSummary(
        id=user.id,
        public_id=user.public_id,
        google_subject=user.google_subject,
        email=user.email,
        display_name=user.display_name,
        display_name_changed_at=user.display_name_changed_at,
        avatar_key=user.avatar_key or DEFAULT_AVATAR_KEY,
        avatar_url=user.avatar_url,
        avatar_history=normalize_avatar_history(user),
        role=user.role,
        is_banned=user.is_banned,
        holders=user.holders,
        holder_limit=user.holder_limit,
        holder_regeneration_interval_seconds=resolved_settings.holder_regeneration_interval_seconds,
        holders_last_updated_at=user.holders_last_updated_at,
        next_holder_regeneration_at=get_next_holder_regeneration_at(user, resolved_settings),
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        needs_display_name_setup=needs_display_name_setup(user),
        can_change_display_name=available_at is None or current_time >= available_at,
        next_display_name_change_at=available_at,
        level=level,
        level_progress_current=progress_current,
        level_progress_target=progress_target,
        holders_placed_total=user.holders_placed_total,
        claimed_pixels_count=user.claimed_pixels_count,
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
        user=build_auth_user_summary(user, resolved_settings),
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
) -> tuple[User, bool]:
    resolved_settings = settings or get_settings()
    google_subject = str(profile["sub"])
    email = str(profile["email"]).lower()

    user = await db.scalar(select(User).where(User.google_subject == google_subject))

    if user is None:
        user = await db.scalar(select(User).where(User.email == email))

    now = datetime.now(timezone.utc)
    is_new_user = user is None

    if user is None:
        user = User(
            google_subject=google_subject,
            email=email,
            display_name=DEFAULT_DISPLAY_NAME,
            avatar_key=DEFAULT_AVATAR_KEY,
            avatar_url=None,
            avatar_history=[],
            role="player",
            is_banned=False,
            holders=resolved_settings.holder_start_amount,
            holder_limit=resolved_settings.holder_start_limit,
            holders_last_updated_at=now,
            holders_placed_total=0,
            claimed_pixels_count=0,
            last_login_at=now,
        )
        db.add(user)
    else:
        user.google_subject = google_subject
        user.email = email
        user.display_name = user.display_name or DEFAULT_DISPLAY_NAME
        user.avatar_key = CUSTOM_AVATAR_KEY if user.avatar_url else DEFAULT_AVATAR_KEY
        user.avatar_history = user.avatar_history or []
        user.last_login_at = now

    await db.commit()
    await db.refresh(user)
    return user, is_new_user


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


def _build_avatar_data_url(contents: bytes) -> str:
    encoded = base64.b64encode(contents).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _crop_to_square(image: Image.Image) -> Image.Image:
    width, height = image.size
    if width == height:
        return image

    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def process_avatar_upload(file_name: str | None, content_type: str | None, contents: bytes) -> tuple[str, str]:
    if not contents:
        raise AvatarUploadError("No avatar file was uploaded.", 422)

    if len(contents) > AVATAR_UPLOAD_MAX_BYTES:
        raise AvatarUploadError("Avatar file is too large. Maximum size is 2 MB.", 413)

    if content_type and not content_type.startswith("image/"):
        raise AvatarUploadError("Only image uploads are allowed for avatars.", 415)

    try:
        with Image.open(io.BytesIO(contents)) as image:
            prepared = _crop_to_square(image.convert("RGBA")).resize(
                (AVATAR_RENDER_SIZE, AVATAR_RENDER_SIZE),
                Image.Resampling.LANCZOS,
            )
            target = io.BytesIO()
            prepared.save(target, format="PNG", optimize=True)
    except (UnidentifiedImageError, OSError) as error:
        raise AvatarUploadError("The uploaded file is not a valid image.", 422) from error

    processed = target.getvalue()
    data_url = _build_avatar_data_url(processed)
    return data_url, make_avatar_label(file_name, datetime.now(timezone.utc))


async def upload_user_avatar(
    db: AsyncSession,
    user: User,
    file_name: str | None,
    content_type: str | None,
    contents: bytes,
) -> User:
    data_url, label = process_avatar_upload(file_name, content_type, contents)
    now = datetime.now(timezone.utc)
    history = list(user.avatar_history or [])
    history.insert(
        0,
        {
            "image_url": data_url,
            "label": label,
            "selected_at": now.isoformat(),
        },
    )

    deduped: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for entry in history:
        image_url = str(entry.get("image_url") or "")
        if not image_url or image_url in seen_urls:
            continue
        seen_urls.add(image_url)
        deduped.append(
            {
                "image_url": image_url,
                "label": str(entry.get("label") or label),
                "selected_at": str(entry.get("selected_at") or now.isoformat()),
            }
        )

    user.avatar_key = CUSTOM_AVATAR_KEY
    user.avatar_url = data_url
    user.avatar_history = deduped[:8]
    await db.commit()
    await db.refresh(user)
    return user


async def spend_holders(
    db: AsyncSession,
    user: User,
    amount: int,
    settings: Settings,
    now: datetime | None = None,
) -> User:
    current_time = now or datetime.now(timezone.utc)
    if amount <= 0:
        return user

    await apply_holder_regeneration(db, user, settings, current_time)

    if user.holders < amount:
        raise UserStateError("Not enough Holders available.", 409)

    was_full = user.holders >= user.holder_limit
    user.holders -= amount

    if was_full:
        user.holders_last_updated_at = current_time

    return user


async def apply_holder_regeneration(
    db: AsyncSession,
    user: User,
    settings: Settings,
    now: datetime | None = None,
) -> User:
    current_time = now or datetime.now(timezone.utc)

    if user.holders < 0:
        user.holders = 0

    if user.holder_limit < 0:
        user.holder_limit = 0

    if user.holders > user.holder_limit:
        user.holders = user.holder_limit

    if user.holders_last_updated_at is None:
        user.holders_last_updated_at = current_time
        return user

    if user.holders >= user.holder_limit:
        user.holders = user.holder_limit
        user.holders_last_updated_at = current_time
        return user

    elapsed_seconds = max(0, int((current_time - user.holders_last_updated_at).total_seconds()))
    interval_seconds = max(1, settings.holder_regeneration_interval_seconds)
    regenerated = elapsed_seconds // interval_seconds

    if regenerated <= 0:
        return user

    next_holder_count = min(user.holder_limit, user.holders + regenerated)
    user_reached_cap = next_holder_count >= user.holder_limit
    user.holders = next_holder_count
    user.holders_last_updated_at = (
        current_time
        if user_reached_cap
        else user.holders_last_updated_at + timedelta(seconds=regenerated * interval_seconds)
    )
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

    await apply_holder_regeneration(db, user, resolved_settings, now)
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
