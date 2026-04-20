# Changelog

## 0.1.3 - 2026-04-20

- Allowed one-character display names during account setup and later rename windows.
- Updated the account helper text to show the new 1 to 24 character display-name range.

## 0.1.2 - 2026-04-20

- Documented the first production deployment on `https://pixel.zappos-dev.work`.
- Added the production deployment runbook with DNS, Caddy, environment, Google OAuth, backup and GitHub Actions notes.
- Updated project foundation and status docs to reflect the live production server.

## 0.1.1 - 2026-04-20

- Added claim Areas so new Holder territory can carry owner, size, painted-pixel and contributor information.
- Added a selected-area panel with owner stats, editable area name and info text, and owner-only contributor invites by public player number.
- Added a rectangle Holder tool that stages a whole area from two clicked corners while respecting claim connectivity and already-claimed territory rules.
- Changed Holder claim submission to use a backend batch endpoint so multi-pixel tools save as one validated operation.

## 0.1.0 - 2026-04-19

- Bundled today's work into the first playable PixelProject milestone: authenticated accounts, Holders, claiming, painting and profile basics.
- Separated Holder claiming from normal palette painting, with local pending edits that are only saved when the player submits them.
- Improved the build HUD with a bottom taskbar, draggable closeable build panel, remaining Holder counts and Space-only brush staging.
- Added project visibility tools: clickable version history, safer modal scrolling, an opt-in performance probe and browser-side perf log export.
- Removed the main rendering bottlenecks by isolating frequent HUD updates, moving hover visuals out of React renders and replacing visible saved pixels with Wplace-style 1000x1000 PNG tiles.
- Added backend tile generation, tile caching and per-tile invalidation so large artworks can scale beyond per-pixel DOM or JSON rendering.

## 0.0.16 - 2026-04-19

- Added Wplace-style 1000x1000 PNG tile endpoints for claimed territory and saved paint pixels.
- Switched the world renderer to viewport-based tile images while keeping pending edits as local overlays.
- Cached generated tile PNGs on the backend and invalidated only the touched tile after claims or paints.

## 0.0.15 - 2026-04-19

- Moved visible claimed territory and saved paint pixels from thousands of DOM nodes onto canvas layers.
- Changed the performance probe into a quiet ring-buffer log exposed as `window.__pixelPerfLog` and `window.__pixelPerfDump()`.

## 0.0.14 - 2026-04-19

- Added an opt-in `?perf=1` performance probe for measuring frame gaps, long tasks, layout shifts and nearby app events.
- Instrumented world renders, Holder ticks, pixel fetches, viewport resizes, auth refreshes and wheel zooms for lag diagnosis.

## 0.0.13 - 2026-04-19

- Removed React rerenders from pointer hover movement by updating the crosshair and hover coordinate display with `requestAnimationFrame`.
- Reduced canvas interaction work during mouse movement so the world grid and pixel layers are not rebuilt for every pointer event.

## 0.0.12 - 2026-04-19

- Moved the live Holder countdown out of the main world component so the full canvas no longer rerenders every tick.
- Replaced React wheel handling with a native non-passive wheel listener to stop passive `preventDefault` console spam.
- Kept production build checks isolated from the running dev server so `.next` cache files are not mixed again.

## 0.0.11 - 2026-04-19

- Added a close button to the build panel so it can be dismissed without losing pending changes.
- Made the build panel draggable on desktop by grabbing its header.
- Added remaining Holder count inside the build panel and sped up the pending-claim stripe animation.

## 0.0.10 - 2026-04-19

- Split the build flow into separate Holder claim and normal palette-paint modes in the bottom taskbar.
- Changed Space into a direct staging brush so players no longer need to hold the left mouse button at the same time.
- Added local pending overlays and final submit actions so claims and paint changes are saved only when the player sends them.

## 0.0.9 - 2026-04-19

- Moved the changelog out of the information modal and into its own version-history window opened from the version badge.
- Added constrained modal heights with internal scrolling so long content stays usable on smaller screens.
- Added the first space-bar brush tool for quickly claiming or painting multiple cells while dragging.

## 0.0.8 - 2026-04-19

- Switched the gameplay loop from free painting to claim-first territory building.
- Added starter-frontier-connected claiming and restricted painting to owned claimed cells.
- Added viewport highlighting for claimed territory and reserved starter-frontier cells.
- Replaced generated avatar presets with custom avatar upload and compact previous-image history.
- Added an in-app changelog section to the information modal.

## 0.0.7 - 2026-04-19

- Introduced the first live pixel placement loop backed by the API.
- Added avatar editing, holder projection in the HUD, and raw JSON output for `/me`.

## 0.0.6 - 2026-04-19

- Added live server-authoritative holder regeneration and the first `/me` endpoint foundation.
- New registrations are now guided into the mandatory display-name setup flow.

## 0.0.5 - 2026-04-19

- Added public player numbers, the centered holder HUD, the first profile modal, and the shop entry button.

## 0.0.4 - 2026-04-19

- Connected local Google OAuth credentials and enabled the first real Google login round-trip.

## 0.0.3 - 2026-04-19

- Added the backend Google OAuth foundation, cookie-based sessions, and the first live login modal.

## 0.0.2 - 2026-04-19

- Aligned the viewport grid and world border rendering.
- Added selected pixel coordinates and dynamic camera clamping.

## 0.0.1 - 2026-04-19

- Introduced the visible build marker under the information button.
