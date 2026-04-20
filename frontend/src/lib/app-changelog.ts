export type ChangelogEntry = {
  version: string;
  date: string;
  changes: string[];
};

export const APP_CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.6",
    date: "Apr 20, 2026",
    changes: [
      "🎨 New: the paint palette now uses the full refreshed color set and is grouped by color family for faster picking.",
      "🧼 Improvement: transparent painting is clearer, with an easier-to-read erase swatch and preview.",
      "🖼️ New: the outside-world background can now load custom pixel art directly from the project's art folder.",
      "🌌 Polish: background pixel art is now repeated more naturally with smaller, lighter decorations outside the playable world.",
      "🧩 Improvement: older paintings now translate more safely to the refreshed palette so existing artwork stays readable.",
    ],
  },
  {
    version: "0.1.5",
    date: "Apr 20, 2026",
    changes: [
      "⚡ Performance: the world now appears immediately while live data keeps loading in the background.",
      "🐛 Fix: world overview refreshes are lighter and no longer do heavy catch-up work on every page load.",
      "⚡ Performance: large worlds should feel smoother after major imports or lots of new activity.",
      "🎯 Polish: active world borders and chunk highlights now render more cleanly and accurately.",
    ],
  },
  {
    version: "0.1.4",
    date: "Apr 20, 2026",
    changes: [
      "🌍 New: fresh worlds now begin with one central 4,000 x 4,000 area.",
      "✨ New: the active world expands in stages as more territory gets claimed.",
      "🔄 Improvement: newly unlocked chunks appear right after a successful claim without a full reload.",
    ],
  },
  {
    version: "0.1.3",
    date: "Apr 20, 2026",
    changes: [
      "✏️ Improvement: display names can now be as short as 1 character.",
      "📘 Clarity: account setup now clearly shows the 1 to 24 character name limit.",
    ],
  },
  {
    version: "0.1.2",
    date: "Apr 20, 2026",
    changes: [
      "🚀 Launch: PixelProject is now live on its first production server.",
    ],
  },
  {
    version: "0.1.1",
    date: "Apr 20, 2026",
    changes: [
      "✨ New: claimed territory can now be grouped into named Areas.",
      "👥 New: area panels show owner details and support contributor invites.",
      "📐 New: a rectangle tool makes claiming larger spaces much faster.",
      "✅ Improvement: multi-cell claims now save together more reliably.",
    ],
  },
  {
    version: "0.1.0",
    date: "Apr 19, 2026",
    changes: [
      "🎉 Milestone: the first playable PixelProject build is live with accounts, Holders, claiming, painting and profiles.",
      "🎨 New: claiming and painting are now separate actions, with edits staged before you submit them.",
      "🧰 UX: the build tools are easier to use with a bottom taskbar, draggable panel and Holder counter.",
      "📰 New: version history is now easier to open from inside the app.",
      "⚡ Performance: drawing and navigating the world should feel much smoother in busy areas.",
    ],
  },
  {
    version: "0.0.16",
    date: "Apr 19, 2026",
    changes: [
      "🖼️ New: saved territory and paint now load as large image tiles for a smoother world view.",
      "🎨 Improvement: your local pending edits still appear instantly on top while you work.",
      "⚡ Performance: tile caching speeds up repeat loading after claims and paint updates.",
    ],
  },
  {
    version: "0.0.15",
    date: "Apr 19, 2026",
    changes: [
      "⚡ Performance: large claimed and painted areas now render much more smoothly.",
      "🔎 Improvement: lag reporting tools were cleaned up to make slowdown checks easier.",
    ],
  },
  {
    version: "0.0.14",
    date: "Apr 19, 2026",
    changes: [
      "🔬 New: an optional performance mode can help track down lag and frame drops.",
      "🛠️ Improvement: more gameplay events are now captured during diagnostics.",
    ],
  },
  {
    version: "0.0.13",
    date: "Apr 19, 2026",
    changes: [
      "⚡ Performance: moving the cursor around the world is now much smoother.",
      "🎯 Improvement: hover feedback no longer triggers heavy view updates as often.",
    ],
  },
  {
    version: "0.0.12",
    date: "Apr 19, 2026",
    changes: [
      "⚡ Performance: Holder timers no longer force large world rerenders every tick.",
      "🧭 Fix: zoom behavior is cleaner and avoids noisy browser warnings.",
      "🧹 Stability: general build and release checks are now more reliable.",
    ],
  },
  {
    version: "0.0.11",
    date: "Apr 19, 2026",
    changes: [
      "❌ New: the build panel can now be closed without losing your pending work.",
      "🖱️ New: the build panel is draggable on desktop.",
      "📊 Improvement: the panel now shows your remaining Holders.",
    ],
  },
  {
    version: "0.0.10",
    date: "Apr 19, 2026",
    changes: [
      "🎨 New: build mode now separates claiming from normal painting.",
      "⌨️ New: the Space key works as a direct brush tool.",
      "✅ Improvement: claims and paint edits stay local until you choose to submit them.",
    ],
  },
  {
    version: "0.0.9",
    date: "Apr 19, 2026",
    changes: [
      "📰 New: the changelog moved into its own version-history window.",
      "📏 Fix: long modal content now stays usable on smaller screens.",
      "🖌️ New: added the first Space-bar brush for faster claiming and painting.",
    ],
  },
  {
    version: "0.0.8",
    date: "Apr 19, 2026",
    changes: [
      "🏗️ New: gameplay now centers on claiming territory before painting.",
      "🔒 Rule change: painting is limited to cells inside your own claimed space.",
      "🖼️ New: custom avatar uploads replace the older preset avatar system.",
      "📰 New: the app now includes its first built-in changelog.",
    ],
  },
  {
    version: "0.0.7",
    date: "Apr 19, 2026",
    changes: [
      "🎮 New: live pixel placement is now connected to the game API.",
      "👤 New: avatar editing and Holder projection are now visible in the HUD.",
    ],
  },
  {
    version: "0.0.6",
    date: "Apr 19, 2026",
    changes: [
      "♻️ New: Holders now regenerate live over time.",
      "✏️ Improvement: new accounts are guided through display-name setup.",
    ],
  },
  {
    version: "0.0.5",
    date: "Apr 19, 2026",
    changes: [
      "🆔 New: public player numbers, a centered Holder HUD, a profile modal and a shop entry are now in place.",
    ],
  },
  {
    version: "0.0.4",
    date: "Apr 19, 2026",
    changes: [
      "🔐 New: Google login now works end to end.",
    ],
  },
  {
    version: "0.0.3",
    date: "Apr 19, 2026",
    changes: [
      "🔐 New: the first live Google sign-in flow and saved sessions are now in place.",
    ],
  },
  {
    version: "0.0.2",
    date: "Apr 19, 2026",
    changes: [
      "🎯 Polish: the grid and world borders now line up more cleanly.",
      "🧭 New: selected pixel coordinates and smarter camera limits were added.",
    ],
  },
  {
    version: "0.0.1",
    date: "Apr 19, 2026",
    changes: [
      "🚩 First look: the first visible build marker now appears below the info button.",
    ],
  },
];
