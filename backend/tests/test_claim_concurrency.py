import asyncio
import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import delete, func, select, tuple_

from app.core.config import get_settings
from app.db.bootstrap import initialize_database
from app.db.session import AsyncSessionLocal
from app.models.claim_area import ClaimArea
from app.models.user import User
from app.models.world_pixel import WorldPixel
from app.services import pixels as pixels_service
from app.services.pixels import PixelPlacementError
from app.services.world import ensure_origin_chunk, refresh_world_chunk_claim_counts


class AsyncBarrier:
    def __init__(self, parties: int) -> None:
        self.parties = parties
        self.count = 0
        self.event = asyncio.Event()
        self.lock = asyncio.Lock()

    async def wait(self) -> None:
        async with self.lock:
            self.count += 1

            if self.count >= self.parties:
                self.event.set()

        await asyncio.wait_for(self.event.wait(), timeout=10)


@unittest.skipUnless(
    os.environ.get("PIXELPROJECT_DB_TESTS") == "1",
    "set PIXELPROJECT_DB_TESTS=1 to run database-backed claim concurrency tests",
)
class ClaimConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.settings = get_settings()
        self.user_ids = []
        self.cleanup_coordinates = []

        await initialize_database()

        async with AsyncSessionLocal() as session:
            await ensure_origin_chunk(session)
            self.base_x, self.base_y = await self.find_free_anchor(session)
            now = datetime.now(timezone.utc)
            self.cleanup_coordinates = [
                (self.base_x, self.base_y),
                (self.base_x + 1, self.base_y),
                (self.base_x + 2, self.base_y),
                (self.base_x + 1, self.base_y + 1),
            ]

            user_a = User(
                google_subject=f"claim-race-a-{uuid4()}",
                email=f"claim-race-a-{uuid4()}@example.test",
                display_name="Race A",
                holders=1000,
                holders_unlimited=True,
                claim_area_limit=5,
                holders_last_updated_at=now,
                normal_pixels_last_updated_at=now,
            )
            user_b = User(
                google_subject=f"claim-race-b-{uuid4()}",
                email=f"claim-race-b-{uuid4()}@example.test",
                display_name="Race B",
                holders=1000,
                holders_unlimited=True,
                claim_area_limit=5,
                holders_last_updated_at=now,
                normal_pixels_last_updated_at=now,
            )
            session.add_all([user_a, user_b])
            await session.flush()
            self.user_ids = [user_a.id, user_b.id]

            chunk_x, chunk_y = pixels_service.get_chunk_coordinates_for_pixel(
                self.base_x,
                self.base_y,
                self.settings,
            )
            session.add(
                WorldPixel(
                    x=self.base_x,
                    y=self.base_y,
                    chunk_x=chunk_x,
                    chunk_y=chunk_y,
                    color_id=None,
                    owner_user_id=None,
                    area_id=None,
                    is_starter=True,
                )
            )
            await session.commit()

    async def asyncTearDown(self) -> None:
        async with AsyncSessionLocal() as session:
            if self.cleanup_coordinates:
                await session.execute(
                    delete(WorldPixel).where(
                        tuple_(WorldPixel.x, WorldPixel.y).in_(self.cleanup_coordinates)
                    )
                )

            if self.user_ids:
                await session.execute(delete(ClaimArea).where(ClaimArea.owner_user_id.in_(self.user_ids)))
                await session.execute(delete(User).where(User.id.in_(self.user_ids)))

            await refresh_world_chunk_claim_counts(session)
            await session.commit()

    async def find_free_anchor(self, session) -> tuple[int, int]:
        for offset in range(0, 800, 8):
            base_x = self.settings.world_origin_x + 100 + offset
            base_y = self.settings.world_origin_y + 100
            coordinates = [
                (base_x, base_y),
                (base_x + 1, base_y),
                (base_x + 2, base_y),
                (base_x + 1, base_y + 1),
            ]
            existing_count = await session.scalar(
                select(func.count(WorldPixel.id)).where(
                    tuple_(WorldPixel.x, WorldPixel.y).in_(coordinates)
                )
            )

            if existing_count == 0:
                return base_x, base_y

        self.skipTest("could not find an unused claim-race test coordinate window")

    async def claim_pixels_for_user(self, user_id, coordinates):
        async with AsyncSessionLocal() as session:
            user = await session.get(User, user_id)
            assert user is not None
            return await pixels_service.claim_world_pixels(session, user, coordinates, self.settings)

    async def test_simultaneous_overlapping_claims_return_one_conflict(self) -> None:
        barrier = AsyncBarrier(2)
        original_bulk_insert = pixels_service._bulk_insert_claimed_pixels

        async def blocked_bulk_insert(session, user, area, pixels, settings):
            await barrier.wait()
            return await original_bulk_insert(session, user, area, pixels, settings)

        first_claim = [
            (self.base_x + 1, self.base_y),
            (self.base_x + 2, self.base_y),
        ]
        second_claim = [
            (self.base_x + 1, self.base_y),
            (self.base_x + 1, self.base_y + 1),
        ]

        with patch.object(pixels_service, "_bulk_insert_claimed_pixels", blocked_bulk_insert):
            results = await asyncio.gather(
                self.claim_pixels_for_user(self.user_ids[0], first_claim),
                self.claim_pixels_for_user(self.user_ids[1], second_claim),
                return_exceptions=True,
            )

        successes = [result for result in results if not isinstance(result, Exception)]
        conflicts = [
            result
            for result in results
            if isinstance(result, PixelPlacementError) and result.status_code == 409
        ]

        self.assertEqual(len(successes), 1)
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0].detail, "This claim conflicts with a recent claim. Try again.")

        async with AsyncSessionLocal() as session:
            claimed_count = await session.scalar(
                select(func.count(WorldPixel.id)).where(
                    tuple_(WorldPixel.x, WorldPixel.y).in_(first_claim + second_claim),
                    WorldPixel.owner_user_id.is_not(None),
                )
            )
            area_count = await session.scalar(
                select(func.count(ClaimArea.id)).where(ClaimArea.owner_user_id.in_(self.user_ids))
            )
            claimed_totals = (
                await session.execute(
                    select(User.claimed_pixels_count).where(User.id.in_(self.user_ids))
                )
            ).scalars().all()

        self.assertEqual(claimed_count, 2)
        self.assertEqual(area_count, 1)
        self.assertEqual(sorted(claimed_totals), [0, 2])


if __name__ == "__main__":
    unittest.main()
