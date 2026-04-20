# Changelog

Player-facing release notes for PixelProject. Detailed implementation notes stay out of this list on purpose.

## 0.1.6 - Apr 20, 2026

- 🎨 New: the paint palette now uses the full refreshed color set and is grouped by color family for faster picking.
- 🧼 Improvement: transparent painting is clearer, with an easier-to-read erase swatch and preview.
- 🖼️ New: the outside-world background can now load custom pixel art directly from the project's art folder.
- 🌌 Polish: background pixel art is now repeated more naturally with smaller, lighter decorations outside the playable world.
- 🧩 Improvement: older paintings now translate more safely to the refreshed palette so existing artwork stays readable.

## 0.1.5 - Apr 20, 2026

- ⚡ Performance: the world now appears immediately while live data keeps loading in the background.
- 🐛 Fix: world overview refreshes are lighter and no longer do heavy catch-up work on every page load.
- ⚡ Performance: large worlds should feel smoother after major imports or lots of new activity.
- 🎯 Polish: active world borders and chunk highlights now render more cleanly and accurately.

## 0.1.4 - Apr 20, 2026

- 🌍 New: fresh worlds now begin with one central 4,000 x 4,000 area.
- ✨ New: the active world expands in stages as more territory gets claimed.
- 🔄 Improvement: newly unlocked chunks appear right after a successful claim without a full reload.

## 0.1.3 - Apr 20, 2026

- ✏️ Improvement: display names can now be as short as 1 character.
- 📘 Clarity: account setup now clearly shows the 1 to 24 character name limit.

## 0.1.2 - Apr 20, 2026

- 🚀 Launch: PixelProject is now live on its first production server.

## 0.1.1 - Apr 20, 2026

- ✨ New: claimed territory can now be grouped into named Areas.
- 👥 New: area panels show owner details and support contributor invites.
- 📐 New: a rectangle tool makes claiming larger spaces much faster.
- ✅ Improvement: multi-cell claims now save together more reliably.

## 0.1.0 - Apr 19, 2026

- 🎉 Milestone: the first playable PixelProject build is live with accounts, Holders, claiming, painting and profiles.
- 🎨 New: claiming and painting are now separate actions, with edits staged before you submit them.
- 🧰 UX: the build tools are easier to use with a bottom taskbar, draggable panel and Holder counter.
- 📰 New: version history is now easier to open from inside the app.
- ⚡ Performance: drawing and navigating the world should feel much smoother in busy areas.

## 0.0.16 - Apr 19, 2026

- 🖼️ New: saved territory and paint now load as large image tiles for a smoother world view.
- 🎨 Improvement: your local pending edits still appear instantly on top while you work.
- ⚡ Performance: tile caching speeds up repeat loading after claims and paint updates.

## 0.0.15 - Apr 19, 2026

- ⚡ Performance: large claimed and painted areas now render much more smoothly.
- 🔎 Improvement: lag reporting tools were cleaned up to make slowdown checks easier.

## 0.0.14 - Apr 19, 2026

- 🔬 New: an optional performance mode can help track down lag and frame drops.
- 🛠️ Improvement: more gameplay events are now captured during diagnostics.

## 0.0.13 - Apr 19, 2026

- ⚡ Performance: moving the cursor around the world is now much smoother.
- 🎯 Improvement: hover feedback no longer triggers heavy view updates as often.

## 0.0.12 - Apr 19, 2026

- ⚡ Performance: Holder timers no longer force large world rerenders every tick.
- 🧭 Fix: zoom behavior is cleaner and avoids noisy browser warnings.
- 🧹 Stability: general build and release checks are now more reliable.

## 0.0.11 - Apr 19, 2026

- ❌ New: the build panel can now be closed without losing your pending work.
- 🖱️ New: the build panel is draggable on desktop.
- 📊 Improvement: the panel now shows your remaining Holders.

## 0.0.10 - Apr 19, 2026

- 🎨 New: build mode now separates claiming from normal painting.
- ⌨️ New: the Space key works as a direct brush tool.
- ✅ Improvement: claims and paint edits stay local until you choose to submit them.

## 0.0.9 - Apr 19, 2026

- 📰 New: the changelog moved into its own version-history window.
- 📏 Fix: long modal content now stays usable on smaller screens.
- 🖌️ New: added the first Space-bar brush for faster claiming and painting.

## 0.0.8 - Apr 19, 2026

- 🏗️ New: gameplay now centers on claiming territory before painting.
- 🔒 Rule change: painting is limited to cells inside your own claimed space.
- 🖼️ New: custom avatar uploads replace the older preset avatar system.
- 📰 New: the app now includes its first built-in changelog.

## 0.0.7 - Apr 19, 2026

- 🎮 New: live pixel placement is now connected to the game API.
- 👤 New: avatar editing and Holder projection are now visible in the HUD.

## 0.0.6 - Apr 19, 2026

- ♻️ New: Holders now regenerate live over time.
- ✏️ Improvement: new accounts are guided through display-name setup.

## 0.0.5 - Apr 19, 2026

- 🆔 New: public player numbers, a centered Holder HUD, a profile modal and a shop entry are now in place.

## 0.0.4 - Apr 19, 2026

- 🔐 New: Google login now works end to end.

## 0.0.3 - Apr 19, 2026

- 🔐 New: the first live Google sign-in flow and saved sessions are now in place.

## 0.0.2 - Apr 19, 2026

- 🎯 Polish: the grid and world borders now line up more cleanly.
- 🧭 New: selected pixel coordinates and smarter camera limits were added.

## 0.0.1 - Apr 19, 2026

- 🚩 First look: the first visible build marker now appears below the info button.
