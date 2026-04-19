import redis.asyncio as redis

from app.core.config import get_settings

settings = get_settings()
redis_client = redis.from_url(settings.redis_url, decode_responses=True)


def get_redis_client() -> redis.Redis:
    return redis_client


async def close_redis_client() -> None:
    await redis_client.aclose()

