from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import random
import subprocess
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


API_BASE = "http://127.0.0.1:8000/api/v1"
WORLD_TILE_SIZE = 1000
COLOR_IDS = list(range(5, 31))


@dataclass(frozen=True)
class StressUser:
    idx: int
    token: str
    email: str
    public_id: int


@dataclass(frozen=True)
class ClaimBlock:
    user_idx: int
    min_x: int
    max_x: int
    min_y: int
    max_y: int


class TeeLogger:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def log(self, message: str) -> None:
        stamp = datetime.now().strftime("%H:%M:%S")
        line = f"[{stamp}] {message}"
        with self._lock:
            print(line, flush=True)
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")


def now_label() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def run_compose_python(code: str, timeout: int = 180) -> dict[str, Any]:
    proc = subprocess.run(
        ["docker", "compose", "exec", "-T", "backend", "python", "-"],
        input=code,
        text=True,
        capture_output=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            "backend python command failed\n"
            f"STDOUT:\n{proc.stdout}\n"
            f"STDERR:\n{proc.stderr}\n"
        )

    marker_start = "JSON_RESULT_START"
    marker_end = "JSON_RESULT_END"
    start = proc.stdout.find(marker_start)
    end = proc.stdout.find(marker_end)
    if start < 0 or end < 0:
        raise RuntimeError(f"Could not parse backend JSON output:\n{proc.stdout}\n{proc.stderr}")

    payload = proc.stdout[start + len(marker_start):end].strip()
    return json.loads(payload)


def setup_users(user_count: int, logger: TeeLogger) -> dict[str, Any]:
    logger.log(f"Preparing {user_count} local stress users and auth sessions")
    code = f"""
import asyncio
import json
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, or_, select

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.auth_session import AuthSession
from app.models.user import User
from app.models.world_chunk import WorldChunk
from app.models.world_pixel import WorldPixel
from app.modules.auth.service import hash_session_token

USER_COUNT = {user_count}


async def main():
    settings = get_settings()
    now = datetime.now(timezone.utc)
    users = []

    async with AsyncSessionLocal() as db:
        active_bounds_row = (
            await db.execute(
                select(
                    func.min(WorldChunk.origin_x),
                    func.max(WorldChunk.origin_x + WorldChunk.width - 1),
                    func.min(WorldChunk.origin_y),
                    func.max(WorldChunk.origin_y + WorldChunk.height - 1),
                ).where(WorldChunk.is_active.is_(True))
            )
        ).one()
        active_chunk_rows = (
            await db.execute(
                select(WorldChunk.chunk_x, WorldChunk.chunk_y)
                .where(WorldChunk.is_active.is_(True))
                .order_by(WorldChunk.chunk_y, WorldChunk.chunk_x)
            )
        ).all()
        claim_bounds_row = (
            await db.execute(
                select(
                    func.min(WorldPixel.x),
                    func.max(WorldPixel.x),
                    func.min(WorldPixel.y),
                    func.max(WorldPixel.y),
                ).where(or_(WorldPixel.owner_user_id.is_not(None), WorldPixel.is_starter.is_(True)))
            )
        ).one()
        right_edge_row = (None, None, 0)
        left_edge_row = (None, None, 0)
        if claim_bounds_row[1] is not None:
            right_edge_row = (
                await db.execute(
                    select(func.min(WorldPixel.y), func.max(WorldPixel.y), func.count()).where(
                        WorldPixel.x == int(claim_bounds_row[1]),
                        or_(WorldPixel.owner_user_id.is_not(None), WorldPixel.is_starter.is_(True)),
                    )
                )
            ).one()
        if claim_bounds_row[0] is not None:
            left_edge_row = (
                await db.execute(
                    select(func.min(WorldPixel.y), func.max(WorldPixel.y), func.count()).where(
                        WorldPixel.x == int(claim_bounds_row[0]),
                        or_(WorldPixel.owner_user_id.is_not(None), WorldPixel.is_starter.is_(True)),
                    )
                )
            ).one()

        for idx in range(USER_COUNT):
            google_subject = f"stress-paint-{{idx:04d}}"
            email = f"stress-paint-{{idx:04d}}@local.test"
            user = await db.scalar(select(User).where(User.google_subject == google_subject))

            if user is None:
                user = User(google_subject=google_subject, email=email)
                db.add(user)

            user.email = email
            user.display_name = f"Stress Player {{idx:04d}}"
            user.avatar_key = "default-avatar"
            user.avatar_url = None
            user.role = "player"
            user.is_banned = False
            user.holders_unlimited = True
            user.holders = 10_000_000
            user.holder_limit = 10_000_000
            user.claim_area_limit = 10_000
            user.normal_pixels = 10_000_000
            user.normal_pixel_limit = 10_000_000
            user.holders_last_updated_at = now
            user.normal_pixels_last_updated_at = now
            user.last_login_at = now

            await db.flush()
            await db.execute(
                delete(AuthSession).where(
                    AuthSession.user_id == user.id,
                    AuthSession.user_agent == "stress-paint-system",
                )
            )

            token = secrets.token_urlsafe(48)
            db.add(
                AuthSession(
                    user_id=user.id,
                    token_hash=hash_session_token(token, settings),
                    user_agent="stress-paint-system",
                    ip_address="127.0.0.1",
                    expires_at=now + timedelta(hours=12),
                    last_seen_at=now,
                )
            )
            users.append(
                {{
                    "idx": idx,
                    "token": token,
                    "email": email,
                    "public_id": int(user.public_id or 0),
                }}
            )

        await db.commit()

    result = {{
        "cookie_name": settings.auth_session_cookie_name,
        "users": users,
        "active_bounds": {{
            "min_x": int(active_bounds_row[0]),
            "max_x": int(active_bounds_row[1]),
            "min_y": int(active_bounds_row[2]),
            "max_y": int(active_bounds_row[3]),
        }},
        "world": {{
            "origin_x": settings.world_origin_x,
            "origin_y": settings.world_origin_y,
            "chunk_size": settings.world_chunk_size,
        }},
        "active_chunks": [
            {{"chunk_x": int(chunk_x), "chunk_y": int(chunk_y)}}
            for chunk_x, chunk_y in active_chunk_rows
        ],
        "claim_bounds": {{
            "min_x": None if claim_bounds_row[0] is None else int(claim_bounds_row[0]),
            "max_x": None if claim_bounds_row[1] is None else int(claim_bounds_row[1]),
            "min_y": None if claim_bounds_row[2] is None else int(claim_bounds_row[2]),
            "max_y": None if claim_bounds_row[3] is None else int(claim_bounds_row[3]),
        }},
        "edge_bounds": {{
            "right": {{
                "x": None if claim_bounds_row[1] is None else int(claim_bounds_row[1]),
                "min_y": None if right_edge_row[0] is None else int(right_edge_row[0]),
                "max_y": None if right_edge_row[1] is None else int(right_edge_row[1]),
                "rows": int(right_edge_row[2] or 0),
            }},
            "left": {{
                "x": None if claim_bounds_row[0] is None else int(claim_bounds_row[0]),
                "min_y": None if left_edge_row[0] is None else int(left_edge_row[0]),
                "max_y": None if left_edge_row[1] is None else int(left_edge_row[1]),
                "rows": int(left_edge_row[2] or 0),
            }},
        }},
    }}
    print("JSON_RESULT_START")
    print(json.dumps(result))
    print("JSON_RESULT_END")


asyncio.run(main())
"""
    return run_compose_python(code, timeout=240)


