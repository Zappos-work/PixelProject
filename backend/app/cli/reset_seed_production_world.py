import argparse
import asyncio
import shutil
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from PIL import Image
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.dialects.postgresql import insert

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal, dispose_engine
from app.models.claim_area import ClaimArea
from app.models.user import User
from app.models.world_chunk import WorldChunk
from app.models.world_pixel import WorldPixel
from app.services.pixels import PIXEL_PALETTE, WORLD_TILE_CACHE_DIR, get_chunk_coordinates_for_pixel, warm_active_world_tile_cache
from app.services.world import get_world_overview, sync_world_growth

DEFAULT_OWNER_PUBLIC_ID = 1
DEFAULT_OWNER_DISPLAY_NAME = "Zappos"
DEFAULT_AREA_NAME = "Heart"
DEFAULT_AREA_DESCRIPTION = "Seeded starter artwork."
DEFAULT_ALPHA_THRESHOLD = 128

PALETTE_BY_ID = {
    int(color["id"]): tuple(int(color["hex"][index:index + 2], 16) for index in (1, 3, 5))
    for color in PIXEL_PALETTE
    if color["hex"] != "transparent"
}


@dataclass(frozen=True)
class SeedPixel:
    x: int
    y: int
    color_id: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reset production world claims/pixels and seed starter artwork.")
    parser.add_argument(
        "--image-path",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "assets" / "heart.webp",
        help="Path to the artwork image inside the backend container.",
    )
    parser.add_argument(
        "--owner-public-id",
        type=int,
        default=DEFAULT_OWNER_PUBLIC_ID,
        help="Public user id that should own the seeded artwork.",
    )
    parser.add_argument(
        "--owner-display-name",
        default=DEFAULT_OWNER_DISPLAY_NAME,
        help="Display name to enforce for the seeded owner.",
    )
    parser.add_argument(
        "--area-name",
        default=DEFAULT_AREA_NAME,
        help="Claim Area name for the seeded artwork.",
    )
    parser.add_argument(
        "--area-description",
        default=DEFAULT_AREA_DESCRIPTION,
        help="Claim Area description for the seeded artwork.",
    )
    parser.add_argument(
        "--center-x",
        type=int,
        default=0,
        help="World x coordinate used as the artwork center anchor.",
    )
    parser.add_argument(
        "--center-y",
        type=int,
        default=0,
        help="World y coordinate used as the artwork center anchor.",
    )
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=DEFAULT_ALPHA_THRESHOLD,
        help="Minimum alpha value that counts as a claimed/painted pixel.",
    )
    return parser.parse_args()


def iter_chunks(values: list[SeedPixel], chunk_size: int) -> Iterable[list[SeedPixel]]:
    for index in range(0, len(values), chunk_size):
        yield values[index:index + chunk_size]


def get_nearest_palette_color_id(red: int, green: int, blue: int) -> int:
    best_color_id = 0
    best_distance: int | None = None

    for color_id, (palette_red, palette_green, palette_blue) in PALETTE_BY_ID.items():
        distance = (
            (red - palette_red) * (red - palette_red)
            + (green - palette_green) * (green - palette_green)
            + (blue - palette_blue) * (blue - palette_blue)
        )
        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_color_id = color_id

    return best_color_id


def load_seed_pixels(
    image_path: Path,
    center_x: int,
    center_y: int,
    alpha_threshold: int,
) -> tuple[list[SeedPixel], int, int]:
    image = Image.open(image_path).convert("RGBA")
    source_width, source_height = image.size
    visible_points = [
        (x, y)
        for y in range(source_height)
        for x in range(source_width)
        if image.getpixel((x, y))[3] >= alpha_threshold
    ]

    if not visible_points:
        raise ValueError(f"No visible pixels found in {image_path}.")

    min_source_x = min(x for x, _y in visible_points)
    max_source_x = max(x for x, _y in visible_points)
    min_source_y = min(y for _x, y in visible_points)
    max_source_y = max(y for _x, y in visible_points)
    cropped_width = max_source_x - min_source_x + 1
    cropped_height = max_source_y - min_source_y + 1

    world_min_x = center_x - cropped_width // 2
    world_top_y = center_y + cropped_height // 2 - 1
    seed_pixels: list[SeedPixel] = []

    for source_x, source_y in visible_points:
        red, green, blue, _alpha = image.getpixel((source_x, source_y))
        world_x = world_min_x + (source_x - min_source_x)
        world_y = world_top_y - (source_y - min_source_y)
        seed_pixels.append(
            SeedPixel(
                x=world_x,
                y=world_y,
                color_id=get_nearest_palette_color_id(red, green, blue),
            )
        )

    return seed_pixels, cropped_width, cropped_height


