export type ChangelogEntry = {
  version: string;
  date: string;
  changes: string[];
};

export const APP_CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.0",
    date: "2026-04-19",
    changes: [
      "Bundled today's work into the first playable PixelProject milestone: authenticated accounts, Holders, claiming, painting and profile basics.",
      "Separated Holder claiming from normal palette painting, with local pending edits that are only saved when the player submits them.",
      "Improved the build HUD with a bottom taskbar, draggable closeable build panel, remaining Holder counts and Space-only brush staging.",
      "Added project visibility tools: clickable version history, safer modal scrolling, an opt-in performance probe and browser-side perf log export.",
      "Removed the main rendering bottlenecks by isolating frequent HUD updates, moving hover visuals out of React renders and replacing visible saved pixels with Wplace-style 1000x1000 PNG tiles.",
      "Added backend tile generation, tile caching and per-tile invalidation so large artworks can scale beyond per-pixel DOM or JSON rendering.",
    ],
  },
  {
    version: "0.0.16",
    date: "2026-04-19",
    changes: [
      "Added Wplace-style 1000x1000 PNG tile endpoints for claimed territory and saved paint pixels.",
      "Switched the world renderer to viewport-based tile images while keeping pending edits as local overlays.",
      "Cached generated tile PNGs on the backend and invalidated only the touched tile after claims or paints.",
    ],
  },
  {
    version: "0.0.15",
    date: "2026-04-19",
    changes: [
      "Moved visible claimed territory and saved paint pixels from thousands of DOM nodes onto canvas layers.",
      "Changed the performance probe into a quiet ring-buffer log exposed as `window.__pixelPerfLog` and `window.__pixelPerfDump()`.",
    ],
  },
  {
    version: "0.0.14",
    date: "2026-04-19",
    changes: [
      "Added an opt-in `?perf=1` performance probe for measuring frame gaps, long tasks, layout shifts and nearby app events.",
      "Instrumented world renders, Holder ticks, pixel fetches, viewport resizes, auth refreshes and wheel zooms for lag diagnosis.",
    ],
  },
  {
    version: "0.0.13",
    date: "2026-04-19",
    changes: [
      "Removed React rerenders from pointer hover movement by updating the crosshair and hover coordinate display with requestAnimationFrame.",
      "Reduced canvas interaction work during mouse movement so the world grid and pixel layers are not rebuilt for every pointer event.",
    ],
  },
  {
    version: "0.0.12",
    date: "2026-04-19",
    changes: [
      "Moved the live Holder countdown out of the main world component so the full canvas no longer rerenders every tick.",
      "Replaced React wheel handling with a native non-passive wheel listener to stop passive preventDefault console spam.",
      "Kept production build checks isolated from the running dev server so `.next` cache files are not mixed again.",
    ],
  },
  {
    version: "0.0.11",
    date: "2026-04-19",
    changes: [
      "Added a close button to the build panel so it can be dismissed without losing pending changes.",
      "Made the build panel draggable on desktop by grabbing its header.",
      "Added remaining Holder count inside the build panel and sped up the pending-claim stripe animation.",
    ],
  },
  {
    version: "0.0.10",
    date: "2026-04-19",
    changes: [
      "Split the build flow into separate Holder claim and normal palette-paint modes in the bottom taskbar.",
      "Changed Space into a direct staging brush so players no longer need to hold the left mouse button at the same time.",
      "Added local pending overlays and final submit actions so claims and paint changes are saved only when the player sends them.",
    ],
  },
  {
    version: "0.0.9",
    date: "2026-04-19",
    changes: [
      "Moved the changelog out of the information modal and into its own version-history window opened from the version badge.",
      "Made modal windows height-safe with internal scrolling so long content no longer spills past the viewport.",
      "Added the first space-bar brush tool for quickly claiming or painting multiple cells while dragging.",
    ],
  },
  {
    version: "0.0.8",
    date: "2026-04-19",
    changes: [
      "Switched the gameplay loop from free painting to claim-first territory building.",
      "Added starter-frontier-connected claiming and painting only inside owned claimed cells.",
      "Replaced generated avatar presets with custom avatar upload and compact previous-image history.",
      "Added an in-app changelog section so each release is easier to track from the information modal.",
    ],
  },
  {
    version: "0.0.7",
    date: "2026-04-19",
    changes: [
      "Introduced the first live pixel placement loop backed by the API.",
      "Added avatar editing, holder projection in the HUD, and raw JSON output for /me.",
    ],
  },
  {
    version: "0.0.6",
    date: "2026-04-19",
    changes: [
      "Added live server-authoritative holder regeneration and the first /me endpoint foundation.",
      "New registrations are now guided into the mandatory display-name setup flow.",
    ],
  },
  {
    version: "0.0.5",
    date: "2026-04-19",
    changes: [
      "Added public player numbers, the centered holder HUD, the first profile modal, and the shop entry button.",
    ],
  },
];