def region_stats(bounds: dict[str, int], logger: TeeLogger, label: str) -> dict[str, Any]:
    logger.log(f"Collecting DB region stats: {label}")
    code = f"""
import asyncio
import json
from sqlalchemy import case, func, select
from app.db.session import AsyncSessionLocal
from app.models.world_pixel import WorldPixel

MIN_X = {bounds["min_x"]}
MAX_X = {bounds["max_x"]}
MIN_Y = {bounds["min_y"]}
MAX_Y = {bounds["max_y"]}


async def main():
    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(
                select(
                    func.count(),
                    func.sum(case((WorldPixel.owner_user_id.is_not(None), 1), else_=0)),
                    func.sum(case((WorldPixel.color_id.is_not(None), 1), else_=0)),
                    func.count(func.distinct(WorldPixel.owner_user_id)),
                    func.count(func.distinct(WorldPixel.area_id)),
                ).where(
                    WorldPixel.x >= MIN_X,
                    WorldPixel.x <= MAX_X,
                    WorldPixel.y >= MIN_Y,
                    WorldPixel.y <= MAX_Y,
                )
            )
        ).one()
    result = {{
        "label": "{label}",
        "bounds": {bounds!r},
        "rows": int(row[0] or 0),
        "owned_rows": int(row[1] or 0),
        "painted_rows": int(row[2] or 0),
        "distinct_owners": int(row[3] or 0),
        "distinct_areas": int(row[4] or 0),
    }}
    print("JSON_RESULT_START")
    print(json.dumps(result))
    print("JSON_RESULT_END")


asyncio.run(main())
"""
    return run_compose_python(code, timeout=180)


