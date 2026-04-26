import io
import unittest
from datetime import datetime, timezone
from uuid import uuid4

from PIL import Image
from pydantic import ValidationError

from app.core.config import Settings
from app.modules.auth.service import (
    AvatarUploadError,
    build_auth_user_summary,
    get_level_progress,
    get_level_xp_target,
    normalize_frontend_redirect_url,
    _apply_regenerating_resource,
    process_avatar_upload,
)
from app.schemas.auth import ShopPurchaseRequest
from app.schemas.world import ClaimAreaReactionRequest, ClaimAreaReactionSummary


def build_png(width: int, height: int) -> bytes:
    image = Image.new("RGBA", (width, height), (120, 180, 240, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class AuthServiceTests(unittest.TestCase):
    def test_avatar_upload_is_normalized_to_png_data_url(self) -> None:
        data_url = process_avatar_upload("avatar.png", "image/png", build_png(32, 48))

        self.assertTrue(data_url.startswith("data:image/png;base64,"))

    def test_avatar_upload_rejects_excessive_pixel_dimensions(self) -> None:
        with self.assertRaises(AvatarUploadError) as raised:
            process_avatar_upload("wide.png", "image/png", build_png(4097, 1))

        self.assertEqual(raised.exception.status_code, 413)

    def test_frontend_redirect_stays_on_configured_origin(self) -> None:
        settings = Settings(
            secret_key="local-development-secret-that-is-long-enough",
            frontend_app_url="http://localhost:3000",
        )

        self.assertEqual(
            normalize_frontend_redirect_url("http://localhost:3000/?panel=account", settings),
            "http://localhost:3000/?panel=account",
        )
        self.assertEqual(
            normalize_frontend_redirect_url("https://evil.example/phish", settings),
            "http://localhost:3000",
        )

    def test_level_targets_start_at_sixty_and_increase_by_ten(self) -> None:
        settings = Settings(secret_key="local-development-secret-that-is-long-enough")

        self.assertEqual(get_level_xp_target(1, settings), 60)
        self.assertEqual(get_level_xp_target(2, settings), 70)
        self.assertEqual(get_level_xp_target(800, settings), 8050)
        self.assertEqual(get_level_progress(59, settings), (1, 59, 60))
        self.assertEqual(get_level_progress(60, settings), (2, 0, 70))

    def test_auth_summary_exposes_shop_purchase_totals(self) -> None:
        settings = Settings(secret_key="local-development-secret-that-is-long-enough")
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)

        class UserRecord:
            id = uuid4()
            public_id = 7
            display_name = "Shopper"
            display_name_changed_at = now
            avatar_key = "default-avatar"
            avatar_url = None
            role = "player"
            is_banned = False
            is_deactivated = False
            holders = 128
            holders_unlimited = True
            holder_limit = 1000
            holders_last_updated_at = now
            claim_area_limit = 1
            normal_pixels = 64
            normal_pixel_limit = 64
            normal_pixels_last_updated_at = now
            created_at = now
            last_login_at = now
            xp = 0
            coins = 0
            shop_pixel_pack_50_purchases = 3
            shop_max_pixels_5_purchases = 4
            pixels_placed_total = 0
            holders_placed_total = 0
            claimed_pixels_count = 0

        summary = build_auth_user_summary(UserRecord(), settings)

        self.assertEqual(summary.shop_items_purchased.pixel_pack_50.purchased, 3)
        self.assertEqual(summary.shop_items_purchased.pixel_pack_50.total_received, 150)
        self.assertEqual(summary.shop_items_purchased.max_pixels_5.purchased, 4)
        self.assertEqual(summary.shop_items_purchased.max_pixels_5.total_received, 20)

    def test_regeneration_preserves_over_cap_pixel_packs(self) -> None:
        class Resource:
            normal_pixels = 114
            normal_pixel_limit = 64
            normal_pixels_last_updated_at = datetime(2026, 1, 1, tzinfo=timezone.utc)

        now = datetime(2026, 1, 1, 0, 5, tzinfo=timezone.utc)
        user = Resource()

        _apply_regenerating_resource(
            user,
            "normal_pixels",
            "normal_pixel_limit",
            "normal_pixels_last_updated_at",
            30,
            now,
        )

        self.assertEqual(user.normal_pixels, 114)

    def test_shop_quantity_rejects_decimal_values(self) -> None:
        with self.assertRaises(ValidationError):
            ShopPurchaseRequest(item_id="pixel_pack_50", quantity=1.5)

        with self.assertRaises(ValidationError):
            ShopPurchaseRequest(item_id="max_pixels_5", quantity="2")

        self.assertEqual(
            ShopPurchaseRequest(item_id="pixel_pack_50", quantity=3).quantity,
            3,
        )

    def test_claim_area_reaction_schema(self) -> None:
        self.assertEqual(ClaimAreaReactionRequest(reaction="like").reaction, "like")
        self.assertEqual(ClaimAreaReactionRequest(reaction="dislike").reaction, "dislike")
        self.assertIsNone(ClaimAreaReactionRequest(reaction=None).reaction)
        self.assertEqual(ClaimAreaReactionSummary().dislike_count, 0)

        with self.assertRaises(ValidationError):
            ClaimAreaReactionRequest(reaction="maybe")


if __name__ == "__main__":
    unittest.main()
