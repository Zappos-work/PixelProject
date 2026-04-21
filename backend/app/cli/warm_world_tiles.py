import argparse
import asyncio
import shutil
from pathlib import Path

from app.db.session import AsyncSessionLocal
from app.services.pixels import WORLD_TILE_CACHE_DIR, WORLD_TILE_LAYERS, warm_active_world_tile_cache


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

async def main() -> None:
    args = parse_args()
    layers = args.layer or sorted(WORLD_TILE_LAYERS)

    if args.clear_cache:
        shutil.rmtree(Path(WORLD_TILE_CACHE_DIR), ignore_errors=True)

    async with AsyncSessionLocal() as session:
        tile_count, total = await warm_active_world_tile_cache(session, layers)

        print(
            f"Warmed {tile_count} tile coordinate(s) across {len(layers)} layer(s)."
        )
        print(f"Processed {total} tile renders.")

    print("World tile cache warmup complete.")


if __name__ == "__main__":
    asyncio.run(main())
