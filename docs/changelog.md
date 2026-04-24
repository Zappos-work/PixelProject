# Changelog

Player-facing release notes for PixelProject.

## 0.1.12 - Apr 24, 2026

### Improvements

- Area Info opened from the world now receives the full area summary in the inspection response, avoiding the extra detail hydrate request.
- Focused finished-area outlines now use the public Area # in requests and clamp to the selected area's bounds instead of the whole zoomed-out viewport.
- Claim outlines now stay off in visual-only zoom, and large focused Area Info outlines wait until the player zooms closer.
- World pixel window reads now use a slimmer backend projection and a y/x window index for faster high-zoom fetches.

### Bug Fixes

- Pending Claim Area fills are merged into union rectangles before rendering, preventing row seams when a new rectangle overlaps already staged claim cells.
- Pending Claim Area fills no longer draw their own animated internal border; the shared union outline is the only border.

## 0.1.11 - Apr 24, 2026

### Improvements

- The frontend runtime and tooling were updated to Next.js 16, the current Next ESLint config and TypeScript 6.
- Local Docker Compose now keeps hot-reload development containers, while production Docker builds use dedicated runtime stages.
- Production frontend containers now run `next start`, and production backend containers run Uvicorn without reload and with worker support.
- Large world-window API reads and tile requests outside the active world are now rejected before they can create expensive database or cache work.

### Security

- Production startup now fails fast when default secrets, insecure auth cookies, HTTP frontend URLs or wildcard CORS settings are used.
- The deploy workflow now enforces `APP_ENV=production` and secure auth cookies on the production server.
- Missing Discord webhook configuration no longer turns an otherwise completed deploy notification step into a workflow failure.
- Banned accounts can no longer mutate profile, world, paint or area state.
- Avatar uploads now reject oversized pixel dimensions and decompression-bomb style images, even when the uploaded file is small.

### Developer & Tooling

- The FastAPI version now follows the project app version instead of a stale hard-coded value.
- The legacy ESLint compatibility bridge was replaced with the current Next.js flat-config exports.

## 0.1.10 - Apr 24, 2026

### New Features

- Area owners can now manage invited players directly from Area Info, including promoting contributors to admin access or removing them from an area.
- Area admins can edit area details, invite contributors and manage access without needing to be the original owner.
- Area Info now shows the owner, invited players, avatars, admin badges, paint progress and a focused edit mode for name and description changes.
- Color Pixel brush placement now stages paint immediately while dragging, with a live cursor preview for the selected color or Transparent.

### Improvements

- Large pending paint changes now render through tiled canvas overlays, keeping the world smoother while many Color Pixels are staged.
- Rectangle Claim Area placement now checks nearby claim context before staging when local data is incomplete, reducing invalid rectangle attempts.
- Pixel, claim outline and area refreshes now avoid repeated in-flight requests, abort stale selected-pixel fetches and run follow-up refreshes in parallel after saves.
- Paint saves now patch paint and visual tile caches in place, and world growth progress uses stored painted-pixel counters per chunk.
- Outside-world decorative art now uses deterministic placement slots for more even spacing.

### Bug Fixes

- Claim rectangles no longer depend only on currently visible paint records when checking adjacency and occupied territory.
- Area finishing now returns the exact claim tiles that changed after unpainted cells are released, so the frontend can refresh the right tiles.
- Area name and description limits are enforced consistently in the UI, backend and migration repair.
- Crosshair and build actions now block inactive-world cells more clearly before a player stages work.

### Developer & Tooling

- Database migrations now add contributor roles, backfill role data and keep per-chunk painted-pixel counters repaired.
- Development builds now show a recoverable local-bundle notice when stale Next.js chunks are detected.

## 0.1.9 - Apr 23, 2026

### New Features

- The starting world now uses a centered coordinate system with `0:0` in the middle of the first canvas and standard positive-up world coordinates.
- Claim Areas now have active and finished states. Only active areas can be extended or painted, while finished areas stay visible as read-only artwork.
- Areas now get simple public IDs like `#1`, `#2` and `#3`, with a floating context menu for copying the ID and adding future area actions.
- My Areas is now split into your active artworks, active claims you joined and finished artworks.

### Improvements

- Claim Area and Color Pixel tools now have clearer labels, disabled states and helper text.
- The build panel can be minimized or fully closed, and Area Info also has a close button.
- Color Pixel mode now supports left-click single-pixel placement, a local eraser tool and right-click or Space-based quick erasing for staged pixels.
- The hovered and selected pixel outline was refreshed so it reads clearly without center-cross artifacts.
- The debug overlay now reports the active world stage and filled painted-area progress toward the next expansion.

### Bug Fixes

- Finished areas now automatically release unpainted claim pixels and existing finished-area data is cleaned up so claim counts match painted pixels.
- World growth now uses painted pixels instead of raw claimed pixels, so expansion happens at 70% filled artwork.
- Stage detection no longer activates extra chunks just because future or test claims exist outside the current growth shape.
- Tile rendering and migrations now preserve artwork orientation after the centered-coordinate migration.
- Staged painting no longer creates accidental horizontal line artifacts, and the mouse crosshair shows both axes again.

### Developer & Tooling

- Tile cache versions were bumped for the centered world, finished-area cleanup and visual rendering updates.
- Local migration repair now recomputes claim, area, user and chunk counters after status and coordinate changes.

## 0.1.8 - Apr 22, 2026

### New Features

- The zoomed-out world now uses a combined visual overview layer, so claimed land and painted artwork stay visible together before the build view is needed.
- The in-game debug overlay now shows the live zoom level and the active render layer.
- Lightweight area preview and area-by-pixel lookups were added to support smoother territory inspection.

