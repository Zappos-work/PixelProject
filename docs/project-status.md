# Project Status

Last updated: 2026-04-19

## Current Snapshot

- Current frontend build marker: `0.0.8`.
- Local development stack is running through Docker Compose.
- Frontend is available on `http://localhost:3000`.
- Backend API and docs are available on `http://localhost:8000`.
- PostgreSQL and Redis are connected and included in local startup.
- A dedicated changelog is now tracked in `docs/changelog.md` and mirrored in the in-app information modal.

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
- Google OAuth foundation is now wired through the backend with automatic user creation and cookie-based sessions.
- The frontend account modal now talks to the live auth session endpoint and supports real login and logout flows.
- Local Google OAuth credentials are now configured for localhost, and the backend login endpoint has been verified to redirect to Google correctly.
- Signed-in players now see a centered holder HUD, a shop entry button, a fixed `#` public player number, and a profile flow built around a default avatar plus 30-day display-name changes.
- Holder regeneration is now calculated live on the backend from stored timestamps instead of requiring per-user timers.
- The holder HUD now projects regeneration locally from backend timestamps, which keeps the countdown smooth without polling every second.
- The first live claim loop is now active: authenticated players can only claim new cells if they touch the starter frontier or another claimed cell.
- Holders are now consumed by claiming only; painting is restricted to already claimed cells owned by the player.
- Claimed territory is now highlighted in the viewport, with starter-frontier cells shown separately from owned territory.
- `holders_placed_total`, claimed-pixel stats, level progress, and territory ownership now update from actual claim events.
- The account modal now includes custom avatar upload with automatic crop/resize handling, compact previous-upload history, and a pencil shortcut under the profile image.
- Authenticated players now get `/me` as raw JSON output, exposing all currently known account fields from the backend instead of a separate HTML settings page.
- Newly created accounts are redirected back into the main app and prompted there to choose a display name before settling in.

## Confirmed World Decisions

- World origin is `0:0`.
- Chunks currently use a size of `5,000 x 5,000`.
- Backend chunk data is already seeded around the origin for later gameplay systems.
- Backend chunks remain hidden in the frontend view.
- The next growth logic should later create additional chunks when players approach the active border buffer.

## Open Work Areas

- Exact claim-shape editor tools and multi-pixel area claiming.
- Pixel history, first-paint coin rewards, and moderation rollback tools.
- Live chunk subscriptions and WebSocket update strategy.
- Future far-zoom support should avoid loading every pixel at once by using chunk-aware streaming or level-of-detail rendering.
- Holder/coin balancing, rate-limits, and broader gameplay systems beyond the first pixel-placement loop.

## Recommended Next Implementation Step

- Expand the claim-first gameplay layer with multi-pixel claim tools, contributor permissions, or realtime multiplayer updates.
