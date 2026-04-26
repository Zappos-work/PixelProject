# Changelog

Player-facing release notes for PixelProject.

## 0.3.0 - Apr 26, 2026

### New Features

- World changes now stream through WebSockets so fresh paint, claim tiles and area changes become visible to other players without waiting for the old timed refresh.
- Claim Area Info now supports likes and dislikes, public like counts, access-limited dislike visibility, like ratio display and share links with coordinate and zoom parameters.
- The account profile is now a compact top-right avatar menu with level progress, player stats, refill timing, inline profile editing, notifications and sound mute controls.
- Color Pixel placements grant XP and Coins, level-ups reward Coins and max-cap growth, and the Pixel Shop sells Color Pixel packs plus Max Pixels upgrades.
- The Pixel Shop now supports custom whole-number quantities and a full set of monochrome wplace-style item artwork variants.

### Improvements

- Large claim, paint, tile and world-window operations now use chunked or tiled workflows to keep the game responsive during high-volume actions.
- Claim outlines, selected-area borders, pending rectangles and focused Area Info borders now load more precisely, stay readable across zoom levels and use outside-only shadow geometry that remains visible on white pixels.
- Claim border shadows now connect cleanly around corners, render without inward shading, avoid expensive SVG drop-shadow filters and use explicit filled corner geometry to remove white-background artifacts.
- Focused claim borders fetch only the visible area, use a combined backend edge query, render less SVG path data and fall back to a quick bounds border for very large selections.
- Paint and claim saves refresh only the affected tiles, patch cached paint/claim overlays where possible and avoid repeated in-flight requests.
- World growth now follows painted progress, stores per-chunk counters and repairs related counters during migrations.
- Visual detail, semantic detail, grid visibility, claim borders and area prefetching now switch together more consistently as the player zooms.
- Area finishing releases unpainted claim pixels, updates the right tiles and clears local area capacity without waiting on slower refreshes.
- Finishing an Area now shows an irreversible-action warning, releases unpainted claimed pixels and deletes saved overlay templates during finish and migration cleanup.
- Rectangle claims stage instantly, can cover existing claimed artwork and keep cutout rectangles intact so finished checkerboard-style artwork can be claimed around.
- My Areas now has low-cost previews, search, filters, inline rename/description editing, quick player invites and shape-accurate preview frames.
- Claim Area and Color Pixel controls now use cleaner visual states, compact resource meters, icon-first tools and stronger disabled feedback.
- The profile level ring, level math, owned-area stats, purchased shop counts and `/me` payloads now match the new Color Pixel and shop systems.
- Turquoise is used more consistently through HUD borders, active states, resource meters and panel highlights while keeping the gray base layout.
- Production containers now use dedicated runtime stages, frontend `next start`, backend Uvicorn workers and Docker Compose settings that separate development hot reload from production.
- Backend coordinate lookups now use compact JSON recordset joins for large pixel checks instead of oversized tuple queries.
- Overlay previews render sharper and more legibly, saved templates are more visible, and overlay snapping can line up against preloaded claim pixels.
- The in-game version badge opens the dedicated changelog modal, while README and project status track the current build marker.
- PostgreSQL now runs on the Postgres 18 image, with a one-time dump and restore upgrade path that keeps the old Postgres 16 volume untouched.

### Security

- Production startup now fails fast for default secrets, insecure auth cookies, HTTP frontend URLs or wildcard CORS settings.
- The deploy workflow enforces production environment settings and secure auth cookies.
- Banned accounts can no longer mutate profile, world, paint or area state.
- Avatar uploads reject oversized pixel dimensions and decompression-bomb style images, even when the uploaded file itself is small.
- Avatar upload history has been removed from storage, API responses and the profile UI.
- Auth payloads no longer expose Google subject IDs or email addresses to the frontend.
- Accounts can now be deactivated from the profile menu, erasing personal profile data while preserving the Google subject for ban enforcement.

### Bug Fixes

- Claiming fixes were grouped around rectangle and overlap behavior: adjacency checks no longer rely only on visible paint data, simultaneous overlapping claims resolve as conflict responses, pending rectangles merge into shared outlines and rectangle cutouts stay valid around finished artwork.
- Area lifecycle fixes were grouped around finish/reopen behavior: finished areas release unpainted cells, keep artwork orientation after migration, stay hidden from normal browsing until opened and no longer leave stale overlay templates behind.
- Painting and color fixes were grouped around staged placement: staged painting no longer creates accidental horizontal artifacts, transparent paint reveals claim shimmer again, middle-click only picks color and Color Pixel staging is blocked outside claimed area bounds.
- Overlay and panel fixes were grouped around UI layering: uploaded overlays no longer cover HUD controls, Area Info no longer opens while build tools are active and build-panel errors now appear as dismissible top-right popups.
- Account and shop fixes were grouped around safer input and data repair: account deletion now warns clearly, shop quantity input rejects decimal-style values and legacy Holder placement totals no longer seed XP, levels or placed-pixel stats.
- Fetching and rendering fixes were grouped around stale UI state: selected-pixel fetches are debounced and aborted when stale, repeated empty lookups cool down, stale local Next.js chunks show a recoverable notice and My Areas no longer waits on expensive preview outline generation.
- Data consistency fixes were grouped around migrations and validation: stage detection no longer activates future chunks from historical claims, area name/description limits match across UI/backend/repair paths and startup repairs recalculate XP, levels, Coins and Color Pixel caps from colored pixels.