def choose_claim_region(
    active_bounds: dict[str, int],
    active_chunks: list[dict[str, int]],
    world: dict[str, int],
    claim_bounds: dict[str, int | None],
    edge_bounds: dict[str, dict[str, int | None]],
    user_count: int,
    block_size: int,
) -> tuple[dict[str, int], list[ClaimBlock]]:
    min_active_x = active_bounds["min_x"]
    max_active_x = active_bounds["max_x"]
    min_active_y = active_bounds["min_y"]
    max_active_y = active_bounds["max_y"]
    claimed_min_x = claim_bounds.get("min_x")
    claimed_max_x = claim_bounds.get("max_x")
    active_chunk_coordinates = {
        (int(chunk["chunk_x"]), int(chunk["chunk_y"]))
        for chunk in active_chunks
    }
    origin_x = int(world["origin_x"])
    origin_y = int(world["origin_y"])
    chunk_size = int(world["chunk_size"])

    def chunk_for(x: int, y: int) -> tuple[int, int]:
        return (x - origin_x) // chunk_size, (y - origin_y) // chunk_size

    def rectangle_inside_active_world(min_x: int, max_x: int, min_y: int, max_y: int) -> bool:
        for x in (min_x, max_x):
            for y in (min_y, max_y):
                if chunk_for(x, y) not in active_chunk_coordinates:
                    return False
        return True

    height = user_count * block_size

    def start_y_touching(edge: dict[str, int | None], candidate_start_x: int) -> int | None:
        edge_min_y = edge.get("min_y")
        edge_max_y = edge.get("max_y")
        if edge_min_y is None or edge_max_y is None:
            return None

        # The first stress block must overlap an already claimed edge. After that,
        # later blocks can chain from the previous stress block.
        lowest_start = max(min_active_y, int(edge_min_y) - block_size + 1)
        highest_start = min(int(edge_max_y), max_active_y - height + 1)
        if lowest_start > highest_start:
            return None

        preferred = 0 if lowest_start <= 0 <= highest_start else int(edge_min_y)
        initial = max(lowest_start, min(preferred, highest_start))

        starts = [initial]
        offset = block_size
        while initial - offset >= lowest_start or initial + offset <= highest_start:
            if initial - offset >= lowest_start:
                starts.append(initial - offset)
            if initial + offset <= highest_start:
                starts.append(initial + offset)
            offset += block_size

        for start in starts:
            if rectangle_inside_active_world(
                candidate_start_x,
                candidate_start_x + block_size - 1,
                start,
                start + height - 1,
            ):
                return start

        return None

    if claimed_max_x is not None and claimed_max_x + block_size <= max_active_x:
        start_x = claimed_max_x + 1
        start_y = start_y_touching(edge_bounds["right"], int(start_x))
        if start_y is None:
            start_x = None
        else:
            start_x = int(start_x)
    else:
        start_x = None

    if start_x is None and claimed_min_x is not None and claimed_min_x - block_size >= min_active_x:
        start_x = claimed_min_x - block_size
        start_y = start_y_touching(edge_bounds["left"], int(start_x))
        if start_y is None:
            start_x = None

    if start_x is None:
        raise RuntimeError(
            "No adjacent active X/Y strip is available for stress claims. "
            f"Try fewer users or a smaller block size. active={active_bounds} edges={edge_bounds}"
        )

    blocks = []
    for idx in range(user_count):
        min_y = start_y + idx * block_size
        blocks.append(
            ClaimBlock(
                user_idx=idx,
                min_x=start_x,
                max_x=start_x + block_size - 1,
                min_y=min_y,
                max_y=min_y + block_size - 1,
            )
        )

    region = {
        "min_x": start_x,
        "max_x": start_x + block_size - 1,
        "min_y": start_y,
        "max_y": start_y + height - 1,
    }
    return region, blocks


def request_json(
    method: str,
    url: str,
    payload: dict[str, Any] | None,
    cookie_name: str | None,
    token: str | None,
    timeout: float,
) -> tuple[int, bytes, dict[str, Any] | None]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if cookie_name and token:
        headers["Cookie"] = f"{cookie_name}={token}"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read()
            parsed = json.loads(data.decode("utf-8")) if data else None
            return response.status, data, parsed
    except urllib.error.HTTPError as error:
        data = error.read()
        parsed = None
        try:
            parsed = json.loads(data.decode("utf-8")) if data else None
        except json.JSONDecodeError:
            parsed = {"raw": data[:500].decode("utf-8", "replace")}
        return error.code, data, parsed


