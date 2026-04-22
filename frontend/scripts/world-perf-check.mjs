import { chromium } from "playwright-core";

const DEFAULT_CDP_URL = process.env.PERF_CDP_URL ?? "http://host.docker.internal:9222";
const DEFAULT_BASE_URL = process.env.PERF_BASE_URL ?? "http://localhost:3000/?perf=1";
const VIEWPORT_SELECTOR = ".world-viewport";
const PERF_READY_TIMEOUT_MS = 30_000;
const ACTION_SETTLE_MS = 1_400;
const INTERACTION_PAUSE_MS = 45;
const ZOOM_STEP_LIMIT = 96;
const DEFAULT_FOCUS_WORLD_X = Number(process.env.PERF_FOCUS_WORLD_X ?? 1000);
const DEFAULT_FOCUS_WORLD_Y = Number(process.env.PERF_FOCUS_WORLD_Y ?? 2200);

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function ensurePerfHooks(page) {
  await page.waitForFunction(
    () => (
      typeof window !== "undefined" &&
      typeof window.__pixelPerfDump === "function" &&
      typeof window.__pixelPerfClear === "function"
    ),
    undefined,
    { timeout: PERF_READY_TIMEOUT_MS },
  );
}

async function resetPerfLog(page) {
  await page.evaluate(() => {
    window.__pixelPerfClear?.();
  });
}

async function readPerfLog(page) {
  const rawLog = await page.evaluate(() => window.__pixelPerfDump?.() ?? "[]");
  return JSON.parse(rawLog);
}

function summarizeDurations(events, label) {
  const durations = events
    .filter((event) => event.label === label && typeof event.duration === "number")
    .map((event) => event.duration);

  if (durations.length === 0) {
    return {
      count: 0,
      max: 0,
      avg: 0,
    };
  }

  const total = durations.reduce((sum, duration) => sum + duration, 0);

  return {
    count: durations.length,
    max: Number(Math.max(...durations).toFixed(1)),
    avg: Number((total / durations.length).toFixed(1)),
  };
}

function countByLabel(events, kind) {
  return events
    .filter((event) => event.kind === kind)
    .reduce((counts, event) => {
      counts[event.label] = (counts[event.label] ?? 0) + 1;
      return counts;
    }, {});
}

function summarizePerfLog(log) {
  const gapEvents = log.filter((event) => event.kind === "gap");
  const longTasks = log.filter((event) => event.kind === "longtask");
  const networkEvents = log.filter((event) => event.kind === "network");
  const markCounts = countByLabel(log, "mark");
  const networkCounts = countByLabel(log, "network");

  return {
    totalEvents: log.length,
    marks: {
      worldRender: markCounts["world render"] ?? 0,
      wheelZoom: markCounts["wheel zoom"] ?? 0,
      pixelFetchStart: markCounts["pixel fetch start"] ?? 0,
      selectedPixelFetchStart: markCounts["selected pixel fetch start"] ?? 0,
      selectedPixelFetchEmpty: markCounts["selected pixel fetch empty"] ?? 0,
      selectedPixelFetchDone: markCounts["selected pixel fetch done"] ?? 0,
      claimOutlineFetchStart: markCounts["claim outline fetch start"] ?? 0,
      visibleAreaPrefetchStart: markCounts["visible area prefetch start"] ?? 0,
      visibleAreaPollStart: markCounts["visible area poll start"] ?? 0,
    },
    gaps: {
      count: gapEvents.length,
      max: Number(
        gapEvents.reduce((max, event) => Math.max(max, event.duration ?? 0), 0).toFixed(1),
      ),
      over80ms: gapEvents.filter((event) => (event.duration ?? 0) >= 80).length,
    },
    longTasks: {
      count: longTasks.length,
      max: Number(
        longTasks.reduce((max, event) => Math.max(max, event.duration ?? 0), 0).toFixed(1),
      ),
      over80ms: longTasks.filter((event) => (event.duration ?? 0) >= 80).length,
    },
    network: {
      counts: {
        pixelWindowFetch: networkCounts["Pixel window fetch done"] ?? 0,
        claimOutlineFetch: networkCounts["Claim outline fetch done"] ?? 0,
        visibleAreaPrefetch: networkCounts["Visible area prefetch done"] ?? 0,
        visibleAreaPoll: networkCounts["Visible area poll done"] ?? 0,
      },
      pixelWindowFetch: summarizeDurations(networkEvents, "Pixel window fetch done"),
      claimOutlineFetch: summarizeDurations(networkEvents, "Claim outline fetch done"),
      visibleAreaPrefetch: summarizeDurations(networkEvents, "Visible area prefetch done"),
      visibleAreaPoll: summarizeDurations(networkEvents, "Visible area poll done"),
    },
    trailingEvents: log.slice(-12),
  };
}

function parseSnapshotDetail(detail) {
  const match = /^cam\s+(-?\d+):(-?\d+)\s+@\s+([\d.]+)x/.exec(detail);

  if (!match) {
    return null;
  }

  return {
    cameraX: Number(match[1]),
    cameraY: Number(match[2]),
    zoom: Number(match[3]),
  };
}

