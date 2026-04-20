import asyncio

from sqlalchemy import text

from app.db.session import AsyncSessionLocal, dispose_engine


# This migration remaps existing saved pixel color ids from the legacy palette
# to their closest hand-picked equivalents in the new user-requested palette.
# It is intentionally one-way and should only be run once for an environment.
LEGACY_TO_V2_COLOR_ID_MAP = {
    0: 0,   # Void -> Black
    1: 18,  # Navy -> Dark Blue
    2: 25,  # Mulberry -> Dark Pink
    3: 11,  # Pine -> Dark Green
    4: 29,  # Clay -> Brown
    5: 1,   # Stone -> Dark Gray
    6: 3,   # Mist -> Light Gray
    7: 4,   # Ivory -> White
    8: 6,   # Crimson -> Red
    9: 8,   # Amber -> Gold
    10: 9,  # Signal Yellow -> Yellow
    11: 12, # Lime -> Green
    12: 19, # Sky -> Blue
    13: 21, # Lilac -> Light Indigo
    14: 27, # Blush -> Light Pink
    15: 30, # Peach -> Beige
    16: 28, # Umber -> Dark Brown
    17: 18, # Midnight -> Dark Blue
    18: 5,  # Wine -> Deep Red
    19: 14, # Lagoon -> Dark Teal
    20: 29, # Rust -> Brown
    21: 1,  # Dust -> Dark Gray
    22: 30, # Sand -> Beige
    23: 10, # Pollen -> Light Yellow
    24: 25, # Ruby -> Dark Pink
    25: 7,  # Flare -> Orange
    26: 13, # Acid -> Light Green
    27: 11, # Emerald -> Dark Green
    28: 18, # Azure -> Dark Blue
    29: 22, # Mauve -> Dark Purple
    30: 7,  # Coral -> Orange
    31: 30, # Apricot -> Beige
}


def build_case_sql() -> str:
    lines = ["CASE color_id"]

    for source_id, target_id in LEGACY_TO_V2_COLOR_ID_MAP.items():
        lines.append(f"WHEN {source_id} THEN {target_id}")

    lines.append("ELSE color_id END")
    return " ".join(lines)


async def main() -> None:
    case_sql = build_case_sql()

    async with AsyncSessionLocal() as session:
        before = await session.execute(
            text(
                "SELECT color_id, COUNT(*) AS pixels "
                "FROM world_pixels "
                "WHERE color_id IS NOT NULL "
                "GROUP BY color_id "
                "ORDER BY color_id"
            )
        )
        print("Before migration:")
        for row in before.all():
            print(f"  {row.color_id:>2}: {row.pixels}")

        result = await session.execute(
            text(
                "UPDATE world_pixels "
                f"SET color_id = {case_sql} "
                "WHERE color_id IS NOT NULL"
            )
        )
        await session.commit()
        print(f"Updated rows: {result.rowcount}")

        after = await session.execute(
            text(
                "SELECT color_id, COUNT(*) AS pixels "
                "FROM world_pixels "
                "WHERE color_id IS NOT NULL "
                "GROUP BY color_id "
                "ORDER BY color_id"
            )
        )
        print("After migration:")
        for row in after.all():
            print(f"  {row.color_id:>2}: {row.pixels}")

    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