def request_binary(url: str, timeout: float) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers={"Accept": "image/png"}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def timed_record(
    stage: str,
    op: str,
    func: Any,
    *,
    client_id: int | None = None,
    user_idx: int | None = None,
    tile: tuple[int, int] | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        status, body, parsed = func()
        elapsed_ms = (time.perf_counter() - started) * 1000
        ok = 200 <= status < 300
        return {
            "stage": stage,
            "op": op,
            "client_id": client_id,
            "user_idx": user_idx,
            "tile": tile,
            "status": status,
            "ok": ok,
            "elapsed_ms": elapsed_ms,
            "bytes": len(body),
            "detail": parsed.get("detail") if isinstance(parsed, dict) else None,
        }
    except Exception as error:  # noqa: BLE001 - stress tool records all request failures.
        elapsed_ms = (time.perf_counter() - started) * 1000
        return {
            "stage": stage,
            "op": op,
            "client_id": client_id,
            "user_idx": user_idx,
            "tile": tile,
            "status": None,
            "ok": False,
            "elapsed_ms": elapsed_ms,
            "bytes": 0,
            "detail": repr(error),
        }


def timed_binary_record(
    stage: str,
    op: str,
    url: str,
    timeout: float,
    *,
    client_id: int | None = None,
    user_idx: int | None = None,
    tile: tuple[int, int] | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        status, body = request_binary(url, timeout)
        elapsed_ms = (time.perf_counter() - started) * 1000
        return {
            "stage": stage,
            "op": op,
            "client_id": client_id,
            "user_idx": user_idx,
            "tile": tile,
            "status": status,
            "ok": 200 <= status < 300,
            "elapsed_ms": elapsed_ms,
            "bytes": len(body),
            "detail": None,
        }
    except Exception as error:  # noqa: BLE001 - stress tool records all request failures.
        elapsed_ms = (time.perf_counter() - started) * 1000
        return {
            "stage": stage,
            "op": op,
            "client_id": client_id,
            "user_idx": user_idx,
            "tile": tile,
            "status": None,
            "ok": False,
            "elapsed_ms": elapsed_ms,
            "bytes": 0,
            "detail": repr(error),
        }


def tile_for(x: int, y: int) -> tuple[int, int]:
    return math.floor(x / WORLD_TILE_SIZE), math.floor(y / WORLD_TILE_SIZE)


def paint_payload(block: ClaimBlock, stage_index: int, client_id: int, batch_index: int, pixels_per_batch: int) -> dict[str, Any]:
    coordinates = [
        (x, y)
        for y in range(block.min_y, block.max_y + 1)
        for x in range(block.min_x, block.max_x + 1)
    ]
    start = (stage_index * 17 + client_id * 7 + batch_index * pixels_per_batch) % len(coordinates)
    selected = [coordinates[(start + offset) % len(coordinates)] for offset in range(pixels_per_batch)]

    tiles: dict[tuple[int, int], dict[str, int]] = {}
    for offset, (x, y) in enumerate(selected):
        tile_x, tile_y = tile_for(x, y)
        local_x = x - tile_x * WORLD_TILE_SIZE
        local_y = y - tile_y * WORLD_TILE_SIZE
        pixel_offset = local_y * WORLD_TILE_SIZE + local_x
        color_id = COLOR_IDS[(stage_index * 11 + client_id + batch_index + offset) % len(COLOR_IDS)]
        tiles.setdefault((tile_x, tile_y), {})[str(pixel_offset)] = color_id

    return {
        "season": 0,
        "tiles": [
            {"x": tile_x, "y": tile_y, "pixels": pixels}
            for (tile_x, tile_y), pixels in sorted(tiles.items(), key=lambda item: (item[0][1], item[0][0]))
        ],
    }


def parse_cpu_percent(raw: str) -> float:
    try:
        return float(raw.replace("%", "").strip())
    except ValueError:
        return 0.0


def collect_docker_stats(stop_event: threading.Event, samples: list[dict[str, Any]]) -> None:
    while not stop_event.is_set():
        try:
            proc = subprocess.run(
                [
                    "docker",
                    "stats",
                    "--no-stream",
                    "--format",
                    "{{json .}}",
                ],
                text=True,
                capture_output=True,
                timeout=10,
            )
            timestamp = time.time()
            for line in proc.stdout.splitlines():
                if not line.strip():
                    continue
                row = json.loads(line)
                name = row.get("Name", "")
                if not name.startswith("pixelproject-"):
                    continue
                samples.append(
                    {
                        "timestamp": timestamp,
                        "name": name,
                        "cpu_percent": parse_cpu_percent(str(row.get("CPUPerc", "0"))),
                        "mem_usage": row.get("MemUsage"),
                        "net_io": row.get("NetIO"),
                        "block_io": row.get("BlockIO"),
                        "pids": row.get("PIDs"),
                    }
                )
        except Exception:
            pass
        stop_event.wait(1.0)


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil((pct / 100.0) * len(ordered)) - 1))
    return ordered[index]


