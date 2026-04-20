import argparse
import asyncio
import shutil
from pathlib import Path

from app.db.session import AsyncSessionLocal
from app.services.pixels import (
    WORLD_TILE_CACHE_DIR,
    WORLD_TILE_LAYERS,
    WORLD_TILE_SIZE,
    ensure_world_tile_png,
)
from app.services.world import get_world_overview


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pre-render cached world PNG tiles for the active world.")
    parser.add_argument(
        "--layer",
        action="append",
        choices=sorted(WORLD_TILE_LAYERS),
        help="Layer to warm. Repeat for multiple layers. Defaults to all layers.",
    )
    parser.add_argument(
        "--clear-cache",
        action="store_true",
        help="Delete the existing local tile cache before warming.",
    )
    return parser.parse_args()


def get_tile_range(start: int, length: int) -> range:
    first = start // WORLD_TILE_SIZE
    last = (start + length - 1) // WORLD_TILE_SIZE
    return range(first, last + 1)


async def main() -> None:
    args = parse_args()
    layers = args.layer or sorted(WORLD_TILE_LAYERS)

    if args.clear_cache:
        shutil.rmtree(Path(WORLD_TILE_CACHE_DIR), ignore_errors=True)

    async with AsyncSessionLocal() as session:
        world = await get_world_overview(session)
        active_chunks = [chunk for chunk in world.chunks if chunk.is_active]
        tiles: set[tuple[int, int]] = set()

        for chunk in active_chunks:
            for tile_x in get_tile_range(chunk.origin_x, chunk.width):
                for tile_y in get_tile_range(chunk.origin_y, chunk.height):
                    tiles.add((tile_x, tile_y))

        sorted_tiles = sorted(tiles, key=lambda tile: (tile[1], tile[0]))
        total = len(sorted_tiles) * len(layers)
        warmed = 0

        print(
            f"Warming {len(sorted_tiles)} tile coordinate(s) across {len(layers)} layer(s) "
            f"for {len(active_chunks)} active chunk(s)."
        )

        for layer in layers:
            for tile_x, tile_y in sorted_tiles:
                await ensure_world_tile_png(session, layer, tile_x, tile_y)
                warmed += 1
                if warmed == total or warmed % 10 == 0:
                    print(f"Warmed {warmed}/{total} tiles...")

    print("World tile cache warmup complete.")


if __name__ == "__main__":
    asyncio.run(main())
