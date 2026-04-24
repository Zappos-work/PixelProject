import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import WebSocket

from app.core.redis import get_redis_client
from app.schemas.world import WorldTileCoordinate

logger = logging.getLogger(__name__)

WORLD_REALTIME_CHANNEL = "pixelproject:world:events"


@dataclass(slots=True, eq=False)
class WorldRealtimeConnection:
    websocket: WebSocket
    send_lock: asyncio.Lock


class WorldRealtimeHub:
    def __init__(self) -> None:
        self._connections: set[WorldRealtimeConnection] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> WorldRealtimeConnection:
        await websocket.accept()
        connection = WorldRealtimeConnection(websocket=websocket, send_lock=asyncio.Lock())

        async with self._lock:
            self._connections.add(connection)

        return connection

    async def disconnect(self, connection: WorldRealtimeConnection) -> None:
        async with self._lock:
            self._connections.discard(connection)

    async def send(self, connection: WorldRealtimeConnection, payload: dict[str, object]) -> None:
        async with connection.send_lock:
            await connection.websocket.send_json(payload)

    async def broadcast_local(self, payload: dict[str, object]) -> None:
        async with self._lock:
            connections = list(self._connections)

        stale_connections: list[WorldRealtimeConnection] = []

        for connection in connections:
            try:
                async with connection.send_lock:
                    await connection.websocket.send_json(payload)
            except Exception:
                stale_connections.append(connection)

        if not stale_connections:
            return

        async with self._lock:
            for connection in stale_connections:
                self._connections.discard(connection)


world_realtime_hub = WorldRealtimeHub()


def _serialize_tile_coordinates(
    tiles: list[WorldTileCoordinate] | None,
) -> list[dict[str, int]]:
    return [
        {
            "tile_x": tile.tile_x,
            "tile_y": tile.tile_y,
        }
        for tile in tiles or []
    ]


async def publish_world_update(
    *,
    source: str,
    actor_user_id: str | None = None,
    area_id: str | None = None,
    area_public_id: int | None = None,
    paint_tiles: list[WorldTileCoordinate] | None = None,
    claim_tiles: list[WorldTileCoordinate] | None = None,
    world_dirty: bool = True,
) -> None:
    payload: dict[str, object] = {
        "type": "world:update",
        "event_id": str(uuid4()),
        "source": source,
        "actor_user_id": actor_user_id,
        "area_id": area_id,
        "area_public_id": area_public_id,
        "paint_tiles": _serialize_tile_coordinates(paint_tiles),
        "claim_tiles": _serialize_tile_coordinates(claim_tiles),
        "world_dirty": world_dirty,
        "at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        await get_redis_client().publish(WORLD_REALTIME_CHANNEL, json.dumps(payload))
    except Exception:
        logger.exception("World realtime publish failed; falling back to local websocket broadcast.")
        await world_realtime_hub.broadcast_local(payload)


async def relay_world_updates_from_redis() -> None:
    pubsub = get_redis_client().pubsub()

    try:
        await pubsub.subscribe(WORLD_REALTIME_CHANNEL)

        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue

            try:
                payload = json.loads(str(message.get("data")))
            except (TypeError, json.JSONDecodeError):
                logger.warning("Ignored malformed world realtime payload from Redis.")
                continue

            if isinstance(payload, dict):
                await world_realtime_hub.broadcast_local(payload)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("World realtime Redis relay stopped unexpectedly.")
    finally:
        await pubsub.unsubscribe(WORLD_REALTIME_CHANNEL)
        await pubsub.aclose()