async function getViewportCenter(page) {
  const viewport = page.locator(VIEWPORT_SELECTOR);
  const box = await viewport.boundingBox();

  if (box === null) {
    throw new Error("Viewport bounding box is unavailable.");
  }

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    width: box.width,
    height: box.height,
  };
}

async function getLatestSnapshotState(page) {
  const detail = await page.evaluate(() => {
    const log = window.__pixelPerfLog ?? [];

    for (let index = log.length - 1; index >= 0; index -= 1) {
      const entry = log[index];

      if (entry?.kind === "snapshot" && typeof entry.detail === "string") {
        return entry.detail;
      }
    }

    return null;
  });

  return detail ? parseSnapshotDetail(detail) : null;
}

async function wheelAt(page, center, deltaY, repeat = 1) {
  await page.mouse.move(center.x, center.y);

  for (let index = 0; index < repeat; index += 1) {
    await page.mouse.wheel(0, deltaY);
    await wait(INTERACTION_PAUSE_MS);
  }
}

async function dragViewport(page, center, deltaX, deltaY) {
  const startX = center.x;
  const startY = center.y;
  const endX = center.x + deltaX;
  const endY = center.y + deltaY;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 18 });
  await page.mouse.up();
  await wait(INTERACTION_PAUSE_MS);
}

async function clickViewport(page, center, offsetX = 0, offsetY = 0) {
  await page.mouse.click(center.x + offsetX, center.y + offsetY);
  await wait(INTERACTION_PAUSE_MS);
}

async function isGridVisible(page) {
  return page.evaluate((selector) => {
    const viewport = document.querySelector(selector);
    return viewport?.classList.contains("grid-visible") ?? false;
  }, VIEWPORT_SELECTOR);
}

async function zoomUntil(page, center, deltaY, targetVisible) {
  for (let step = 0; step < ZOOM_STEP_LIMIT; step += 1) {
    if (await isGridVisible(page) === targetVisible) {
      return step;
    }

    await wheelAt(page, center, deltaY, 1);
  }

  throw new Error(`Grid visibility did not reach ${targetVisible ? "visible" : "hidden"} after ${ZOOM_STEP_LIMIT} zoom steps.`);
}

async function centerWorldPoint(page, center, worldX, worldY) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const snapshot = await getLatestSnapshotState(page);

    if (snapshot === null) {
      await wait(1_100);
      continue;
    }

    const screenX = snapshot.cameraX + worldX * snapshot.zoom;
    const screenY = snapshot.cameraY + worldY * snapshot.zoom;
    const deltaX = center.x - screenX;
    const deltaY = center.y - screenY;

    if (Math.abs(deltaX) <= 3 && Math.abs(deltaY) <= 3) {
      return;
    }

    await dragViewport(page, center, deltaX, deltaY);
    await wait(250);
  }
}

async function collectScenario(page, name, runScenario) {
  await resetPerfLog(page);
  await wait(300);
  await runScenario();
  await wait(ACTION_SETTLE_MS);

  const rawLog = await readPerfLog(page);
  const summary = summarizePerfLog(rawLog);

  return {
    name,
    summary,
    rawLog,
  };
}

async function main() {
  const browser = await chromium.connectOverCDP(DEFAULT_CDP_URL);
  const contexts = browser.contexts();
  const context = contexts[0];

  if (!context) {
    throw new Error("No browser context is available on the CDP connection.");
  }

  const page = await context.newPage();

  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(VIEWPORT_SELECTOR, {
      state: "visible",
      timeout: PERF_READY_TIMEOUT_MS,
    });
    await ensurePerfHooks(page);
    await wait(1_000);

    const center = await getViewportCenter(page);

    const scenarios = [];

    scenarios.push(await collectScenario(page, "idle", async () => {
      await wait(2_500);
    }));

    scenarios.push(await collectScenario(page, "zoom-pan-select", async () => {
      await wait(1_100);
      await centerWorldPoint(page, center, DEFAULT_FOCUS_WORLD_X, DEFAULT_FOCUS_WORLD_Y);
      await zoomUntil(page, center, -280, true);
      await wait(850);
      await dragViewport(page, center, 190, 130);
      await clickViewport(page, center, 48, -26);
      await wait(500);
      await wheelAt(page, center, -280, 6);
      await dragViewport(page, center, -160, -110);
      await clickViewport(page, center, -36, 42);
      await wait(500);
      await dragViewport(page, center, -160, -110);
    }));

    scenarios.push(await collectScenario(page, "detail-zoom-cycle", async () => {
      await zoomUntil(page, center, 280, false);
      await wait(650);
      await centerWorldPoint(page, center, DEFAULT_FOCUS_WORLD_X, DEFAULT_FOCUS_WORLD_Y);
      await zoomUntil(page, center, -260, true);
      await wait(750);
      await dragViewport(page, center, 220, -140);
      await clickViewport(page, center, 24, 24);
      await wait(350);
      await zoomUntil(page, center, 280, false);
      await wait(450);
      await zoomUntil(page, center, -260, true);
      await wait(850);
      await clickViewport(page, center, -28, 18);
    }));

    const output = {
      baseUrl: DEFAULT_BASE_URL,
      cdpUrl: DEFAULT_CDP_URL,
      capturedAt: new Date().toISOString(),
      scenarios: scenarios.map(({ name, summary, rawLog }) => ({
        name,
        summary,
        rawLog,
      })),
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
