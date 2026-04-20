# Project Foundation

This document captures the first confirmed implementation decisions after the planning README.

## Confirmed Decisions

- The world has a clear origin point at `0:0`.
- The first world anchor is seeded from the backend bootstrap so a valid starting chunk exists in the database.
- Chunks are currently configured as `5,000 x 5,000`.
- The current expansion rule reserves a `5,000` pixel buffer near the world border before a new chunk should be created.
- The first implementation pass started local-only and Docker-based.
- The first production domain is `pixel.zappos-dev.work`.
- Production uses Docker Compose with Caddy as the reverse proxy.

## Current Local Foundation

- `frontend`: Next.js, React and TypeScript.
- `backend`: FastAPI, SQLAlchemy, Redis integration and seeded world bootstrap.
- `docker-compose.yml`: local development stack with frontend, backend, PostgreSQL and Redis.
- `GET /api/v1/health`: verifies API, database and Redis state.
- `GET /api/v1/world/overview`: returns the seeded world origin and current chunks.
- A visible starter chunk ring is seeded so the local world is not empty.
- The frontend already includes a first draggable and zoomable world preview.

## Current Production Foundation

- Production URL: `https://pixel.zappos-dev.work`.
- Server project directory: `/opt/pixelproject`.
- Production Compose file: `/opt/pixelproject/compose.prod.yml`.
- Reverse proxy: Caddy with automatic HTTPS through Let's Encrypt.
- Public ports: `80` and `443`.
- Internal services: `frontend:3000`, `backend:8000`, `db:5432`, `redis:6379`.
- PostgreSQL and Redis are not directly exposed publicly.
- Production health endpoint: `https://pixel.zappos-dev.work/api/v1/health`.
- Detailed server notes are tracked in `docs/production-deployment.md`.

## Questions Still Open

- Exact claim validity rules, especially connectivity and the first player claim flow.
- Realtime chunk subscriptions, batching and fallback behavior under load.
- Holder regeneration, coin balancing and anti-exploit rules.
- Area inactivity handling for partially painted claims.
- Overlay conversion details, including palette mapping and browser consistency.