### Improvements

- Visual low-detail tiles are now much softer at x2 instead of x4, and full visual detail arrives earlier at 0.3x zoom.
- Semantic detail now activates only while the build panel is open at high zoom, making browsing and building feel more clearly separated.
- Claim borders remain visible inside visual detail mode, so territory edges stay readable before entering build mode.
- Initial backend tile warmup now targets the visual overview layer that the game actually uses on first load.
- Auth payloads no longer expose Google subject ids or email addresses to the frontend.

### Developer & Tooling

- A new browser-driven world performance runner was added through `npm run perf:world`.
- A backend benchmark script was added for area list, area preview, area inspection and detail-query timings.
- The local `/me` debug route now includes owned claim areas and summarized avatar payload metadata for inspection.

### Bug Fixes

- Selected-pixel fetches are now debounced and repeated empty lookups cool down instead of spamming requests.
- Zooming around the old layer threshold no longer flickers between visual and semantic rendering.
- Visual tiles, claim outlines, grid visibility, placement gating and area prefetching now switch together more consistently.

## 0.1.7 - Apr 21, 2026

### New Features

- Players can now open a personal area list and jump directly to their own claimed territories.
- Normal Pixels are now tracked separately from Holders, with their own balance, limit and regeneration timer.
- Painting can now submit tile-grouped batches, similar to Wplace-style paint requests.

### Improvements

- Claim rendering now shows a light permission-colored shimmer with a thin outer outline around visible unpainted claim areas.
- Claim tiles are cached per viewer, so owner, contributor and blocked colors match the current player.
- Large rectangle claims use compact rectangle payloads and bulk backend inserts instead of sending every pixel back to the browser.
- Paint and claim saves now refresh only the affected paint or claim tiles.
- Claim growth checks now use per-chunk claim counters instead of rescanning all claimed pixels after every Holder claim.
- Concurrent requests for the same missing world tile now share one render instead of rendering the same PNG repeatedly.
- Paint saves patch existing paint tiles and hide newly painted claim shimmer pixels in cached claim tiles instead of forcing full tile rerenders.
- First page load now uses coarse cached overview tiles while zoomed out, dropping the initial full-world image fan-out from hundreds of detail requests to a small set of low-detail paint and claim tiles.
- The backend now warms the anonymous overview tile cache in the background after startup, and low-detail tiles can be composed from existing detail tiles instead of scanning millions of pixels.
- The home page now receives the real world overview from the server render instead of booting with a fallback world and correcting itself after hydration.
- Cached tile PNGs are now served as files instead of being read fully into Python memory for every request.
- Local stress tooling can create test users, seed/claim local areas, paint batches and log container stats for repeatable load tests.
- The build panel is easier to reopen, shows the active resource type and handles very large pending claims more calmly.
- World tile cache warming now reuses the shared tile-warming service.

### Bug Fixes

- Claim outlines no longer become thick one-pixel world barriers while zooming.
- Painted artwork no longer gets blocked or foreign claim borders drawn through it.
- Fresh accounts no longer see another player's claim colors as if they were their own permissions.
- Claim areas should stay visible while zooming instead of disappearing with stale tile state.
- Transparent paint correctly makes claim shimmer visible again and invalidates the right claim tiles.
- Auth fallback states now avoid offering Google login while the auth service is unavailable.

## 0.1.6 - Apr 20, 2026

### New Features

- The painting palette has been refreshed with the new color set.
- The outer world now has decorative pixel-art details in the background.

### Improvements

- Colors in the palette are grouped more clearly, so they are easier to find.
- Existing pixel artworks were migrated to the new palette.
- Transparent paint is easier to recognize while painting and previewing.

### Bug Fixes

- Existing artworks keep their colors more reliably after the palette update.

## 0.1.5 - Apr 20, 2026

### Improvements

- The world appears faster while data continues loading in the background.
- Large worlds feel smoother after heavy activity.

### Bug Fixes

- World refreshes do less unnecessary catch-up work on page load.
- Active world borders and chunk highlights render more cleanly.

## 0.1.4 - Apr 20, 2026

### New Features

- New worlds now start with a central 4,000 x 4,000 area.
- The active world expands step by step as more land is claimed.

### Improvements

- Newly unlocked chunks appear right after a successful claim.

## 0.1.3 - Apr 20, 2026

### Improvements

- Display names can now be as short as 1 character.
- Account setup explains the 1 to 24 character name limit more clearly.

## 0.1.2 - Apr 20, 2026

### New Features

- PixelProject is now live on its first production server.

## 0.1.1 - Apr 20, 2026

### New Features

- Claimed territory can now be organized into named areas.
- Area owners can invite contributors.
- A rectangle tool makes larger claims much faster.

### Improvements

- Multi-cell claims save more reliably.

## 0.1.0 - Apr 19, 2026

### New Features

- First playable release with accounts, Google login, Holders, claiming, painting and profiles.
- Claiming and painting were separated, with changes staged before submitting.
- Custom avatars, profile editing, public player info and a shop entry were introduced.
- A built-in version history and changelog were added to the game.

### Improvements

- Holders now regenerate live and remaining Holders are shown in the interface.
- The build panel can be dragged, closed and used with the Space key for faster editing.
- Display-name setup became clearer and more flexible.
- Large claimed and painted regions render more smoothly with tile loading and caching.
- Optional performance tools were added to help track down lag.

### Bug Fixes

- Grid alignment, camera limits, hover feedback and zoom behavior were cleaned up for a more stable painting experience.
