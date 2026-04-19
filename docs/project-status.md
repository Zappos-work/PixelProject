# Project Status

Last updated: 2026-04-19

## Current Snapshot

- Current frontend build marker: `0.0.2`.
- Local development stack is running through Docker Compose.
- Frontend is available on `http://localhost:3000`.
- Backend API and docs are available on `http://localhost:8000`.
- PostgreSQL and Redis are connected and included in local startup.

## Implemented So Far

- Monorepo-style project structure with dedicated `frontend`, `backend`, and `docs` folders.
- FastAPI foundation with health endpoint and world overview endpoint.
- World bootstrap that seeds a visible starter chunk ring around the origin.
- Fullscreen frontend world viewport with minimal HUD instead of a dashboard-style landing page.
- The visible frontend canvas is intentionally empty; backend chunk structure is not rendered.
- Info and login now open in modal windows instead of occupying the main page.
- Grid toggle, dark mode toggle and a crosshair-style canvas cursor are now part of the viewport interaction.
- The pixel grid appears only at higher zoom levels and can be toggled on or off.
- Left mouse dragging is the primary movement interaction inside the canvas.
- Drag handling is hardened against pointer-release race conditions during panning.
- The current active chunk field now renders only a thick outer perimeter, without inner borders between adjacent chunks.
- The info area now shows a visible frontend version marker that should be incremented with each relevant UI change.
- Initial camera fit and minimum zoom now ensure the full active canvas field can be seen at once.
- Grid lines are now rendered from the same viewport coordinate system as the world border to keep both aligned.
- Clicking the canvas now exposes pixel coordinates for debugging and placement control.
- Camera panning is now clamped to dynamic chunk-coupled bounds instead of allowing infinite drift.

## Confirmed World Decisions

- World origin is `0:0`.
- Chunks currently use a size of `5,000 x 5,000`.
- Backend chunk data is already seeded around the origin for later gameplay systems.
- Backend chunks remain hidden in the frontend view.
- The next growth logic should later create additional chunks when players approach the active border buffer.

## Open Work Areas

- Exact claim validity rules and first-claim bootstrapping by command.
- Authentication with Google OAuth.
- Real pixel storage, color palette handling, and paint history.
- Live chunk subscriptions and WebSocket update strategy.
- Future far-zoom support should avoid loading every pixel at once by using chunk-aware streaming or level-of-detail rendering.
- Holder and coin balancing.

## Recommended Next Implementation Step

- Build the first backend-backed claim bootstrap flow so a starter Area can exist inside the seeded world.
