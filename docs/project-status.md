# Project Status

Last updated: 2026-04-24

## Current Snapshot

- Current frontend build marker: `0.1.12`.
- Local development stack is running through Docker Compose.
- Frontend is available on `http://localhost:3000`.
- Backend API and docs are available on `http://localhost:8000`.
- First production deployment is live at `https://pixel.zappos-dev.work`.
- Production health is available at `https://pixel.zappos-dev.work/api/v1/health`.
- PostgreSQL and Redis are connected and included in local startup.
- Production uses Docker Compose with Caddy, PostgreSQL and Redis on the server.
- Docker builds now have separate local development and production runtime stages.
- Daily PostgreSQL backups are configured on the server with 14-day retention.
- A dedicated changelog is tracked in `docs/changelog.md` and is now opened in-app from the clickable version badge.

## Implemented So Far

- Monorepo-style project structure with dedicated `frontend`, `backend`, and `docs` folders.
- FastAPI foundation with health endpoint and world overview endpoint.
- World bootstrap that starts with a single active origin chunk.
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
- The version badge now opens a dedicated changelog modal, separate from the info modal.
- Long modal content is now constrained to the viewport with internal scrolling instead of overflowing past the screen edge.
- The bottom taskbar now separates Holder claiming from normal palette painting.
- Space alone now stages cells under the cursor, without requiring a simultaneous left mouse drag.
- Claim and paint changes are staged locally as pending overlays and are only saved after the player submits them.
- The build panel can now be closed, moved by dragging its header on desktop, and shows remaining Holders after pending claims.
- Holder countdown updates are isolated in small HUD subcomponents instead of rerendering the full world stage.
- Wheel zoom is handled with a native non-passive listener to avoid browser passive-listener warning spam.
- Pointer hover movement now updates crosshair and hover coordinates outside React renders, reducing canvas work during mouse movement.
- `?perf=1` enables an in-app performance probe that records frame gaps, long tasks, layout shifts and nearby app events.
- Visible claimed territory and saved paint pixels now render through canvas layers instead of thousands of absolute DOM nodes.
- The performance probe now keeps a quiet browser-side ring buffer log at `window.__pixelPerfLog`.
- The main world renderer now uses Wplace-style 1000x1000 PNG tiles for saved claims and paint pixels.
- Backend tile PNGs are cached under `backend/.tile-cache` and only the touched tile is invalidated after claim/paint writes.
- The frontend first render now uses a local origin-world fallback and refreshes the live world overview in the browser, so the page shell does not block on API or database work.
- `GET /api/v1/world/overview` now reads existing chunk state only; growth synchronization is no longer run as part of normal page loading.
- Growth synchronization can still be triggered by claim saves, bootstrap, maintenance tasks or explicit import workflows.
- Large local imports can warm cached tile PNGs with `python -m app.cli.warm_world_tiles`.
- The active world outline is rendered as exact SVG rectangle geometry aligned outside the playable chunk edges, avoiding the older overlapping CSS-strip corner artifacts.
- Tile requests are filtered against exact active chunks so inactive diagonal gaps in cross-shaped growth stages are not requested.
- New Holder claims are now grouped into claim Areas with owner metadata, size stats, painted-pixel stats and contributor slots.
- Clicking claimed territory now opens a right-side Area panel with owner, size, description and contributor information.
- Area owners can edit the Area name and description and invite other players by public `#` number.
- Holder claim submission now supports backend batch validation for multi-pixel tools.
- The first rectangle claim tool is available by choosing two opposite corners while still rejecting existing claimed cells and requiring a valid connection route.
- The world now starts as one `4,000 x 4,000` active chunk and expands at `70%` claimed Holder coverage.
- Growth alternates between cross/diamond and square shapes: origin, diamond radius 1, square radius 1, diamond radius 2, and so on.
- Production deployment notes are documented in `docs/production-deployment.md`, including DNS, Caddy routing, production environment variables, Google OAuth URLs, backups and GitHub Actions deploy preparation.
- Production startup now rejects default secrets, insecure auth cookies, HTTP frontend URLs and wildcard CORS when `APP_ENV=production`.
- Banned accounts are blocked from profile, claim, paint and area mutations.

## Confirmed World Decisions

- World origin is `0:0`.
- Active gameplay chunks use a size of `4,000 x 4,000`.
- The active world starts with only the origin chunk.
- Existing inactive chunk rows may remain in the database for migration continuity, but only active chunks define the playable field.
- Existing claimed pixels outside the origin chunk force the minimum growth stage needed to keep that territory active.
- The active field expands when claimed Holder pixels reach `70%` of the currently active shape.
- Expansion alternates between diamond/cross and square stages around the origin.
- Normal overview reads must remain cheap. Full pixel-to-chunk synchronization should be reserved for migrations, imports or deliberate maintenance actions.

## Open Work Areas

- Exact claim-shape editor tools beyond the first Space staging brush and rectangle tool, such as lasso or fill selection.
- Pixel history, first-paint coin rewards, and moderation rollback tools.
- Live chunk subscriptions and WebSocket update strategy.
- Future far-zoom support should add level-of-detail or pre-scaled overview tiles so distant artwork does not require full-resolution tile rendering.
- Holder/coin balancing, rate-limits, and broader gameplay systems beyond the first pixel-placement loop.
- Production hardening: SSH lock-down, external backups, monitoring, and final GitHub Actions/Discord deploy notification verification.

## Recommended Next Implementation Step

- Add pixel history, first-paint Coins, and stronger contributor management such as removing contributors and activity logs.
