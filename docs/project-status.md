# Project Status

Last updated: 2026-04-19

## Current Snapshot

- Local development stack is running through Docker Compose.
- Frontend is available on `http://localhost:3000`.
- Backend API and docs are available on `http://localhost:8000`.
- PostgreSQL and Redis are connected and included in local startup.

## Implemented So Far

- Monorepo-style project structure with dedicated `frontend`, `backend`, and `docs` folders.
- FastAPI foundation with health endpoint and world overview endpoint.
- World bootstrap that seeds a visible starter chunk ring around the origin.
- Fullscreen frontend world viewport with minimal HUD instead of a dashboard-style landing page.
- Info and login now open in modal windows instead of occupying the main page.
- Grid toggle, dark mode toggle and a crosshair-style canvas cursor are now part of the viewport interaction.
- Starter landmarks that make the world feel readable before real claim and pixel systems exist.

## Confirmed World Decisions

- World origin is `0:0`.
- Chunks currently use a size of `5,000 x 5,000`.
- A first visible starter world is seeded around the origin so local development is not visually empty.
- The next growth logic should later create additional chunks when players approach the active border buffer.

## Open Work Areas

- Exact claim validity rules and first-claim bootstrapping by command.
- Authentication with Google OAuth.
- Real pixel storage, color palette handling, and paint history.
- Live chunk subscriptions and WebSocket update strategy.
- Holder and coin balancing.

## Recommended Next Implementation Step

- Build the first backend-backed claim bootstrap flow so a starter Area can exist inside the seeded world.
