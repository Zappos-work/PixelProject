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
    version: "0.1.6",
    date: "Apr 20, 2026",
    sections: [
      {
        title: "New Features",
        items: [
          "The painting palette has been refreshed with the new color set.",
          "The outer world now has decorative pixel-art details in the background.",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Colors in the palette are grouped more clearly, so they are easier to find.",
          "Existing pixel artworks were migrated to the new palette.",
          "Transparent paint is easier to recognize while painting and previewing.",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Existing artworks keep their colors more reliably after the palette update.",
        ],
      },
    ],
  },
  {
    version: "0.1.5",
    date: "Apr 20, 2026",
    sections: [
      {
        title: "Improvements",
        items: [
          "The world appears faster while data continues loading in the background.",
          "Large worlds feel smoother after heavy activity.",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "World refreshes do less unnecessary catch-up work on page load.",
          "Active world borders and chunk highlights render more cleanly.",
        ],
      },
    ],
  },
  {
    version: "0.1.4",
    date: "Apr 20, 2026",
    sections: [
      {
        title: "New Features",
        items: [
          "New worlds now start with a central 4,000 x 4,000 area.",
          "The active world expands step by step as more land is claimed.",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Newly unlocked chunks appear right after a successful claim.",
        ],
      },
    ],
  },
  {
    version: "0.1.3",
    date: "Apr 20, 2026",
    sections: [
      {
        title: "Improvements",
        items: [
          "Display names can now be as short as 1 character.",
          "Account setup explains the 1 to 24 character name limit more clearly.",
        ],
      },
    ],
  },
  {
    version: "0.1.2",
    date: "Apr 20, 2026",
    sections: [
      {
        title: "New Features",
        items: [
          "PixelProject is now live on its first production server.",
        ],
      },
    ],
  },
  {
    version: "0.1.1",
    date: "Apr 20, 2026",
    sections: [
      {
        title: "New Features",
        items: [
          "Claimed territory can now be organized into named areas.",
          "Area owners can invite contributors.",
          "A rectangle tool makes larger claims much faster.",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Multi-cell claims save more reliably.",
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
          "Holders now regenerate live and remaining Holders are shown in the interface.",
          "The build panel can be dragged, closed and used with the Space key for faster editing.",
          "Display-name setup became clearer and more flexible.",
          "Large claimed and painted regions render more smoothly with tile loading and caching.",
          "Optional performance tools were added to help track down lag.",
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
