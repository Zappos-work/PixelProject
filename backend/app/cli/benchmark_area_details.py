import argparse
import asyncio
from statistics import mean
from time import perf_counter

from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal, dispose_engine
from app.models.claim_area import ClaimArea
from app.models.user import User
from app.models.world_pixel import WorldPixel
from app.services.pixels import (
    get_claim_area_at_pixel,
    get_claim_area_details,
    get_claim_outline_pixels,
    get_visible_claim_area_previews,
    get_visible_world_pixels,
    list_owned_claim_areas,
)


def percentile(samples: list[float], ratio: float) -> float:
    if not samples:
        return 0.0

    ordered = sorted(samples)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * ratio)))
    return ordered[index]


async def resolve_target_user(public_id: int | None) -> User | None:
    async with AsyncSessionLocal() as session:
        if public_id is not None:
            return await session.scalar(select(User).where(User.public_id == public_id))

        return await session.scalar(
            select(User)
            .join(ClaimArea, ClaimArea.owner_user_id == User.id)
            .order_by(User.public_id)
            .limit(1)
        )


async def run_benchmark(public_id: int | None, iterations: int) -> None:
    user = await resolve_target_user(public_id)

    if user is None:
        target = f"#{public_id}" if public_id is not None else "with claim areas"
        print(f"No matching user found for benchmark target {target}.")
        return

    async with AsyncSessionLocal() as session:
        user = await session.get(User, user.id)
        if user is None:
            print("Benchmark user disappeared before the run started.")
            return

        area = await session.scalar(
            select(ClaimArea)
            .where(ClaimArea.owner_user_id == user.id)
            .order_by(ClaimArea.last_activity_at.desc(), ClaimArea.created_at.desc())
            .limit(1)
        )

        if area is None:
            print(f"User #{user.public_id} does not own any claim areas.")
            return

        list_times: list[float] = []
        selected_pixel_times: list[float] = []
        inspect_area_times: list[float] = []
        focused_outline_times: list[float] = []
        visible_area_preview_times: list[float] = []
        detail_times: list[float] = []
        sample_bounds = (
            await session.execute(
                select(
                    func.min(WorldPixel.x),
                    func.max(WorldPixel.x),
                    func.min(WorldPixel.y),
                    func.max(WorldPixel.y),
                )
                .where(WorldPixel.area_id == area.id)
            )
        ).first()

        if sample_bounds is None or sample_bounds[0] is None:
            print(f"Area {area.id} has no claim pixels to benchmark.")
            return

        min_x, max_x, min_y, max_y = (int(value) for value in sample_bounds)
        sample_x = min_x + (max_x - min_x) // 2
        sample_y = min_y + (max_y - min_y) // 2
        preview_radius = 256
        preview_min_x = max(min_x, sample_x - preview_radius)
        preview_max_x = min(max_x, sample_x + preview_radius)
        preview_min_y = max(min_y, sample_y - preview_radius)
        preview_max_y = min(max_y, sample_y + preview_radius)

        for _ in range(iterations):
            start = perf_counter()
            await list_owned_claim_areas(session, user)
            list_times.append((perf_counter() - start) * 1000)

        for _ in range(iterations):
            start = perf_counter()
            await get_visible_world_pixels(session, sample_x, sample_x, sample_y, sample_y, user)
            selected_pixel_times.append((perf_counter() - start) * 1000)

        for _ in range(iterations):
            start = perf_counter()
            await get_claim_area_at_pixel(session, sample_x, sample_y, user)
            inspect_area_times.append((perf_counter() - start) * 1000)

        for _ in range(iterations):
            start = perf_counter()
            await get_claim_outline_pixels(
                session,
                preview_min_x,
                preview_max_x,
                preview_min_y,
                preview_max_y,
                user,
                focus_area_id=area.id,
            )
            focused_outline_times.append((perf_counter() - start) * 1000)

        for _ in range(iterations):
            start = perf_counter()
            await get_visible_claim_area_previews(
                session,
                preview_min_x,
                preview_max_x,
                preview_min_y,
                preview_max_y,
                user,
            )
            visible_area_preview_times.append((perf_counter() - start) * 1000)

        for _ in range(iterations):
            start = perf_counter()
            await get_claim_area_details(session, area.id, user)
            detail_times.append((perf_counter() - start) * 1000)

    print(f"User #{user.public_id} | Area {area.id}")
    print(
        "list_owned_claim_areas:",
        f"avg={mean(list_times):.2f}ms",
        f"p50={percentile(list_times, 0.50):.2f}ms",
        f"p95={percentile(list_times, 0.95):.2f}ms",
        f"min={min(list_times):.2f}ms",
        f"max={max(list_times):.2f}ms",
    )
    print(
        "selected_pixel_lookup:",
        f"avg={mean(selected_pixel_times):.2f}ms",
        f"p50={percentile(selected_pixel_times, 0.50):.2f}ms",
        f"p95={percentile(selected_pixel_times, 0.95):.2f}ms",
        f"min={min(selected_pixel_times):.2f}ms",
        f"max={max(selected_pixel_times):.2f}ms",
    )
    print(
        "get_claim_area_at_pixel:",
        f"avg={mean(inspect_area_times):.2f}ms",
        f"p50={percentile(inspect_area_times, 0.50):.2f}ms",
        f"p95={percentile(inspect_area_times, 0.95):.2f}ms",
        f"min={min(inspect_area_times):.2f}ms",
        f"max={max(inspect_area_times):.2f}ms",
    )
    print(
        "get_claim_outline_pixels focused:",
        f"avg={mean(focused_outline_times):.2f}ms",
        f"p50={percentile(focused_outline_times, 0.50):.2f}ms",
        f"p95={percentile(focused_outline_times, 0.95):.2f}ms",
        f"min={min(focused_outline_times):.2f}ms",
        f"max={max(focused_outline_times):.2f}ms",
    )
    print(
        "get_visible_claim_area_previews:",
        f"avg={mean(visible_area_preview_times):.2f}ms",
        f"p50={percentile(visible_area_preview_times, 0.50):.2f}ms",
        f"p95={percentile(visible_area_preview_times, 0.95):.2f}ms",
        f"min={min(visible_area_preview_times):.2f}ms",
        f"max={max(visible_area_preview_times):.2f}ms",
    )
    print(
        "get_claim_area_details:",
        f"avg={mean(detail_times):.2f}ms",
        f"p50={percentile(detail_times, 0.50):.2f}ms",
        f"p95={percentile(detail_times, 0.95):.2f}ms",
        f"min={min(detail_times):.2f}ms",
        f"max={max(detail_times):.2f}ms",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark claim area queries against the local database.")
    parser.add_argument("--public-id", type=int, default=None, help="Specific player public id to benchmark.")
    parser.add_argument("--iterations", type=int, default=10, help="Number of iterations per query.")
    return parser.parse_args()


async def main() -> None:
    args = parse_args()

    try:
        await run_benchmark(args.public_id, max(1, args.iterations))
    finally:
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