def summarize_records(records: list[dict[str, Any]]) -> dict[str, Any]:
    by_op: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        by_op.setdefault(record["op"], []).append(record)

    summary: dict[str, Any] = {
        "requests": len(records),
        "failures": sum(1 for record in records if not record["ok"]),
        "ops": {},
    }
    for op, op_records in sorted(by_op.items()):
        timings = [float(record["elapsed_ms"]) for record in op_records]
        bytes_total = sum(int(record.get("bytes") or 0) for record in op_records)
        statuses: dict[str, int] = {}
        details: dict[str, int] = {}
        for record in op_records:
            statuses[str(record.get("status"))] = statuses.get(str(record.get("status")), 0) + 1
            detail = record.get("detail")
            if detail:
                detail_key = str(detail)[:160]
                details[detail_key] = details.get(detail_key, 0) + 1
        summary["ops"][op] = {
            "requests": len(op_records),
            "failures": sum(1 for record in op_records if not record["ok"]),
            "avg_ms": sum(timings) / len(timings) if timings else 0.0,
            "p50_ms": percentile(timings, 50),
            "p90_ms": percentile(timings, 90),
            "p95_ms": percentile(timings, 95),
            "p99_ms": percentile(timings, 99),
            "max_ms": max(timings) if timings else 0.0,
            "bytes_total": bytes_total,
            "statuses": statuses,
            "details": details,
        }
    return summary


def summarize_stats(samples: list[dict[str, Any]]) -> dict[str, Any]:
    by_name: dict[str, list[dict[str, Any]]] = {}
    for sample in samples:
        by_name.setdefault(sample["name"], []).append(sample)

    return {
        name: {
            "samples": len(rows),
            "max_cpu_percent": max((float(row["cpu_percent"]) for row in rows), default=0.0),
            "last_mem_usage": rows[-1].get("mem_usage") if rows else None,
            "last_net_io": rows[-1].get("net_io") if rows else None,
            "last_block_io": rows[-1].get("block_io") if rows else None,
            "last_pids": rows[-1].get("pids") if rows else None,
        }
        for name, rows in sorted(by_name.items())
    }


def log_summary(logger: TeeLogger, stage_name: str, summary: dict[str, Any], stats_summary: dict[str, Any]) -> None:
    logger.log(
        f"{stage_name}: requests={summary['requests']} failures={summary['failures']}"
    )
    for op, op_summary in summary["ops"].items():
        logger.log(
            f"  {op}: n={op_summary['requests']} fail={op_summary['failures']} "
            f"avg={op_summary['avg_ms']:.1f}ms p95={op_summary['p95_ms']:.1f}ms "
            f"max={op_summary['max_ms']:.1f}ms statuses={op_summary['statuses']}"
        )
        if op_summary["details"]:
            logger.log(f"    details={op_summary['details']}")
    for name, row in stats_summary.items():
        logger.log(
            f"  stats {name}: max_cpu={row['max_cpu_percent']:.1f}% "
            f"mem={row['last_mem_usage']} net={row['last_net_io']} block={row['last_block_io']}"
        )


def claim_blocks(
    users: list[StressUser],
    blocks: list[ClaimBlock],
    cookie_name: str,
    logger: TeeLogger,
    timeout: float,
) -> tuple[list[dict[str, Any]], list[ClaimBlock]]:
    logger.log(f"Writing {len(blocks)} claim blocks sequentially through the API")
    records: list[dict[str, Any]] = []
    claimed: list[ClaimBlock] = []
    stage = "claim-setup"
    stop_event = threading.Event()
    stats_samples: list[dict[str, Any]] = []
    sampler = threading.Thread(target=collect_docker_stats, args=(stop_event, stats_samples), daemon=True)
    sampler.start()

    try:
        for index, block in enumerate(blocks):
            user = users[block.user_idx]
            payload = {
                "pixels": [],
                "rectangles": [
                    {
                        "min_x": block.min_x,
                        "max_x": block.max_x,
                        "min_y": block.min_y,
                        "max_y": block.max_y,
                    }
                ],
            }
            record = timed_record(
                stage,
                "claim",
                lambda payload=payload, user=user: request_json(
                    "POST",
                    f"{API_BASE}/world/claims/batch",
                    payload,
                    cookie_name,
                    user.token,
                    timeout,
                ),
                user_idx=user.idx,
            )
            records.append(record)
            if record["ok"]:
                claimed.append(block)
            else:
                logger.log(
                    f"Claim failed at user={user.idx} status={record['status']} detail={record['detail']}"
                )
                break
            if (index + 1) % 50 == 0:
                logger.log(f"  claimed {index + 1}/{len(blocks)} blocks")
    finally:
        stop_event.set()
        sampler.join(timeout=5)

    summary = summarize_records(records)
    stats_summary = summarize_stats(stats_samples)
    log_summary(logger, stage, summary, stats_summary)
    return records, claimed


