# PixelProject

PixelProject is a browser-based multiplayer pixel canvas game built with Next.js and FastAPI.

The repository is no longer just a planning sandbox. It already contains a working local stack, a live production deployment, Google login, a centered world, claim areas, staged painting, contributor support, cached world tiles, and an in-app changelog/debug workflow.

## Current Status

- Current frontend build marker: `0.2.0`
- Production URL: `https://pixel.zappos-dev.work`
- Local frontend: `http://localhost:3000`
- Local backend API docs: `http://localhost:8000/docs`
- Local stack: Docker Compose with frontend, backend, PostgreSQL, and Redis

## What Exists Today

- Google OAuth login with cookie-based sessions
- Profile flow with public player IDs, display-name setup, and avatar uploads
- Separate resource systems for claiming and painting
  - Holders for claiming land
  - Normal Pixels for painting color
- Centered world coordinates with `0:0` in the middle of the starter canvas
- One active starter chunk sized `4,000 x 4,000`
- Automatic world growth around the origin
- Growth progression based on painted fill percentage of the active world shape
- Claim Areas with owner metadata, contributors, active/finished states, public `#` IDs, and editable names/descriptions
- Canvas-side area inspection and a personal "My Areas" view
- Staged claim and paint workflow before submit
- Claim brush and rectangle tools
- Paint brush and local eraser workflow
- Visual overview tiles plus semantic build-mode data loading
- Cached `1,000 x 1,000` backend PNG tiles for world rendering
- Request guardrails for oversized world reads and off-world tile cache generation
- Separate development and production Docker image stages
- Canvas debug/performance instrumentation through `?perf=1`
- First production deployment with Docker Compose, Caddy, PostgreSQL backups, and GitHub Actions deploys

## Current Gameplay Snapshot

- Guests can explore the world, zoom, pan, inspect areas, and open informational modals.
- Signed-in users can claim land only where the backend allows it.
- Painting is limited to active areas the player owns or contributes to.
- Claim Areas can be finished. Finished areas remain visible as artwork and become read-only.
- Unpainted claim pixels are released when an area is finished.
- The world expands when the currently active shape reaches the configured painted fill threshold.

## Tech Stack

- Frontend: Next.js 15, React 19, TypeScript
- Backend: FastAPI, SQLAlchemy, asyncpg, Redis, Pillow
- Database: PostgreSQL 16
- Cache/auxiliary services: Redis 7
- Local orchestration: Docker Compose
- Production reverse proxy: Caddy
- Deployment: GitHub Actions to a Docker Compose server

## Repository Layout

```text
.
|- backend/        FastAPI app, services, routes, CLI utilities, tile cache
|- frontend/       Next.js app, world renderer, changelog, debug tooling
|- docs/           Project status, runbooks, deployment notes, changelog
|- tools/          Helper tooling
|- docker-compose.yml
|- .env.example
`- README.md
```

## Local Development

### Prerequisites

- Docker Desktop or a compatible local Docker environment
- A Google OAuth app if you want to test login locally

### First Start

1. Copy `.env.example` to `.env`
2. Adjust any local values you need
3. Run:

```bash
docker compose up --build
```

4. Open:

- `http://localhost:3000`
- `http://localhost:8000/docs`

To stop the stack:

```bash
docker compose down
```

## Local OAuth Setup

To test Google login locally, fill these values in `.env`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback`
- `FRONTEND_APP_URL=http://localhost:3000`

Recommended Google OAuth entries:

- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:8000/api/v1/auth/google/callback`

## Important Environment Variables

The defaults in `.env.example` already describe the current project shape.

Important world settings:

- `WORLD_ORIGIN_X=-2000`
- `WORLD_ORIGIN_Y=-2000`
- `WORLD_CHUNK_SIZE=4000`
- `WORLD_EXPANSION_BUFFER=0`
- `WORLD_EXPANSION_CLAIM_FILL_RATIO=0.7`

Important gameplay defaults:

- `HOLDER_START_AMOUNT=128`
- `HOLDER_START_LIMIT=1000`
- `HOLDER_REGENERATION_INTERVAL_SECONDS=10`
- `CLAIM_AREA_START_LIMIT=1`
- `NORMAL_PIXEL_START_AMOUNT=64`
- `NORMAL_PIXEL_START_LIMIT=64`
- `NORMAL_PIXEL_REGENERATION_INTERVAL_SECONDS=30`

## Useful Commands

Warm active world tiles:

```bash
docker compose exec backend python -m app.cli.warm_world_tiles --clear-cache
```

Warm only the visual overview layer:

```bash
docker compose exec backend python -m app.cli.warm_world_tiles --layer visual
```

Warm only the claim layer:

```bash
docker compose exec backend python -m app.cli.warm_world_tiles --layer claims
```

Run the area benchmark helper:

```bash
docker compose exec backend python -m app.cli.benchmark_area_details
```

Run the frontend world performance helper from the frontend workspace:

```bash
cd frontend
npm run perf:world
```

## API Surface

Important routes already implemented:

- `GET /api/v1/health`
- `GET /api/v1/auth/session`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/google/login`
- `POST /api/v1/auth/logout`
- `PATCH /api/v1/auth/profile/display-name`
- `POST /api/v1/auth/profile/avatar-upload`
- `GET /api/v1/world/overview`
- `GET /api/v1/world/palette`
- `GET /api/v1/world/pixels`
- `GET /api/v1/world/claims/outline`
- `GET /api/v1/world/tiles/{layer}/{tile_x}/{tile_y}.png`
- `POST /api/v1/world/claims`
- `POST /api/v1/world/claims/batch`
- `POST /api/v1/world/paint`
- `GET /api/v1/world/areas/mine`
- `GET /api/v1/world/areas/by-pixel`
- `GET /api/v1/world/areas/visible`
- `GET /api/v1/world/areas/{area_id}`
- `PATCH /api/v1/world/areas/{area_id}`
- `POST /api/v1/world/areas/{area_id}/contributors`

## Rendering And World Architecture

- The world is not rendered as one giant image.
- Backend-rendered PNG tiles are cached under `backend/.tile-cache`.
- Detail tiles use `1,000 x 1,000` world pixels.
- The frontend uses a combined visual overview layer when browsing.
- Semantic build mode loads additional per-pixel data such as visible pixels, area previews, and claim outlines.
- `GET /api/v1/world/overview` is intentionally kept cheap and should not trigger heavy growth synchronization during normal page load.

## Production

- Live deployment: `https://pixel.zappos-dev.work`
- Production deploy workflow: `.github/workflows/deploy.yml`
- Production world origin is centered with `WORLD_ORIGIN_X=-2000` and `WORLD_ORIGIN_Y=-2000`
- Production uses Docker Compose, Caddy, PostgreSQL, and Redis
- Daily PostgreSQL backups are configured on the server with retention

Full operational details live in:

- `docs/production-deployment.md`

## Documentation Index

- `docs/project-status.md`
  - current implementation snapshot
- `docs/project-foundation.md`
  - confirmed architectural decisions
- `docs/production-deployment.md`
  - production server and deploy runbook
- `docs/changelog.md`
  - release notes and change tracking

## What Is Still Missing

The project is playable and deployed, but it is not feature-complete yet.

Major work still planned:

- Pixel history and moderation rollback
- First-paint coin economy
- Reports and moderation tools
- Broader editor tools beyond the current brush/rectangle baseline
- Realtime subscriptions and push updates beyond the current request-driven flow
- More production hardening, monitoring, and external backup layers

## License

PixelProject is proprietary software. See `LICENSE`.