### Developer & Tooling

- The frontend runtime and tooling moved to Next.js 16, the current Next ESLint flat config and TypeScript 6.
- The FastAPI version now follows the project app version instead of a stale hard-coded value.
- Database migrations added contributor roles, claim-area overlay storage, per-chunk painted counters, shop purchase counters, level repairs and local repair tools for claim, area, user and chunk counts.
- Local and production deployment docs, server runbooks, backup notes and build configuration were refreshed.
- Browser-driven world performance checks, backend area benchmarks, local debug routes, tile cache warmup tooling and claim-outline debug stats were added or refined.

## 0.2.0 - Apr 24, 2026

### New Features

- PixelProject is now live on its first production server, with Google login, public player profiles, avatars and cookie-based sessions.
- The world now uses centered coordinates with `0:0` in the starter canvas, active-world growth and a central `4,000 x 4,000` starting area.
- Claim Areas can be named, inspected, finished, reopened as read-only artwork and organized through owner/admin/contributor access.
- Players can invite contributors, promote area admins, edit area details, open My Areas and jump directly to owned or joined artwork.
- Normal Pixels are tracked separately from Holders, with dedicated balances, regeneration and staged batch painting.
- The canvas now supports claim brush and rectangle tools, Color Pixel brush placement while dragging, a local eraser and quick color picking from painted cells or overlay templates.
- The zoomed-out world uses combined visual overview tiles, live render-layer debugging and smoother area preview/area-by-pixel inspection.
- The painting palette was refreshed, migrated artwork keeps its colors, and decorative outside-world pixel art now fills the surrounding space.
- Claim Area Overlay lets owners upload an image, place and resize it, flip or center it, restore its ratio and convert it into deterministic palette template pixels.
- Overlay templates support RGB or perceptual color matching, optional dithering, a Color Plate window, private storage on the area and shared rendering for invited contributors.

### Improvements

- Large claim, paint, tile and world-window operations now use chunked or tiled workflows to keep the game responsive during high-volume actions.
- Claim outlines, selected-area borders, pending rectangles and focused Area Info borders now load more precisely and stay readable across zoom levels.
- Paint and claim saves refresh only the affected tiles, patch cached paint/claim overlays where possible and avoid repeated in-flight requests.
- World growth now follows painted progress, stores per-chunk counters and repairs related counters during migrations.
- Visual detail, semantic detail, grid visibility, claim borders and area prefetching now switch together more consistently as the player zooms.
- Area finishing releases unpainted claim pixels, updates the right tiles and clears local area capacity without waiting on slower refreshes.
- Production containers now use dedicated runtime stages, frontend `next start`, backend Uvicorn workers and Docker Compose settings that separate development hot reload from production.
- Backend coordinate lookups now use compact JSON recordset joins for large pixel checks instead of oversized tuple queries.
- Overlay previews render sharper and more legibly, saved templates are more visible, and overlay snapping can line up against preloaded claim pixels.
- The in-game version badge opens the dedicated changelog modal, while README and project status track the current build marker.

### Security

- Production startup now fails fast for default secrets, insecure auth cookies, HTTP frontend URLs or wildcard CORS settings.
- The deploy workflow enforces production environment settings and secure auth cookies.
- Banned accounts can no longer mutate profile, world, paint or area state.
- Avatar uploads reject oversized pixel dimensions and decompression-bomb style images, even when the uploaded file itself is small.
- Auth payloads no longer expose Google subject IDs or email addresses to the frontend.

### Bug Fixes

- Claim rectangles no longer rely only on visible paint data when checking adjacency or occupied territory.
- Pending claim rectangles merge into shared union outlines, removing row seams and internal animated borders.
- Finished areas release unpainted cells, keep artwork orientation after migration and stay hidden from normal browsing until opened.
- Stage detection no longer activates future chunks because of out-of-shape test or historical claims.
- Staged painting no longer creates accidental horizontal artifacts, and the crosshair, hover and selected-pixel outlines remain aligned.
- Transparent paint correctly reveals claim shimmer again and invalidates the right claim tiles.
- Selected-pixel fetches are debounced, stale fetches are aborted, repeated empty lookups cool down and stale local Next.js chunks show a recoverable notice.
- Color Pixel staging is blocked outside claimed area bounds, with clearer inactive-world and invalid-cell feedback.
- Area names and descriptions now enforce the same limits in the UI, backend and migration repair.

### Developer & Tooling

- The frontend runtime and tooling moved to Next.js 16, the current Next ESLint flat config and TypeScript 6.
- The FastAPI version now follows the project app version instead of a stale hard-coded value.
- Database migrations added contributor roles, claim-area overlay storage, per-chunk painted counters and local repair tools for claim, area, user and chunk counts.
- Local and production deployment docs, server runbooks, backup notes and build configuration were refreshed.
- Browser-driven world performance checks, backend area benchmarks, local debug routes and tile cache warmup tooling were added or refined.

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