def seed_claim_blocks_direct(
    blocks: list[ClaimBlock],
    logger: TeeLogger,
) -> dict[str, Any]:
    logger.log(f"Directly seeding {len(blocks)} claim blocks into the local DB")
    blocks_json = json.dumps(
        [
            {
                "user_idx": block.user_idx,
                "min_x": block.min_x,
                "max_x": block.max_x,
                "min_y": block.min_y,
                "max_y": block.max_y,
            }
            for block in blocks
        ]
    )
    code = f"""
import asyncio
import json
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import update

from app.core.config import get_settings
from app.db.session import AsyncSessionLocal
from app.models.claim_area import ClaimArea
from app.models.user import User
from app.models.world_chunk import WorldChunk
from app.models.world_pixel import WorldPixel
from app.services.pixels import get_chunk_coordinates_for_pixel, get_world_tile_key, invalidate_world_tiles

BLOCKS = json.loads({blocks_json!r})


async def main():
    settings = get_settings()
    now = datetime.now(timezone.utc)
    total_rows = 0
    total_areas = 0
    chunk_counts = {{}}
    tile_coordinates = set()

    async with AsyncSessionLocal() as db:
        users = (
            await db.scalars(
                select(User).where(User.google_subject.in_([
                    f"stress-paint-{{block['user_idx']:04d}}" for block in BLOCKS
                ]))
            )
        ).all()
        user_by_idx = {{
            int(user.google_subject.rsplit("-", 1)[1]): user
            for user in users
        }}

        for index, block in enumerate(BLOCKS):
            user = user_by_idx[int(block["user_idx"])]
            area = ClaimArea(
                owner_user_id=user.id,
                name="Stress seeded area",
                description="Seeded by local stress_paint_system.py",
                claimed_pixels_count=0,
                painted_pixels_count=0,
                last_activity_at=now,
            )
            db.add(area)
            await db.flush()

            rows = []
            for y in range(int(block["min_y"]), int(block["max_y"]) + 1):
                for x in range(int(block["min_x"]), int(block["max_x"]) + 1):
                    chunk_x, chunk_y = get_chunk_coordinates_for_pixel(x, y, settings)
                    rows.append(
                        {{
                            "id": uuid4(),
                            "x": x,
                            "y": y,
                            "chunk_x": chunk_x,
                            "chunk_y": chunk_y,
                            "color_id": None,
                            "owner_user_id": user.id,
                            "area_id": area.id,
                            "is_starter": False,
                        }}
                    )
                    tile_coordinates.add(get_world_tile_key(x, y))
                    chunk_coordinate = (chunk_x, chunk_y)
                    chunk_counts[chunk_coordinate] = chunk_counts.get(chunk_coordinate, 0) + 1

            await db.execute(insert(WorldPixel), rows)
            area.claimed_pixels_count = len(rows)
            area.last_activity_at = now
            user.holders_placed_total += len(rows)
            user.claimed_pixels_count += len(rows)
            total_rows += len(rows)
            total_areas += 1

            if (index + 1) % 50 == 0:
                await db.commit()

        for (chunk_x, chunk_y), claimed_count in chunk_counts.items():
            await db.execute(
                update(WorldChunk)
                .where(WorldChunk.chunk_x == chunk_x, WorldChunk.chunk_y == chunk_y)
                .values(claimed_pixels_count=WorldChunk.claimed_pixels_count + claimed_count)
            )

        await db.commit()

    invalidate_world_tiles(tile_coordinates, {{"claims"}})
    result = {{
        "blocks": len(BLOCKS),
        "rows": total_rows,
        "areas": total_areas,
        "claim_tiles_invalidated": [
            {{"tile_x": tile_x, "tile_y": tile_y}}
            for tile_x, tile_y in sorted(tile_coordinates, key=lambda tile: (tile[1], tile[0]))
        ],
    }}
    print("JSON_RESULT_START")
    print(json.dumps(result))
    print("JSON_RESULT_END")


asyncio.run(main())
"""
    started = time.perf_counter()
    result = run_compose_python(code, timeout=300)
    result["elapsed_ms"] = (time.perf_counter() - started) * 1000
    logger.log(
        f"Direct seed done: blocks={result['blocks']} rows={result['rows']} "
        f"areas={result['areas']} elapsed={result['elapsed_ms']:.1f}ms"
    )
    return result


