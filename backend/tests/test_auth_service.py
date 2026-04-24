import io
import unittest

from PIL import Image

from app.core.config import Settings
from app.modules.auth.service import (
    AvatarUploadError,
    normalize_frontend_redirect_url,
    process_avatar_upload,
)


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


if __name__ == "__main__":
    unittest.main()
