# Changelog

Player-facing release notes for PixelProject.

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