def run_paint_level(
    level: int,
    stage_index: int,
    users: list[StressUser],
    blocks: list[ClaimBlock],
    cookie_name: str,
    logger: TeeLogger,
    batches_per_user: int,
    pixels_per_batch: int,
    timeout: float,
    reload_tiles: bool,
) -> dict[str, Any]:
    stage = f"{'mixed' if reload_tiles else 'paint'}-{level}"
    logger.log(
        f"Starting {stage}: clients={level}, batches/client={batches_per_user}, "
        f"pixels/batch={pixels_per_batch}, reload_tiles={reload_tiles}"
    )
    records: list[dict[str, Any]] = []
    stats_samples: list[dict[str, Any]] = []
    stop_event = threading.Event()
    sampler = threading.Thread(target=collect_docker_stats, args=(stop_event, stats_samples), daemon=True)
    sampler.start()
    barrier = threading.Barrier(level)
    records_lock = threading.Lock()

    def worker(client_id: int) -> list[dict[str, Any]]:
        local_records: list[dict[str, Any]] = []
        user = users[client_id % len(users)]
        block = blocks[client_id % len(blocks)]
        try:
            barrier.wait(timeout=30)
        except threading.BrokenBarrierError:
            pass

        for batch_index in range(batches_per_user):
            payload = paint_payload(block, stage_index, client_id, batch_index, pixels_per_batch)
            paint_record = timed_record(
                stage,
                "paint",
                lambda payload=payload, user=user: request_json(
                    "POST",
                    f"{API_BASE}/world/paint",
                    payload,
                    cookie_name,
                    user.token,
                    timeout,
                ),
                client_id=client_id,
                user_idx=user.idx,
            )
            local_records.append(paint_record)

            if reload_tiles and paint_record["ok"]:
                paint_tiles = payload["tiles"]
                seen_tiles = {(int(tile["x"]), int(tile["y"])) for tile in paint_tiles}
                for tile_x, tile_y in sorted(seen_tiles, key=lambda tile: (tile[1], tile[0])):
                    local_records.append(
                        timed_binary_record(
                            stage,
                            "tile_paint",
                            f"{API_BASE}/world/tiles/paint/{tile_x}/{tile_y}.png",
                            timeout,
                            client_id=client_id,
                            user_idx=user.idx,
                            tile=(tile_x, tile_y),
                        )
                    )
                    local_records.append(
                        timed_binary_record(
                            stage,
                            "tile_claims",
                            f"{API_BASE}/world/tiles/claims/{tile_x}/{tile_y}.png",
                            timeout,
                            client_id=client_id,
                            user_idx=user.idx,
                            tile=(tile_x, tile_y),
                        )
                    )

        with records_lock:
            records.extend(local_records)
        return local_records

    start = time.perf_counter()
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=level) as executor:
            futures = [executor.submit(worker, client_id) for client_id in range(level)]
            for future in concurrent.futures.as_completed(futures):
                future.result()
    finally:
        stop_event.set()
        sampler.join(timeout=5)

    duration_s = time.perf_counter() - start
    summary = summarize_records(records)
    stats_summary = summarize_stats(stats_samples)
    summary["duration_s"] = duration_s
    summary["stats"] = stats_summary
    log_summary(logger, stage, summary, stats_summary)
    return {
        "stage": stage,
        "level": level,
        "reload_tiles": reload_tiles,
        "duration_s": duration_s,
        "summary": summary,
        "stats_samples": stats_samples,
        "records": records,
    }


def health_check(timeout: float = 10.0) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        status, body, parsed = request_json("GET", f"{API_BASE}/health", None, None, None, timeout)
        return {
            "status": status,
            "ok": 200 <= status < 300,
            "elapsed_ms": (time.perf_counter() - started) * 1000,
            "body": parsed,
            "bytes": len(body),
        }
    except Exception as error:  # noqa: BLE001 - stress tool records all health failures.
        return {
            "status": None,
            "ok": False,
            "elapsed_ms": (time.perf_counter() - started) * 1000,
            "body": repr(error),
            "bytes": 0,
        }


def should_stop(stage_result: dict[str, Any], break_p95_ms: float, break_max_ms: float) -> str | None:
    summary = stage_result["summary"]
    if summary["failures"] > 0:
        return "request failures"

    paint = summary["ops"].get("paint")
    if paint:
        if paint["p95_ms"] >= break_p95_ms:
            return f"paint p95 {paint['p95_ms']:.1f}ms >= {break_p95_ms:.1f}ms"
        if paint["max_ms"] >= break_max_ms:
            return f"paint max {paint['max_ms']:.1f}ms >= {break_max_ms:.1f}ms"

    tile_paint = summary["ops"].get("tile_paint")
    if tile_paint and tile_paint["p95_ms"] >= break_p95_ms:
        return f"paint tile p95 {tile_paint['p95_ms']:.1f}ms >= {break_p95_ms:.1f}ms"

    return None


