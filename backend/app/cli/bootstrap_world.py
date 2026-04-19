import asyncio

from app.db.bootstrap import initialize_database


async def main() -> None:
    await initialize_database()
    print("Starter world ready.")


if __name__ == "__main__":
    asyncio.run(main())
