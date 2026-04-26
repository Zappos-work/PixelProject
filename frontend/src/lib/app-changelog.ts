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
    version: "0.3.0",
    date: "Apr 26, 2026",
    sections: [
      {
        title: "New Features",
        items: [
          "World changes stream through WebSockets so fresh paint, claim tiles and area changes reach other players without waiting for timed refreshes.",
          "Claim Area Info supports likes, dislikes, access-limited dislike visibility, like ratio display and share links with coordinate and zoom parameters.",
          "The account profile is now a compact avatar menu with level progress, player stats, inline profile editing, notifications and sound mute controls.",
          "Color Pixel placements grant XP and Coins, level-ups reward Coins and max-cap growth, and the Pixel Shop sells Color Pixel packs plus Max Pixels upgrades.",
        ],
      },
      {
        title: "Canvas & Claims",
        items: [
          "Claim borders use outside-only shadow geometry, visible white-pixel contrast, focused visible-area fetching and explicit corner patches for clean edges.",
          "Rectangle claims stage instantly, can cover existing claimed artwork and keep cutout rectangles valid around finished artwork.",
          "Large claim, paint, tile and world-window operations use chunked or tiled workflows to keep the game responsive.",
          "Paint and claim saves refresh only affected tiles, patch cached overlays where possible and avoid repeated in-flight requests.",
          "Finishing an Area warns clearly, releases unpainted claim pixels, updates affected tiles and clears saved overlay templates.",
          "My Areas now has low-cost previews, search, filters, inline editing, quick invites and shape-accurate preview frames.",
        ],
      },
      {
        title: "Player Systems",
        items: [
          "Level math, profile stats, purchased shop counts and /me payloads now match the Color Pixel and Pixel Shop systems.",
          "The Pixel Shop supports custom whole-number quantities and a full set of monochrome wplace-style item artwork variants.",
          "Guests no longer see Claim Area or Color Pixel build buttons, and Area Info opens from normal browsing clicks.",
          "Turquoise is used more consistently through HUD borders, active states, resource meters and panel highlights.",
          "PostgreSQL now runs on the Postgres 18 image with a one-time dump and restore upgrade path.",
        ],
      },
      {
        title: "Security & Data",
        items: [
          "Production startup fails fast for default secrets, insecure auth cookies, HTTP frontend URLs or wildcard CORS settings.",
          "Banned accounts can no longer mutate profile, world, paint or area state.",
          "Avatar upload history has been removed, avatar images reject oversized dimensions and auth payloads no longer expose Google IDs or email addresses.",
          "Accounts can be deactivated from the profile menu while preserving the Google subject for ban enforcement.",
        ],
      },
      {
        title: "Grouped Bug Fixes",
        items: [
          "Claiming fixes now cover rectangle adjacency, overlapping claim conflicts, pending-outline seams and cutout preservation around finished artwork.",
          "Area lifecycle fixes now cover finish/reopen visibility, unpainted-cell release, migration orientation and stale overlay cleanup.",
          "Painting fixes now cover staged horizontal artifacts, transparent claim shimmer, color picking, off-area staging and aligned canvas overlays.",
          "UI fixes now cover overlay z-index, build-tool Area Info conflicts, dismissible errors and faster My Areas loading.",
          "Account, shop and migration fixes now cover deletion warnings, decimal quantity rejection, legacy Holder stat repair and consistent area text limits.",
          "Fetching fixes now debounce and abort stale selected-pixel lookups, cool down repeated empty fetches and show a recoverable notice for stale local chunks.",
        ],
      },
      {
        title: "Developer & Tooling",
        items: [
          "The frontend runtime moved to Next.js 16, the current Next ESLint flat config and TypeScript 6.",
          "The FastAPI version now follows the project app version.",
          "Database migrations added contributor roles, claim-area overlay storage, per-chunk painted counters, shop purchase counters and repair tooling.",
          "Local and production deployment docs, server runbooks, backup notes, world performance checks and claim-outline debug stats were refreshed.",
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    date: "Apr 24, 2026",
    sections: [
      {
        title: "New Features",
        items: [
          "PixelProject is live on its first production server with Google login, public profiles, avatars and cookie-based sessions.",
          "The world uses centered coordinates, active-world growth and a central 4,000 x 4,000 starting area.",
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
          "Large claim, paint, tile and world-window operations use chunked or tiled workflows to keep the game responsive.",
          "Claim outlines, selected-area borders, pending rectangles and focused Area Info borders load more precisely across zoom levels.",
          "Paint and claim saves refresh only affected tiles, patch cached overlays where possible and avoid repeated in-flight requests.",
          "World growth follows painted progress, stores per-chunk counters and repairs related counters during migrations.",
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
