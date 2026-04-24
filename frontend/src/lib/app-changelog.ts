export type ChangelogSection = {
  title: string;
  items: string[];
};

export type ChangelogEntry = {
  version: string;
  date: string;
  sections: ChangelogSection[];
};

export const APP_CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.0",
    date: "Apr 24, 2026",
    sections: [
      {
        title: "New Features",
        items: [
          "PixelProject is live on its first production server with Google login, public profiles, avatars and cookie-based sessions.",
          "The world now uses centered coordinates, active-world growth and a central 4,000 x 4,000 starting area.",
          "Claim Areas can be named, inspected, finished, reopened as read-only artwork and managed by owners, admins and contributors.",
          "Normal Pixels are tracked separately from Holders, with dedicated balances, regeneration and staged batch painting.",
          "The canvas supports claim brush and rectangle tools, Color Pixel drag painting, erasing and quick color picking from painted cells or overlay templates.",
          "The zoomed-out world uses combined visual overview tiles with smoother area preview and area-by-pixel inspection.",
          "Claim Area Overlay can upload, place, resize, flip, center and convert images into deterministic private palette templates for invited contributors.",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Large claim, paint, tile and world-window operations now use chunked or tiled workflows to keep the game responsive.",
          "Claim outlines, selected-area borders, pending rectangles and focused Area Info borders load more precisely across zoom levels.",
          "Paint and claim saves refresh only affected tiles, patch cached overlays where possible and avoid repeated in-flight requests.",
          "World growth now follows painted progress, stores per-chunk counters and repairs related counters during migrations.",
          "Overlay previews render sharper and more visibly, saved templates are easier to read, and snapping can line up against preloaded claim pixels.",
          "Production containers use dedicated runtime stages, frontend next start, backend Uvicorn workers and clearer development/production Compose settings.",
        ],
      },
      {
        title: "Security",
        items: [
          "Production startup fails fast for default secrets, insecure auth cookies, HTTP frontend URLs or wildcard CORS settings.",
          "Banned accounts can no longer mutate profile, world, paint or area state.",
          "Avatar uploads reject oversized pixel dimensions and decompression-bomb style images.",
          "Auth payloads no longer expose Google subject IDs or email addresses to the frontend.",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Pending claim rectangles merge into shared union outlines, removing row seams and internal animated borders.",
          "Finished areas release unpainted cells, keep artwork orientation after migration and stay hidden from normal browsing until opened.",
          "Staged painting no longer creates accidental horizontal artifacts, and canvas outlines remain aligned.",
          "Color Pixel staging is blocked outside claimed area bounds, with clearer inactive-world and invalid-cell feedback.",
          "Selected-pixel fetches are debounced, stale fetches are aborted and repeated empty lookups cool down.",
        ],
      },
      {
        title: "Developer & Tooling",
        items: [
          "The frontend runtime moved to Next.js 16, the current Next ESLint flat config and TypeScript 6.",
          "The FastAPI version now follows the project app version.",
          "Database migrations added contributor roles, claim-area overlay storage, per-chunk painted counters and local repair tooling.",
          "Local and production deployment docs, server runbooks, backup notes and build configuration were refreshed.",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "Apr 19, 2026",
    sections: [
      {
        title: "New Features",
        items: [
          "First playable release with accounts, Google login, Holders, claiming, painting and profiles.",
          "Claiming and painting were separated, with changes staged before submitting.",
          "Custom avatars, profile editing, public player info and a shop entry were introduced.",
          "A built-in version history and changelog were added to the game.",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Holders regenerate live and remaining Holders are shown in the interface.",
          "The build panel can be dragged, closed and used with the Space key for faster editing.",
          "Display-name setup became clearer and more flexible.",
          "Large claimed and painted regions render more smoothly with tile loading and caching.",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Grid alignment, camera limits, hover feedback and zoom behavior were cleaned up for a more stable painting experience.",
        ],
      },
    ],
  },
];