def parse_levels(raw: str) -> list[int]:
    return [int(part.strip()) for part in raw.split(",") if part.strip()]


def sanitize_setup_for_report(setup: dict[str, Any]) -> dict[str, Any]:
    sanitized = dict(setup)
    sanitized["users"] = [
        {
            "idx": user["idx"],
            "email": user["email"],
            "public_id": user["public_id"],
        }
        for user in setup.get("users", [])
    ]
    return sanitized


def main() -> None:
    parser = argparse.ArgumentParser(description="Stress test local PixelProject paint and claim APIs.")
    parser.add_argument("--users", type=int, default=600)
    parser.add_argument("--block-size", type=int, default=12)
    parser.add_argument("--levels", default="10,20,40,80,160,320,600")
    parser.add_argument("--batches-per-user", type=int, default=6)
    parser.add_argument("--pixels-per-batch", type=int, default=12)
    parser.add_argument("--timeout", type=float, default=20.0)
    parser.add_argument("--break-p95-ms", type=float, default=5000.0)
    parser.add_argument("--break-max-ms", type=float, default=20000.0)
    parser.add_argument("--reload-tiles", action="store_true")
    parser.add_argument("--skip-claims", action="store_true")
    parser.add_argument("--seed-claims-direct", action="store_true")
    parser.add_argument("--artifact-dir", default="stress-artifacts")
    args = parser.parse_args()

    artifact_dir = Path(args.artifact_dir)
    label = now_label()
    log_path = artifact_dir / f"stress-paint-{label}.log"
    report_path = artifact_dir / f"stress-paint-{label}.json"
    logger = TeeLogger(log_path)
    random.seed(42)

    report: dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "arguments": vars(args),
        "log_path": str(log_path),
        "report_path": str(report_path),
        "stages": [],
    }

    logger.log("Stress test started")
    setup = setup_users(args.users, logger)
    users = [StressUser(**raw) for raw in setup["users"]]
    cookie_name = setup["cookie_name"]
    claim_region, planned_blocks = choose_claim_region(
        setup["active_bounds"],
        setup["active_chunks"],
        setup["world"],
        setup["claim_bounds"],
        setup["edge_bounds"],
        args.users,
        args.block_size,
    )
    report["setup"] = sanitize_setup_for_report(setup)
    report["claim_region"] = claim_region
    logger.log(f"Active bounds: {setup['active_bounds']}")
    logger.log(f"Active chunks: {setup['active_chunks']}")
    logger.log(f"Existing claim bounds before test: {setup['claim_bounds']}")
    logger.log(f"Existing edge bounds before test: {setup['edge_bounds']}")
    logger.log(f"Stress claim region: {claim_region}")

    report["region_stats_before"] = region_stats(claim_region, logger, "before")
    if args.skip_claims:
        claimed_blocks = planned_blocks
        report["claim_records"] = []
        logger.log("Skipping claim setup by request")
    elif args.seed_claims_direct:
        report["direct_seed"] = seed_claim_blocks_direct(planned_blocks, logger)
        claimed_blocks = planned_blocks
        report["claim_records"] = []
    else:
        claim_records, claimed_blocks = claim_blocks(users, planned_blocks, cookie_name, logger, args.timeout)
        report["claim_records"] = claim_records
        report["claim_summary"] = summarize_records(claim_records)

    report["claimed_block_count"] = len(claimed_blocks)
    report["region_stats_after_claims"] = region_stats(claim_region, logger, "after_claims")

    levels = parse_levels(args.levels)
    stop_reason = None
    for stage_index, level in enumerate(levels):
        if level > len(claimed_blocks):
            logger.log(f"Skipping level {level}: only {len(claimed_blocks)} claimed blocks available")
            continue

        result = run_paint_level(
            level,
            stage_index,
            users,
            claimed_blocks,
            cookie_name,
            logger,
            args.batches_per_user,
            args.pixels_per_batch,
            args.timeout,
            args.reload_tiles,
        )
        result["health_after"] = health_check()
        logger.log(f"Health after {result['stage']}: {result['health_after']}")
        report["stages"].append(result)
        reason = should_stop(result, args.break_p95_ms, args.break_max_ms)
        if reason:
            stop_reason = f"{result['stage']}: {reason}"
            logger.log(f"Stopping stress ramp: {stop_reason}")
            break

    report["stop_reason"] = stop_reason
    report["region_stats_after_paint"] = region_stats(claim_region, logger, "after_paint")
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    logger.log(f"Report written to {report_path}")
    logger.log("Stress test finished")


if __name__ == "__main__":
    main()
