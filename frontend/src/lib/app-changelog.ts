export type ChangelogEntry = {
  version: string;
  date: string;
  changes: string[];
};

export const APP_CHANGELOG: ChangelogEntry[] = [
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