async def main() -> None:
    args = parse_args()
    if not args.image_path.exists():
        raise FileNotFoundError(f"Seed image was not found: {args.image_path}")

    seed_pixels, cropped_width, cropped_height = load_seed_pixels(
        args.image_path,
        args.center_x,
        args.center_y,
        args.alpha_threshold,
    )

    settings = get_settings()

    try:
        async with AsyncSessionLocal() as session:
            owner = await session.scalar(select(User).where(User.public_id == args.owner_public_id))
            if owner is None:
                raise RuntimeError(f"User #{args.owner_public_id} was not found.")

            owner.display_name = args.owner_display_name
            owner.claimed_pixels_count = 0
            owner.holders_placed_total = 0
            await session.flush()

            await session.execute(delete(WorldPixel))
            await session.execute(delete(ClaimArea))
            await session.execute(delete(WorldChunk))
            await session.execute(update(User).values(claimed_pixels_count=0, holders_placed_total=0))
            await session.execute(text("ALTER SEQUENCE claim_areas_public_id_seq RESTART WITH 1"))
            await session.commit()

        async with AsyncSessionLocal() as session:
            owner = await session.scalar(select(User).where(User.public_id == args.owner_public_id))
            if owner is None:
                raise RuntimeError(f"User #{args.owner_public_id} was not found after reset.")

            area = ClaimArea(
                owner_user_id=owner.id,
                name=args.area_name,
                description=args.area_description,
                status="finished",
                claimed_pixels_count=len(seed_pixels),
                painted_pixels_count=len(seed_pixels),
            )
            session.add(area)
            await session.flush()

            for pixel_chunk in iter_chunks(seed_pixels, 10_000):
                rows = []
                for pixel in pixel_chunk:
                    chunk_x, chunk_y = get_chunk_coordinates_for_pixel(pixel.x, pixel.y, settings)
                    rows.append(
                        {
                            "id": uuid4(),
                            "x": pixel.x,
                            "y": pixel.y,
                            "chunk_x": chunk_x,
                            "chunk_y": chunk_y,
                            "color_id": pixel.color_id,
                            "owner_user_id": owner.id,
                            "area_id": area.id,
                            "is_starter": False,
                        }
                    )
                await session.execute(insert(WorldPixel), rows)

            owner.claimed_pixels_count = len(seed_pixels)
            owner.holders_placed_total = len(seed_pixels)
            await session.commit()

            await sync_world_growth(session, sync_pixels=True)
            await session.refresh(area)
            world = await get_world_overview(session)

            total_pixels = await session.scalar(select(func.count(WorldPixel.id)))
            if total_pixels != len(seed_pixels):
                raise RuntimeError(f"Expected {len(seed_pixels)} seeded pixels but found {total_pixels}.")

            if area.public_id != 1:
                raise RuntimeError(f"Expected seeded area public id 1 but found {area.public_id}.")

            if (world.origin.x, world.origin.y) != (-2000, -2000):
                raise RuntimeError(f"Unexpected world origin after reset: {world.origin.x}:{world.origin.y}")

            if world.chunk_count != 1:
                raise RuntimeError(f"Expected one active chunk after reset but found {world.chunk_count}.")

            if world.bounds.min_world_x != -2000 or world.bounds.max_world_x != 2000:
                raise RuntimeError(
                    f"Unexpected x bounds after reset: {world.bounds.min_world_x}..{world.bounds.max_world_x}"
                )

            if world.bounds.min_world_y != -2000 or world.bounds.max_world_y != 2000:
                raise RuntimeError(
                    f"Unexpected y bounds after reset: {world.bounds.min_world_y}..{world.bounds.max_world_y}"
                )

            shutil.rmtree(Path(WORLD_TILE_CACHE_DIR), ignore_errors=True)
            tile_count, total_renders = await warm_active_world_tile_cache(session)

            print("Production world reset and seed complete.")
            print(f"Owner: #{owner.public_id} {owner.display_name}")
            print(f"Area: #{area.public_id} {area.name}")
            print(f"Seed pixels: {len(seed_pixels)}")
            print(f"Artwork crop: {cropped_width}x{cropped_height}")
            print(f"World origin: {world.origin.x}:{world.origin.y}")
            print(f"World bounds X: {world.bounds.min_world_x}..{world.bounds.max_world_x}")
            print(f"World bounds Y: {world.bounds.min_world_y}..{world.bounds.max_world_y}")
            print(f"Warmed tiles: {tile_count}, renders: {total_renders}")
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
