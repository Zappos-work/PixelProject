"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  claimWorldPixels,
  fetchClaimArea,
  fetchAuthSession,
  fetchVisibleWorldPixels,
  fetchWorldOverview,
  getClientApiBaseUrl,
  getWorldTileUrl,
  inviteAreaContributor,
  logoutAuthSession,
  paintWorldPixel,
  updateClaimArea,
  updateDisplayName,
  uploadAvatar,
  type AuthUser,
  type AuthSessionStatus,
  type ClaimAreaSummary,
  type WorldOverview,
  type WorldPixel,
} from "@/lib/api";
import { APP_CHANGELOG } from "@/lib/app-changelog";
import { APP_VERSION } from "@/lib/app-version";
import { DEFAULT_COLOR_ID, PIXEL_PALETTE } from "@/lib/pixel-palette";

type WorldStageProps = {
  world: WorldOverview;
};

type PanDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  mode: "pan";
};

type DragState = PanDragState;

type BuildMode = "claim" | "paint";

type ClaimTool = "brush" | "rectangle";

type PointerPosition = {
  x: number;
  y: number;
  inside: boolean;
};

type CameraState = {
  x: number;
  y: number;
  zoom: number;
};

type WorldEdge = {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type WorldTile = {
  key: string;
  tileX: number;
  tileY: number;
  left: number;
  top: number;
  size: number;
  revision: number;
};

type GridLine = {
  key: string;
  position: number;
  major: boolean;
};

type PixelCoordinate = {
  x: number;
  y: number;
};

type PendingPaint = PixelCoordinate & {
  colorId: number;
};

type ProfileMessage = {
  tone: "error" | "success" | "info";
  text: string;
};

type ViewportSize = {
  width: number;
  height: number;
};

type ActiveWorldBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

type PlacementState = {
  pixelRecord: WorldPixel | null;
  isInsideWorld: boolean;
  canClaim: boolean;
  canPaint: boolean;
  isPendingClaim: boolean;
  pendingPaint: PendingPaint | null;
};

type SpaceStrokeState = {
  visitedKeys: Set<string>;
  lastPixel: PixelCoordinate | null;
};

type BuildPanelPosition = {
  x: number;
  y: number;
};

type BuildPanelDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
};

type PerfMarkDetail = {
  label: string;
  detail?: string;
  at: number;
};

type PerfEventKind = "gap" | "layout" | "longtask" | "mark";

type PerfEventRecord = {
  id: number;
  kind: PerfEventKind;
  label: string;
  detail: string;
  at: number;
  duration?: number;
};

type LayoutShiftEntry = PerformanceEntry & {
  value?: number;
  hadRecentInput?: boolean;
};

type PerfDebugWindow = Window & {
  __pixelPerfLog?: PerfEventRecord[];
  __pixelPerfDump?: () => string;
  __pixelPerfClear?: () => void;
};

const DEFAULT_ZOOM = 3;
const DEFAULT_MIN_ZOOM = 0.05;
const ABSOLUTE_MIN_ZOOM = 0.001;
const MAX_ZOOM = 40;
const GRID_THRESHOLD = 8;
const GRID_MAJOR_STEP = 10;
const ZOOM_FACTOR = 1.14;
const WORLD_BORDER_WIDTH = 5;
const FIT_WORLD_PADDING = 80;
const PAN_PADDING_FACTOR = 0.18;
const PAN_PADDING_MIN = 140;
const CLICK_DISTANCE = 6;
const AUTH_REFRESH_INTERVAL_MS = 60000;
const HOLDER_TICK_MS = 1000;
const PIXEL_FETCH_DEBOUNCE_MS = 120;
const PIXEL_FETCH_MARGIN = 2;
const PERF_EVENT_NAME = "pixelproject:perf-event";
const PERF_FRAME_GAP_THRESHOLD_MS = 42;
const PERF_LOG_LIMIT = 500;
const WORLD_TILE_SIZE = 1000;
const WORLD_TILE_MARGIN = 1;
const BUILD_MODE_LABEL: Record<BuildMode, string> = {
  claim: "Holders",
  paint: "Normal",
};
const BUILD_MODE_HELP: Record<BuildMode, string> = {
  claim: "Claim only. Uses Holders and has no color palette.",
  paint: "Paint only. Uses the palette and only works inside your claimed area.",
};

const FALLBACK_AUTH_STATUS: AuthSessionStatus = {
  authenticated: false,
  google_oauth_configured: false,
  user: null,
};

let perfDebugEnabledCache: boolean | null = null;

function clampZoom(value: number, minZoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(minZoom, Number(value.toFixed(4))));
}

function snapScreen(value: number): number {
  return Math.round(value);
}

function modalButtonClass(isActive: boolean): string {
  return isActive ? "hud-toggle is-active" : "hud-toggle";
}

function isPerfDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (perfDebugEnabledCache !== null) {
    return perfDebugEnabledCache;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    perfDebugEnabledCache = params.has("perf") || window.localStorage.getItem("pixelproject:perf") === "1";
    return perfDebugEnabledCache;
  } catch {
    perfDebugEnabledCache = false;
    return false;
  }
}

function markPerfEvent(label: string, detail?: string): void {
  if (typeof window === "undefined" || !isPerfDebugEnabled()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<PerfMarkDetail>(PERF_EVENT_NAME, {
      detail: {
        label,
        detail,
        at: performance.now(),
      },
    }),
  );
}

function isPerfMarkDetail(value: unknown): value is PerfMarkDetail {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PerfMarkDetail>;
  return typeof candidate.label === "string" && typeof candidate.at === "number";
}

function formatPerfTime(value: number): string {
  return `${Math.round(value)}ms`;
}

function getPerfDebugWindow(): PerfDebugWindow | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window as PerfDebugWindow;
}

function appendPerfLog(event: PerfEventRecord): void {
  const perfWindow = getPerfDebugWindow();

  if (perfWindow === null) {
    return;
  }

  const log = perfWindow.__pixelPerfLog ?? [];
  log.push(event);

  if (log.length > PERF_LOG_LIMIT) {
    log.splice(0, log.length - PERF_LOG_LIMIT);
  }

  perfWindow.__pixelPerfLog = log;
}

function getPixelKey(pixel: PixelCoordinate): string {
  return `${pixel.x}:${pixel.y}`;
}

function getWorldTileKey(tileX: number, tileY: number): string {
  return `${tileX}:${tileY}`;
}

function getPixelTileKey(pixel: PixelCoordinate): string {
  return getWorldTileKey(
    Math.floor(pixel.x / WORLD_TILE_SIZE),
    Math.floor(pixel.y / WORLD_TILE_SIZE),
  );
}

function screenPointToWorldPixel(screenX: number, screenY: number, camera: CameraState): PixelCoordinate {
  return {
    x: Math.floor((screenX - camera.x) / camera.zoom),
    y: Math.floor((screenY - camera.y) / camera.zoom),
  };
}

function buildPendingClaimMap(claims: PixelCoordinate[]): Set<string> {
  return new Set(claims.map(getPixelKey));
}

function buildPendingPaintMap(paints: PendingPaint[]): Map<string, PendingPaint> {
  return new Map(paints.map((paint) => [getPixelKey(paint), paint]));
}

function clampPanelPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): BuildPanelPosition {
  if (typeof window === "undefined") {
    return { x, y };
  }

  const padding = 12;
  const maxX = Math.max(padding, window.innerWidth - width - padding);
  const maxY = Math.max(padding, window.innerHeight - height - padding);

  return {
    x: Math.min(maxX, Math.max(padding, x)),
    y: Math.min(maxY, Math.max(padding, y)),
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  return target instanceof HTMLElement && target.isContentEditable;
}

function getPixelLine(start: PixelCoordinate, end: PixelCoordinate): PixelCoordinate[] {
  const points: PixelCoordinate[] = [];
  let currentX = start.x;
  let currentY = start.y;
  const deltaX = Math.abs(end.x - start.x);
  const deltaY = Math.abs(end.y - start.y);
  const stepX = start.x < end.x ? 1 : -1;
  const stepY = start.y < end.y ? 1 : -1;
  let error = deltaX - deltaY;

  while (true) {
    points.push({ x: currentX, y: currentY });

    if (currentX === end.x && currentY === end.y) {
      break;
    }

    const doubledError = error * 2;

    if (doubledError > -deltaY) {
      error -= deltaY;
      currentX += stepX;
    }

    if (doubledError < deltaX) {
      error += deltaX;
      currentY += stepY;
    }
  }

  return points;
}

function getRectanglePixels(start: PixelCoordinate, end: PixelCoordinate): PixelCoordinate[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const pixels: PixelCoordinate[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      pixels.push({ x, y });
    }
  }

  return pixels;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getProjectedHolderState(
  user: AuthUser | null,
  nowMs: number,
): { displayedHolders: number; statusText: string } {
  if (user === null) {
    return {
      displayedHolders: 0,
      statusText: "",
    };
  }

  if (user.holders >= user.holder_limit) {
    return {
      displayedHolders: user.holders,
      statusText: "Holder storage full",
    };
  }

  const intervalMs = Math.max(1000, user.holder_regeneration_interval_seconds * 1000);
  const lastUpdatedMs = new Date(user.holders_last_updated_at).getTime();
  const elapsedMs = Math.max(0, nowMs - lastUpdatedMs);
  const regenerated = Math.floor(elapsedMs / intervalMs);
  const displayedHolders = Math.min(user.holder_limit, user.holders + regenerated);

  if (displayedHolders >= user.holder_limit) {
    return {
      displayedHolders,
      statusText: "Holder storage full",
    };
  }

  const remainderMs = elapsedMs % intervalMs;
  const remainingMs = remainderMs === 0 ? intervalMs : intervalMs - remainderMs;

  return {
    displayedHolders,
    statusText: `Next holder in ${Math.max(0, Math.ceil(remainingMs / 1000))}s`,
  };
}

function getCurrentDisplayedHolders(user: AuthUser | null): number {
  return getProjectedHolderState(user, Date.now()).displayedHolders;
}

function useProjectedHolderState(user: AuthUser | null): { displayedHolders: number; statusText: string } {
  const [projection, setProjection] = useState(() => getProjectedHolderState(user, Date.now()));

  useEffect(() => {
    const syncProjection = (): void => {
      markPerfEvent("holder tick", user ? `#${user.public_id}` : "anonymous");
      const nextProjection = getProjectedHolderState(user, Date.now());
      setProjection((current) => (
        current.displayedHolders === nextProjection.displayedHolders &&
        current.statusText === nextProjection.statusText
          ? current
          : nextProjection
      ));
    };

    syncProjection();

    if (user === null) {
      return;
    }

    const ticker = window.setInterval(syncProjection, HOLDER_TICK_MS);

    return () => {
      window.clearInterval(ticker);
    };
  }, [user]);

  return projection;
}

function HolderTaskbarStatus({
  pendingClaims,
  user,
}: {
  pendingClaims: number;
  user: AuthUser | null;
}) {
  const projection = useProjectedHolderState(user);

  if (user === null) {
    return <span className="build-taskbar-status">Login to build</span>;
  }

  const remainingHolders = Math.max(0, projection.displayedHolders - pendingClaims);

  return (
    <span className="build-taskbar-status">
      {remainingHolders} / {user.holder_limit} Holders left
    </span>
  );
}

function HolderPanelSummary({
  pendingClaims,
  user,
}: {
  pendingClaims: number;
  user: AuthUser | null;
}) {
  const projection = useProjectedHolderState(user);

  if (user === null) {
    return (
      <div className="pixel-holder-summary">
        <span>Holder left</span>
        <strong>--</strong>
        <small>Login required for Holder balance</small>
      </div>
    );
  }

  const remainingHolders = Math.max(0, projection.displayedHolders - pendingClaims);

  return (
    <div className="pixel-holder-summary">
      <span>Holder left</span>
      <strong>{remainingHolders}</strong>
      <small>
        {pendingClaims} pending claim{pendingClaims === 1 ? "" : "s"} from{" "}
        {projection.displayedHolders} ready Holders
      </small>
    </div>
  );
}

function HolderAccountCount({ user }: { user: AuthUser }) {
  const projection = useProjectedHolderState(user);

  return (
    <>
      Holders: {projection.displayedHolders} / {user.holder_limit}
    </>
  );
}

function HolderAccountStatus({ user }: { user: AuthUser }) {
  const projection = useProjectedHolderState(user);

  return <strong>{projection.statusText}</strong>;
}

function PerfDebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<PerfEventRecord[]>([]);
  const eventIdRef = useRef(0);
  const recentMarksRef = useRef<PerfEventRecord[]>([]);
  const maxGapRef = useRef(0);
  const gapCountRef = useRef(0);
  const longTaskCountRef = useRef(0);
  const layoutShiftCountRef = useRef(0);

  const pushEvent = useCallback((event: Omit<PerfEventRecord, "id">): void => {
    const nextEvent: PerfEventRecord = {
      ...event,
      id: eventIdRef.current + 1,
    };
    eventIdRef.current = nextEvent.id;
    appendPerfLog(nextEvent);

    if (nextEvent.kind === "mark") {
      recentMarksRef.current = [nextEvent, ...recentMarksRef.current]
        .filter((mark) => nextEvent.at - mark.at <= 1600)
        .slice(0, 10);
      return;
    }

    setEvents((current) => [nextEvent, ...current].slice(0, 10));
  }, []);

  useEffect(() => {
    setEnabled(isPerfDebugEnabled());
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const perfWindow = getPerfDebugWindow();

    if (perfWindow === null) {
      return;
    }

    perfWindow.__pixelPerfLog = perfWindow.__pixelPerfLog ?? [];
    perfWindow.__pixelPerfDump = () => JSON.stringify(perfWindow.__pixelPerfLog ?? [], null, 2);
    perfWindow.__pixelPerfClear = () => {
      perfWindow.__pixelPerfLog = [];
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let lastFrame = performance.now();
    let animationFrame = 0;

    const watchFrame = (now: number): void => {
      const delta = now - lastFrame;
      lastFrame = now;

      if (delta >= PERF_FRAME_GAP_THRESHOLD_MS) {
        gapCountRef.current += 1;
        maxGapRef.current = Math.max(maxGapRef.current, delta);
        const recentMarks = recentMarksRef.current
          .slice(0, 5)
          .map((mark) => `${mark.label}${mark.detail ? ` (${mark.detail})` : ""}`)
          .join(" -> ");

        pushEvent({
          kind: "gap",
          label: `Frame gap ${delta.toFixed(1)}ms`,
          detail: recentMarks || "No app mark in the last 1.6s",
          at: now,
          duration: delta,
        });
      }

      animationFrame = window.requestAnimationFrame(watchFrame);
    };

    animationFrame = window.requestAnimationFrame(watchFrame);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [enabled, pushEvent]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handlePerfMark = (event: Event): void => {
      if (!(event instanceof CustomEvent) || !isPerfMarkDetail(event.detail)) {
        return;
      }

      pushEvent({
        kind: "mark",
        label: event.detail.label,
        detail: event.detail.detail ?? "",
        at: event.detail.at,
      });
    };

    window.addEventListener(PERF_EVENT_NAME, handlePerfMark);

    return () => {
      window.removeEventListener(PERF_EVENT_NAME, handlePerfMark);
    };
  }, [enabled, pushEvent]);

  useEffect(() => {
    if (!enabled || typeof PerformanceObserver === "undefined") {
      return;
    }

    const observers: PerformanceObserver[] = [];

    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskCountRef.current += 1;
          pushEvent({
            kind: "longtask",
            label: `Long task ${entry.duration.toFixed(1)}ms`,
            detail: entry.name || "Main thread task",
            at: entry.startTime,
            duration: entry.duration,
          });
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: true });
      observers.push(longTaskObserver);
    }

    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
      const layoutObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutEntry = entry as LayoutShiftEntry;

          if (layoutEntry.hadRecentInput || !layoutEntry.value || layoutEntry.value < 0.001) {
            continue;
          }

          layoutShiftCountRef.current += 1;
          pushEvent({
            kind: "layout",
            label: `Layout shift ${layoutEntry.value.toFixed(4)}`,
            detail: layoutEntry.name || "No recent input",
            at: layoutEntry.startTime,
          });
        }
      });
      layoutObserver.observe({ type: "layout-shift", buffered: true });
      observers.push(layoutObserver);
    }

    return () => {
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, [enabled, pushEvent]);

  if (!enabled) {
    return null;
  }

  return (
    <aside className="perf-debug-panel">
      <div className="perf-debug-header">
        <strong>Perf probe</strong>
        <span>?perf=1</span>
      </div>
      <div className="perf-debug-stats">
        <span>Gaps: {gapCountRef.current}</span>
        <span>Max: {formatPerfTime(maxGapRef.current)}</span>
        <span>Long: {longTaskCountRef.current}</span>
        <span>CLS: {layoutShiftCountRef.current}</span>
      </div>
      <p className="perf-debug-command">Console: copy(window.__pixelPerfDump())</p>
      <div className="perf-debug-events">
        {events.length === 0 ? (
          <p>No gaps yet. Move around until the lag happens. App marks are logged without repainting this panel.</p>
        ) : (
          events.map((event) => (
            <article className={`perf-debug-event is-${event.kind}`} key={event.id}>
              <strong>{event.label}</strong>
              <span>{event.detail || "No detail"}</span>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}

function DefaultAvatarIcon() {
  return (
    <svg aria-hidden="true" className="account-avatar-icon" viewBox="0 0 24 24">
      <path
        d="M12 12.75a4.75 4.75 0 1 0 0-9.5 4.75 4.75 0 0 0 0 9.5Zm0 2.25c-4.12 0-7.5 2.41-7.5 5.38 0 .34.28.62.62.62h13.76c.34 0 .62-.28.62-.62 0-2.97-3.38-5.38-7.5-5.38Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg aria-hidden="true" className="hud-button-icon" viewBox="0 0 24 24">
      <path
        d="M6.25 7.5A1.25 1.25 0 0 1 7.5 6.25h9A1.25 1.25 0 0 1 17.75 7.5v.75h1.1c.39 0 .71.29.75.67l.73 7.5a1.8 1.8 0 0 1-1.79 1.98H5.46a1.8 1.8 0 0 1-1.79-1.98l.73-7.5a.75.75 0 0 1 .75-.67h1.1V7.5Zm10 0v.75h-8.5V7.5c0-.14.11-.25.25-.25h8a.25.25 0 0 1 .25.25Zm-6 3.5a.75.75 0 0 0-1.5 0v1.75a.75.75 0 0 0 1.5 0V11Zm5 0a.75.75 0 0 0-1.5 0v1.75a.75.75 0 0 0 1.5 0V11Z"
        fill="currentColor"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" className="hud-button-icon" viewBox="0 0 24 24">
      <path
        d="m15.68 4.72 3.6 3.6a1.2 1.2 0 0 1 0 1.7l-8.83 8.83a2.1 2.1 0 0 1-.96.54l-4.07.95a.75.75 0 0 1-.9-.9l.95-4.07a2.1 2.1 0 0 1 .54-.96l8.83-8.83a1.2 1.2 0 0 1 1.7 0Zm-8.8 11.7-.45 1.92 1.92-.45a.6.6 0 0 0 .28-.15l7.95-7.95-1.6-1.6-7.95 7.95a.6.6 0 0 0-.15.28Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function WorldStage({ world: initialWorld }: WorldStageProps) {
  const worldRenderCountRef = useRef(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const buildPanelRef = useRef<HTMLDivElement | null>(null);
  const hoverCoordinateValueRef = useRef<HTMLSpanElement | null>(null);
  const crosshairHorizontalRef = useRef<HTMLDivElement | null>(null);
  const crosshairVerticalRef = useRef<HTMLDivElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const buildPanelDragState = useRef<BuildPanelDragState | null>(null);
  const pointerVisualFrameRef = useRef<number | null>(null);
  const spaceStrokeRef = useRef<SpaceStrokeState | null>(null);
  const spaceToolActiveRef = useRef(false);
  const currentUserRef = useRef<AuthUser | null>(null);
  const visiblePixelsRef = useRef<WorldPixel[]>([]);
  const pixelIndexRef = useRef<Map<string, WorldPixel>>(new Map());
  const activeWorldBoundsRef = useRef<ActiveWorldBounds | null>(null);
  const activeChunksRef = useRef<WorldOverview["chunks"]>([]);
  const pendingClaimsRef = useRef<PixelCoordinate[]>([]);
  const pendingClaimMapRef = useRef<Set<string>>(new Set());
  const pendingPaintsRef = useRef<PendingPaint[]>([]);
  const pendingPaintMapRef = useRef<Map<string, PendingPaint>>(new Map());
  const activeBuildModeRef = useRef<BuildMode>("claim");
  const claimToolRef = useRef<ClaimTool>("brush");
  const rectangleAnchorRef = useRef<PixelCoordinate | null>(null);
  const knownPaintableAreaIdsRef = useRef<Set<string>>(new Set());
  const selectedColorIdRef = useRef(DEFAULT_COLOR_ID);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const cameraRef = useRef<CameraState>({
    x: 0,
    y: 0,
    zoom: DEFAULT_ZOOM,
  });
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0, inside: false });
  const activeModalRef = useRef<"info" | "changelog" | "login" | "shop" | "avatar" | null>(null);
  const namePromptShownRef = useRef(false);
  const [camera, setCamera] = useState<CameraState>({
    x: 0,
    y: 0,
    zoom: DEFAULT_ZOOM,
  });
  const [world, setWorld] = useState<WorldOverview>(initialWorld);
  const [showGrid, setShowGrid] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [activeModal, setActiveModal] = useState<"info" | "changelog" | "login" | "shop" | "avatar" | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthSessionStatus>(FALLBACK_AUTH_STATUS);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<ProfileMessage | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<ProfileMessage | null>(null);
  const [selectedPixel, setSelectedPixel] = useState<PixelCoordinate | null>(null);
  const [selectedColorId, setSelectedColorId] = useState(DEFAULT_COLOR_ID);
  const [activeBuildMode, setActiveBuildMode] = useState<BuildMode>("claim");
  const [claimTool, setClaimTool] = useState<ClaimTool>("brush");
  const [rectangleAnchor, setRectangleAnchor] = useState<PixelCoordinate | null>(null);
  const [buildPanelOpen, setBuildPanelOpen] = useState(false);
  const [buildPanelPosition, setBuildPanelPosition] = useState<BuildPanelPosition | null>(null);
  const [pendingClaims, setPendingClaims] = useState<PixelCoordinate[]>([]);
  const [pendingPaints, setPendingPaints] = useState<PendingPaint[]>([]);
  const [placementBusy, setPlacementBusy] = useState(false);
  const [placementMessage, setPlacementMessage] = useState<ProfileMessage | null>(null);
  const [visiblePixels, setVisiblePixels] = useState<WorldPixel[]>([]);
  const [tileRevisions, setTileRevisions] = useState<Record<string, number>>({});
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [isCentered, setIsCentered] = useState(false);
  const [spaceToolActive, setSpaceToolActive] = useState(false);
  const [selectedArea, setSelectedArea] = useState<ClaimAreaSummary | null>(null);
  const [areaPanelBusy, setAreaPanelBusy] = useState(false);
  const [areaDraftName, setAreaDraftName] = useState("");
  const [areaDraftDescription, setAreaDraftDescription] = useState("");
  const [areaInvitePublicId, setAreaInvitePublicId] = useState("");
  const [areaMessage, setAreaMessage] = useState<ProfileMessage | null>(null);
  worldRenderCountRef.current += 1;

  const refreshAuthStatus = useCallback(async (showLoading = true): Promise<void> => {
    markPerfEvent("auth refresh start", showLoading ? "with loading" : "background");
    if (showLoading) {
      setAuthLoading(true);
    }

    const nextStatus = await fetchAuthSession();
    setAuthStatus(nextStatus);
    setAuthLoading(false);
    markPerfEvent("auth refresh done", nextStatus.authenticated ? "authenticated" : "guest");
  }, []);

  useEffect(() => {
    markPerfEvent("world render", `#${worldRenderCountRef.current}`);
  });

  useEffect(() => {
    document.body.dataset.theme = darkMode ? "dark" : "light";

    return () => {
      delete document.body.dataset.theme;
    };
  }, [darkMode]);

  useEffect(() => {
    void refreshAuthStatus();
  }, [refreshAuthStatus]);

  useEffect(() => {
    if (!authStatus.authenticated) {
      return;
    }

    const refreshInterval = window.setInterval(() => {
      void refreshAuthStatus();
    }, AUTH_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = (): void => {
      if (!document.hidden) {
        void refreshAuthStatus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authStatus.authenticated, refreshAuthStatus]);

  useEffect(() => {
    setProfileName(authStatus.user?.display_name ?? "");
    setProfileMessage(null);
    setAvatarMessage(null);
  }, [authStatus.user?.display_name]);

  useEffect(() => {
    if (authStatus.user?.needs_display_name_setup && !namePromptShownRef.current) {
      setActiveModal("login");
      namePromptShownRef.current = true;
    }

    if (!authStatus.user?.needs_display_name_setup) {
      namePromptShownRef.current = false;
    }
  }, [authStatus.user?.needs_display_name_setup]);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (viewport === null) {
      return;
    }

    const syncSize = (): void => {
      const rect = viewport.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
      markPerfEvent("viewport resize", `${Math.round(rect.width)}x${Math.round(rect.height)}`);
    };

    syncSize();

    const observer = new ResizeObserver(() => {
      syncSize();
    });

    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (buildPanelPosition === null) {
      return;
    }

    const panel = buildPanelRef.current;

    if (panel === null) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const nextPosition = clampPanelPosition(buildPanelPosition.x, buildPanelPosition.y, rect.width, rect.height);

    if (nextPosition.x !== buildPanelPosition.x || nextPosition.y !== buildPanelPosition.y) {
      setBuildPanelPosition(nextPosition);
    }
  }, [buildPanelPosition, viewportSize.height, viewportSize.width]);

  const activeChunks = useMemo(() => {
    return world.chunks.filter((chunk) => chunk.is_active);
  }, [world.chunks]);

  const activeWorldBounds = useMemo<ActiveWorldBounds>(() => {
    if (activeChunks.length === 0) {
      const width = world.bounds.max_world_x - world.bounds.min_world_x;
      const height = world.bounds.max_world_y - world.bounds.min_world_y;

      return {
        minX: world.bounds.min_world_x,
        maxX: world.bounds.max_world_x,
        minY: world.bounds.min_world_y,
        maxY: world.bounds.max_world_y,
        width,
        height,
        centerX: world.bounds.min_world_x + width / 2,
        centerY: world.bounds.min_world_y + height / 2,
      };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const chunk of activeChunks) {
      minX = Math.min(minX, chunk.origin_x);
      maxX = Math.max(maxX, chunk.origin_x + chunk.width);
      minY = Math.min(minY, chunk.origin_y);
      maxY = Math.max(maxY, chunk.origin_y + chunk.height);
    }

    const width = maxX - minX;
    const height = maxY - minY;

    return {
      minX,
      maxX,
      minY,
      maxY,
      width,
      height,
      centerX: minX + width / 2,
      centerY: minY + height / 2,
    };
  }, [
    activeChunks,
    world.bounds.max_world_x,
    world.bounds.max_world_y,
    world.bounds.min_world_x,
    world.bounds.min_world_y,
  ]);

  const fitZoom = useMemo(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) {
      return DEFAULT_ZOOM;
    }

    const availableWidth = Math.max(
      viewportSize.width - FIT_WORLD_PADDING * 2 - WORLD_BORDER_WIDTH * 2,
      1,
    );
    const availableHeight = Math.max(
      viewportSize.height - FIT_WORLD_PADDING * 2 - WORLD_BORDER_WIDTH * 2,
      1,
    );
    const widthZoom = availableWidth / Math.max(activeWorldBounds.width, 1);
    const heightZoom = availableHeight / Math.max(activeWorldBounds.height, 1);

    return Math.min(MAX_ZOOM, Number(Math.min(widthZoom, heightZoom).toFixed(4)));
  }, [activeWorldBounds.height, activeWorldBounds.width, viewportSize.height, viewportSize.width]);

  const minZoom = useMemo(() => {
    return Math.max(
      ABSOLUTE_MIN_ZOOM,
      Math.min(DEFAULT_MIN_ZOOM, Number((fitZoom * 0.9).toFixed(4))),
    );
  }, [fitZoom]);

  const screenToWorldPixel = useCallback((screenX: number, screenY: number): PixelCoordinate => {
    return {
      x: Math.floor((screenX - camera.x) / camera.zoom),
      y: Math.floor((screenY - camera.y) / camera.zoom),
    };
  }, [camera.x, camera.y, camera.zoom]);

  const clampCamera = useCallback((nextCamera: CameraState): CameraState => {
    const zoom = clampZoom(nextCamera.zoom, minZoom);

    if (viewportSize.width === 0 || viewportSize.height === 0) {
      return {
        ...nextCamera,
        zoom,
      };
    }

    const paddingX = Math.min(
      viewportSize.width * 0.45,
      Math.max(PAN_PADDING_MIN, world.chunk_size * zoom * PAN_PADDING_FACTOR),
    );
    const paddingY = Math.min(
      viewportSize.height * 0.45,
      Math.max(PAN_PADDING_MIN, world.chunk_size * zoom * PAN_PADDING_FACTOR),
    );
    const centeredX = viewportSize.width / 2 - activeWorldBounds.centerX * zoom;
    const centeredY = viewportSize.height / 2 - activeWorldBounds.centerY * zoom;
    const minCameraX = paddingX - activeWorldBounds.maxX * zoom;
    const maxCameraX = viewportSize.width - paddingX - activeWorldBounds.minX * zoom;
    const minCameraY = paddingY - activeWorldBounds.maxY * zoom;
    const maxCameraY = viewportSize.height - paddingY - activeWorldBounds.minY * zoom;

    return {
      zoom,
      x:
        minCameraX > maxCameraX
          ? centeredX
          : Math.min(maxCameraX, Math.max(minCameraX, nextCamera.x)),
      y:
        minCameraY > maxCameraY
          ? centeredY
          : Math.min(maxCameraY, Math.max(minCameraY, nextCamera.y)),
    };
  }, [
    activeWorldBounds.centerX,
    activeWorldBounds.centerY,
    activeWorldBounds.maxX,
    activeWorldBounds.maxY,
    activeWorldBounds.minX,
    activeWorldBounds.minY,
    minZoom,
    viewportSize.height,
    viewportSize.width,
    world.chunk_size,
  ]);

  const handleNativeWheel = useCallback((event: WheelEvent): void => {
    event.preventDefault();
    markPerfEvent("wheel zoom");

    const viewport = viewportRef.current;

    if (viewport === null) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;

    setCamera((current) => {
      const zoomDirection = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const nextZoom = clampZoom(current.zoom * zoomDirection, minZoom);

      if (nextZoom === current.zoom) {
        return current;
      }

      const worldX = (anchorX - current.x) / current.zoom;
      const worldY = (anchorY - current.y) / current.zoom;

      return clampCamera({
        zoom: nextZoom,
        x: anchorX - worldX * nextZoom,
        y: anchorY - worldY * nextZoom,
      });
    });
  }, [clampCamera, minZoom]);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (viewport === null) {
      return;
    }

    viewport.addEventListener("wheel", handleNativeWheel, { passive: false });

    return () => {
      viewport.removeEventListener("wheel", handleNativeWheel);
    };
  }, [handleNativeWheel]);

  const normalizedProfileName = useMemo(() => {
    return profileName.trim().replace(/\s+/g, " ");
  }, [profileName]);

  const currentUser = authStatus.user;
  currentUserRef.current = currentUser;
  activeWorldBoundsRef.current = activeWorldBounds;
  activeChunksRef.current = activeChunks;
  activeBuildModeRef.current = activeBuildMode;
  claimToolRef.current = claimTool;
  rectangleAnchorRef.current = rectangleAnchor;
  selectedColorIdRef.current = selectedColorId;
  zoomRef.current = camera.zoom;
  cameraRef.current = camera;
  activeModalRef.current = activeModal;
  spaceToolActiveRef.current = spaceToolActive;

  const hasDisplayNameChange = useMemo(() => {
    if (!currentUser) {
      return false;
    }

    return normalizedProfileName.length > 0 && normalizedProfileName !== currentUser.display_name;
  }, [currentUser, normalizedProfileName]);

  const nameChangeHint = useMemo(() => {
    if (!currentUser) {
      return "";
    }

    if (currentUser.needs_display_name_setup) {
      return "Choose your permanent display name now. 1 to 24 characters are allowed. After the first save, the next rename unlocks in 30 days.";
    }

    if (currentUser.can_change_display_name) {
      return "You can change your display name now. 1 to 24 characters are allowed. After a successful update, the next rename unlocks in 30 days.";
    }

    if (currentUser.next_display_name_change_at) {
      return `Next display name change: ${new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(currentUser.next_display_name_change_at))}`;
    }

    return "Display name changes are temporarily unavailable.";
  }, [currentUser]);

  useEffect(() => {
    if (isCentered || viewportSize.width === 0 || viewportSize.height === 0) {
      return;
    }

    const initialZoom = clampZoom(Math.min(DEFAULT_ZOOM, fitZoom), minZoom);
    setCamera(
      clampCamera({
        x: viewportSize.width / 2 - activeWorldBounds.centerX * initialZoom,
        y: viewportSize.height / 2 - activeWorldBounds.centerY * initialZoom,
        zoom: initialZoom,
      }),
    );
    setIsCentered(true);
  }, [
    activeWorldBounds.centerX,
    activeWorldBounds.centerY,
    clampCamera,
    fitZoom,
    isCentered,
    minZoom,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    if (!isCentered || viewportSize.width === 0 || viewportSize.height === 0) {
      return;
    }

    setCamera((current) => {
      const clamped = clampCamera(current);

      if (
        clamped.x === current.x &&
        clamped.y === current.y &&
        clamped.zoom === current.zoom
      ) {
        return current;
      }

      return clamped;
    });
  }, [
    activeWorldBounds.centerX,
    activeWorldBounds.centerY,
    activeWorldBounds.maxX,
    activeWorldBounds.maxY,
    activeWorldBounds.minX,
    activeWorldBounds.minY,
    clampCamera,
    isCentered,
    minZoom,
    viewportSize.height,
    viewportSize.width,
    world.chunk_size,
  ]);

  const gridVisible = showGrid && camera.zoom >= GRID_THRESHOLD;
  const gridLines = useMemo(() => {
    if (!gridVisible || viewportSize.width === 0 || viewportSize.height === 0) {
      return {
        horizontal: [] as GridLine[],
        vertical: [] as GridLine[],
      };
    }

    const startX = Math.floor(-camera.x / camera.zoom) - 1;
    const endX = Math.ceil((viewportSize.width - camera.x) / camera.zoom) + 1;
    const startY = Math.floor(-camera.y / camera.zoom) - 1;
    const endY = Math.ceil((viewportSize.height - camera.y) / camera.zoom) + 1;
    const vertical: GridLine[] = [];
    const horizontal: GridLine[] = [];

    for (let x = startX; x <= endX; x += 1) {
      vertical.push({
        key: `v-${x}`,
        position: snapScreen(camera.x + x * camera.zoom),
        major: x % GRID_MAJOR_STEP === 0,
      });
    }

    for (let y = startY; y <= endY; y += 1) {
      horizontal.push({
        key: `h-${y}`,
        position: snapScreen(camera.y + y * camera.zoom),
        major: y % GRID_MAJOR_STEP === 0,
      });
    }

    return {
      horizontal,
      vertical,
    };
  }, [camera.x, camera.y, camera.zoom, gridVisible, viewportSize.height, viewportSize.width]);

  const activeChunkEdges = useMemo(() => {
    const chunkIndex = new Set(activeChunks.map((chunk) => `${chunk.chunk_x}:${chunk.chunk_y}`));
    const edges: WorldEdge[] = [];

    for (const chunk of activeChunks) {
      const left = snapScreen(camera.x + chunk.origin_x * camera.zoom);
      const top = snapScreen(camera.y + chunk.origin_y * camera.zoom);
      const right = snapScreen(camera.x + (chunk.origin_x + chunk.width) * camera.zoom);
      const bottom = snapScreen(camera.y + (chunk.origin_y + chunk.height) * camera.zoom);
      const width = right - left;
      const height = bottom - top;

      if (!chunkIndex.has(`${chunk.chunk_x}:${chunk.chunk_y - 1}`)) {
        edges.push({
          key: `${chunk.id}-top`,
          left: left - WORLD_BORDER_WIDTH,
          top: top - WORLD_BORDER_WIDTH,
          width: width + WORLD_BORDER_WIDTH * 2,
          height: WORLD_BORDER_WIDTH,
        });
      }

      if (!chunkIndex.has(`${chunk.chunk_x + 1}:${chunk.chunk_y}`)) {
        edges.push({
          key: `${chunk.id}-right`,
          left: left + width,
          top: top - WORLD_BORDER_WIDTH,
          width: WORLD_BORDER_WIDTH,
          height: height + WORLD_BORDER_WIDTH * 2,
        });
      }

      if (!chunkIndex.has(`${chunk.chunk_x}:${chunk.chunk_y + 1}`)) {
        edges.push({
          key: `${chunk.id}-bottom`,
          left: left - WORLD_BORDER_WIDTH,
          top: top + height,
          width: width + WORLD_BORDER_WIDTH * 2,
          height: WORLD_BORDER_WIDTH,
        });
      }

      if (!chunkIndex.has(`${chunk.chunk_x - 1}:${chunk.chunk_y}`)) {
        edges.push({
          key: `${chunk.id}-left`,
          left: left - WORLD_BORDER_WIDTH,
          top: top - WORLD_BORDER_WIDTH,
          width: WORLD_BORDER_WIDTH,
          height: height + WORLD_BORDER_WIDTH * 2,
        });
      }
    }

    return edges;
  }, [activeChunks, camera.x, camera.y, camera.zoom]);

  const renderedWorldTiles = useMemo<WorldTile[]>(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) {
      return [];
    }

    const visibleMinX = Math.floor(-camera.x / camera.zoom);
    const visibleMaxX = Math.ceil((viewportSize.width - camera.x) / camera.zoom);
    const visibleMinY = Math.floor(-camera.y / camera.zoom);
    const visibleMaxY = Math.ceil((viewportSize.height - camera.y) / camera.zoom);
    const worldMinTileX = Math.floor(activeWorldBounds.minX / WORLD_TILE_SIZE);
    const worldMaxTileX = Math.floor((activeWorldBounds.maxX - 1) / WORLD_TILE_SIZE);
    const worldMinTileY = Math.floor(activeWorldBounds.minY / WORLD_TILE_SIZE);
    const worldMaxTileY = Math.floor((activeWorldBounds.maxY - 1) / WORLD_TILE_SIZE);
    const minTileX = Math.max(
      worldMinTileX,
      Math.floor(visibleMinX / WORLD_TILE_SIZE) - WORLD_TILE_MARGIN,
    );
    const maxTileX = Math.min(
      worldMaxTileX,
      Math.floor(visibleMaxX / WORLD_TILE_SIZE) + WORLD_TILE_MARGIN,
    );
    const minTileY = Math.max(
      worldMinTileY,
      Math.floor(visibleMinY / WORLD_TILE_SIZE) - WORLD_TILE_MARGIN,
    );
    const maxTileY = Math.min(
      worldMaxTileY,
      Math.floor(visibleMaxY / WORLD_TILE_SIZE) + WORLD_TILE_MARGIN,
    );
    const tiles: WorldTile[] = [];

    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        const key = getWorldTileKey(tileX, tileY);
        const tileOriginX = tileX * WORLD_TILE_SIZE;
        const tileOriginY = tileY * WORLD_TILE_SIZE;
        tiles.push({
          key,
          tileX,
          tileY,
          left: snapScreen(camera.x + tileOriginX * camera.zoom),
          top: snapScreen(camera.y + tileOriginY * camera.zoom),
          size: Math.ceil(WORLD_TILE_SIZE * camera.zoom),
          revision: tileRevisions[key] ?? 0,
        });
      }
    }

    return tiles;
  }, [
    activeWorldBounds.maxX,
    activeWorldBounds.maxY,
    activeWorldBounds.minX,
    activeWorldBounds.minY,
    camera.x,
    camera.y,
    camera.zoom,
    tileRevisions,
    viewportSize.height,
    viewportSize.width,
  ]);

  const pixelFetchBounds = useMemo(() => {
    if (!gridVisible || viewportSize.width === 0 || viewportSize.height === 0) {
      return null;
    }

    return {
      minX: Math.max(activeWorldBounds.minX, Math.floor(-camera.x / camera.zoom) - PIXEL_FETCH_MARGIN),
      maxX: Math.min(
        activeWorldBounds.maxX - 1,
        Math.ceil((viewportSize.width - camera.x) / camera.zoom) + PIXEL_FETCH_MARGIN,
      ),
      minY: Math.max(activeWorldBounds.minY, Math.floor(-camera.y / camera.zoom) - PIXEL_FETCH_MARGIN),
      maxY: Math.min(
        activeWorldBounds.maxY - 1,
        Math.ceil((viewportSize.height - camera.y) / camera.zoom) + PIXEL_FETCH_MARGIN,
      ),
    };
  }, [
    activeWorldBounds.maxX,
    activeWorldBounds.maxY,
    activeWorldBounds.minX,
    activeWorldBounds.minY,
    camera.x,
    camera.y,
    camera.zoom,
    gridVisible,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    if (pixelFetchBounds === null) {
      return;
    }

    let cancelled = false;
    markPerfEvent(
      "pixel fetch scheduled",
      `${pixelFetchBounds.minX}:${pixelFetchBounds.minY} -> ${pixelFetchBounds.maxX}:${pixelFetchBounds.maxY}`,
    );
    const fetchTimeout = window.setTimeout(async () => {
      markPerfEvent("pixel fetch start");
      const result = await fetchVisibleWorldPixels(
        pixelFetchBounds.minX,
        pixelFetchBounds.maxX,
        pixelFetchBounds.minY,
        pixelFetchBounds.maxY,
      );

      if (!cancelled) {
        visiblePixelsRef.current = result.pixels;
        pixelIndexRef.current = new Map(result.pixels.map((pixel) => [`${pixel.x}:${pixel.y}`, pixel]));
        setVisiblePixels(result.pixels);
        markPerfEvent("pixel fetch done", `${result.pixels.length} pixels`);
      }
    }, PIXEL_FETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(fetchTimeout);
    };
  }, [pixelFetchBounds]);

  const pixelIndex = useMemo(() => {
    return new Map(visiblePixels.map((pixel) => [`${pixel.x}:${pixel.y}`, pixel]));
  }, [visiblePixels]);
  const pendingClaimMap = useMemo(() => buildPendingClaimMap(pendingClaims), [pendingClaims]);
  const pendingPaintMap = useMemo(() => buildPendingPaintMap(pendingPaints), [pendingPaints]);
  visiblePixelsRef.current = visiblePixels;
  pixelIndexRef.current = pixelIndex;
  pendingClaimsRef.current = pendingClaims;
  pendingClaimMapRef.current = pendingClaimMap;
  pendingPaintsRef.current = pendingPaints;
  pendingPaintMapRef.current = pendingPaintMap;

  const syncPendingClaims = useCallback((nextClaims: PixelCoordinate[]): void => {
    pendingClaimsRef.current = nextClaims;
    pendingClaimMapRef.current = buildPendingClaimMap(nextClaims);
    setPendingClaims(nextClaims);
  }, []);

  const syncPendingPaints = useCallback((nextPaints: PendingPaint[]): void => {
    pendingPaintsRef.current = nextPaints;
    pendingPaintMapRef.current = buildPendingPaintMap(nextPaints);
    setPendingPaints(nextPaints);
  }, []);

  const markWorldTileDirty = useCallback((pixel: PixelCoordinate): void => {
    const tileKey = getPixelTileKey(pixel);
    setTileRevisions((current) => ({
      ...current,
      [tileKey]: (current[tileKey] ?? 0) + 1,
    }));
  }, []);

  const getPlacementState = useCallback((pixel: PixelCoordinate | null): PlacementState => {
    if (pixel === null) {
      return {
        pixelRecord: null,
        isInsideWorld: false,
        canClaim: false,
        canPaint: false,
        isPendingClaim: false,
        pendingPaint: null,
      };
    }

    const bounds = activeWorldBoundsRef.current;
    const activeChunks = activeChunksRef.current;
    const pixelMap = pixelIndexRef.current;
    const pendingClaimsMap = pendingClaimMapRef.current;
    const pendingPaintsMap = pendingPaintMapRef.current;
    const zoom = zoomRef.current;
    const nextUser = currentUserRef.current;
    const pixelKey = getPixelKey(pixel);

    if (bounds === null) {
      return {
        pixelRecord: null,
        isInsideWorld: false,
        canClaim: false,
        canPaint: false,
        isPendingClaim: false,
        pendingPaint: null,
      };
    }

    const isInsideWorld = activeChunks.length === 0
      ? pixel.x >= bounds.minX &&
        pixel.x < bounds.maxX &&
        pixel.y >= bounds.minY &&
        pixel.y < bounds.maxY
      : activeChunks.some((chunk) => (
        pixel.x >= chunk.origin_x &&
        pixel.x < chunk.origin_x + chunk.width &&
        pixel.y >= chunk.origin_y &&
        pixel.y < chunk.origin_y + chunk.height
      ));
    const pixelRecord = pixelMap.get(pixelKey) ?? null;
    const isPendingClaim = pendingClaimsMap.has(pixelKey);
    const pendingPaint = pendingPaintsMap.get(pixelKey) ?? null;

    if (
      nextUser === null ||
      zoom < GRID_THRESHOLD ||
      !isInsideWorld
    ) {
      return {
        pixelRecord,
        isInsideWorld,
        canClaim: false,
        canPaint: false,
        isPendingClaim,
        pendingPaint,
      };
    }

    const canPaint =
      pixelRecord !== null &&
      !pixelRecord.is_starter &&
      (
        pixelRecord.owner_user_id === nextUser.id ||
        (pixelRecord.area_id !== null && knownPaintableAreaIdsRef.current.has(pixelRecord.area_id))
      ) &&
      !isPendingClaim;
    let canClaim = false;

    if (pixelRecord === null && !isPendingClaim) {
      const neighborKeys = [
        `${pixel.x - 1}:${pixel.y}`,
        `${pixel.x + 1}:${pixel.y}`,
        `${pixel.x}:${pixel.y - 1}`,
        `${pixel.x}:${pixel.y + 1}`,
      ];
      canClaim = neighborKeys.some((key) => {
        const neighbor = pixelMap.get(key);
        return pendingClaimsMap.has(key) || (neighbor ? neighbor.is_starter || neighbor.owner_user_id !== null : false);
      });
    }

    return {
      pixelRecord,
      isInsideWorld,
      canClaim,
      canPaint,
      isPendingClaim,
      pendingPaint,
    };
  }, []);

  const selectedPlacementState = getPlacementState(selectedPixel);

  const selectedPixelRecord = selectedPlacementState.pixelRecord;
  const selectedPendingPaint = selectedPlacementState.pendingPaint;

  useEffect(() => {
    if (selectedPendingPaint) {
      setSelectedColorId(selectedPendingPaint.colorId);
      return;
    }

    if (selectedPixelRecord?.color_id !== null && selectedPixelRecord?.color_id !== undefined) {
      setSelectedColorId(selectedPixelRecord.color_id);
    }
  }, [selectedPendingPaint, selectedPixelRecord]);

  useEffect(() => {
    const areaId = selectedPixelRecord?.area_id ?? null;

    if (areaId === null) {
      setSelectedArea(null);
      setAreaPanelBusy(false);
      setAreaMessage(null);
      return;
    }

    let cancelled = false;
    setAreaPanelBusy(true);
    setAreaMessage(null);

    void fetchClaimArea(areaId).then((result) => {
      if (cancelled) {
        return;
      }

      setAreaPanelBusy(false);

      if (!result.ok || result.area === null) {
        setSelectedArea(null);
        setAreaMessage({
          tone: "error",
          text: result.error ?? "Area details could not be loaded.",
        });
        return;
      }

      setSelectedArea(result.area);
      setAreaDraftName(result.area.name);
      setAreaDraftDescription(result.area.description);
      setAreaInvitePublicId("");

      if (result.area.viewer_can_paint) {
        knownPaintableAreaIdsRef.current.add(result.area.id);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedPixelRecord?.area_id]);

  const renderedPendingClaims = useMemo(() => {
    return pendingClaims.map((pixel) => ({
      key: `pending-claim-${getPixelKey(pixel)}`,
      left: camera.x + pixel.x * camera.zoom,
      top: camera.y + pixel.y * camera.zoom,
      width: camera.zoom,
      height: camera.zoom,
      isSelected: selectedPixel?.x === pixel.x && selectedPixel?.y === pixel.y,
    }));
  }, [camera.x, camera.y, camera.zoom, pendingClaims, selectedPixel]);

  const renderedPendingPaints = useMemo(() => {
    return pendingPaints.map((pixel) => ({
      key: `pending-paint-${getPixelKey(pixel)}`,
      left: camera.x + pixel.x * camera.zoom,
      top: camera.y + pixel.y * camera.zoom,
      width: camera.zoom,
      height: camera.zoom,
      color: PIXEL_PALETTE[pixel.colorId]?.hex ?? "#ffffff",
      isSelected: selectedPixel?.x === pixel.x && selectedPixel?.y === pixel.y,
    }));
  }, [camera.x, camera.y, camera.zoom, pendingPaints, selectedPixel]);

  const selectedPixelOverlay = useMemo(() => {
    if (selectedPixel === null) {
      return null;
    }

    return {
      left: camera.x + selectedPixel.x * camera.zoom,
      top: camera.y + selectedPixel.y * camera.zoom,
      size: camera.zoom,
    };
  }, [camera.x, camera.y, camera.zoom, selectedPixel]);

  const canClaimSelectedPixel = selectedPlacementState.canClaim;
  const canPaintSelectedPixel = selectedPlacementState.canPaint;
  const activePendingCount = activeBuildMode === "claim" ? pendingClaims.length : pendingPaints.length;
  const activePendingLabel = activeBuildMode === "claim"
    ? `${pendingClaims.length} pending claim${pendingClaims.length === 1 ? "" : "s"}`
    : `${pendingPaints.length} pending pixel${pendingPaints.length === 1 ? "" : "s"}`;

  const placementLabel = useMemo(() => {
    if (placementBusy) {
      return "Saving...";
    }

    if (activePendingCount === 0) {
      return "Nothing pending";
    }

    return activeBuildMode === "claim"
      ? `Submit ${activePendingCount} claim${activePendingCount === 1 ? "" : "s"}`
      : `Submit ${activePendingCount} pixel${activePendingCount === 1 ? "" : "s"}`;
  }, [activeBuildMode, activePendingCount, placementBusy]);

  const selectedCellLabel = useMemo(() => {
    if (selectedPixel === null) {
      return "No cell selected";
    }

    if (selectedPixelRecord === null) {
      return selectedPlacementState.isPendingClaim ? "Pending Holder claim" : "Unclaimed cell";
    }

    if (selectedPixelRecord.is_starter) {
      return "Starter frontier";
    }

    if (currentUser && selectedPixelRecord.owner_user_id === currentUser.id) {
      return selectedPendingPaint ? "Pending paint change" : "Your claimed territory";
    }

    if (selectedArea?.viewer_can_paint) {
      return "Contributor access";
    }

    return `Claimed by #${selectedPixelRecord.owner_public_id}`;
  }, [currentUser, selectedArea?.viewer_can_paint, selectedPendingPaint, selectedPixel, selectedPixelRecord, selectedPlacementState.isPendingClaim]);

  const placementHelpText = useMemo(() => {
    if (currentUser === null) {
      return "Login required to use the build tools.";
    }

    if (camera.zoom < GRID_THRESHOLD) {
      return "Zoom in until the pixel grid is visible before staging changes.";
    }

    if (selectedPixel === null) {
      return activeBuildMode === "claim"
        ? "Select a connected empty cell or press Space over the canvas to stage Holder claims."
        : "Select one of your claimed cells or press Space over your territory to stage paint changes.";
    }

    if (activeBuildMode === "claim") {
      if (claimTool === "rectangle") {
        return rectangleAnchor
          ? "Click the opposite corner. The rectangle cannot cover existing claims and must touch the claim route."
          : "Click the first rectangle corner, then click the opposite corner to stage a Holder area.";
      }

      if (selectedPlacementState.isPendingClaim) {
        return "This Holder claim is staged locally. Submit the pending claims when your shape is ready.";
      }

      if (canClaimSelectedPixel) {
        return "Press Space over cells to stage Holder claims. New claims must touch the starter frontier, an existing claim or another staged claim.";
      }

      return "Holder mode only claims empty cells. Pick an empty cell connected to claimed territory.";
    }

    if (selectedPendingPaint) {
      return "This color is staged locally. Keep painting with Space, then submit all pending pixels together.";
    }

    if (canPaintSelectedPixel) {
      return "Normal mode paints owned or contributed territory. Choose a palette color, press Space over cells, then submit.";
    }

    if (selectedPixelRecord === null || selectedPlacementState.isPendingClaim) {
      return "Normal mode cannot claim new cells. Switch to Holders first, submit the claim, then paint it.";
    }

    if (selectedPixelRecord.is_starter) {
      return "Starter frontier cells are reserved and cannot be painted.";
    }

    return "You can only paint inside territory you own or were invited into.";
  }, [
    activeBuildMode,
    camera.zoom,
    canClaimSelectedPixel,
    canPaintSelectedPixel,
    claimTool,
    currentUser,
    rectangleAnchor,
    selectedPendingPaint,
    selectedPixel,
    selectedPixelRecord,
    selectedPlacementState.isPendingClaim,
  ]);

  const renderPointerVisual = useCallback((): void => {
    const nextPointer = pointerRef.current;
    const horizontalLine = crosshairHorizontalRef.current;
    const verticalLine = crosshairVerticalRef.current;
    const hoverValue = hoverCoordinateValueRef.current;

    if (horizontalLine === null || verticalLine === null || hoverValue === null) {
      return;
    }

    if (!nextPointer.inside) {
      horizontalLine.style.display = "none";
      verticalLine.style.display = "none";
      hoverValue.textContent = "-- : --";
      return;
    }

    const hoverPixel = screenPointToWorldPixel(nextPointer.x, nextPointer.y, cameraRef.current);
    horizontalLine.style.display = "block";
    verticalLine.style.display = "block";
    horizontalLine.style.transform = `translateY(${Math.round(nextPointer.y)}px)`;
    verticalLine.style.transform = `translateX(${Math.round(nextPointer.x)}px)`;
    hoverValue.textContent = `${hoverPixel.x} : ${hoverPixel.y}`;
  }, []);

  const schedulePointerVisual = useCallback((): void => {
    if (pointerVisualFrameRef.current !== null) {
      return;
    }

    pointerVisualFrameRef.current = window.requestAnimationFrame(() => {
      pointerVisualFrameRef.current = null;
      renderPointerVisual();
    });
  }, [renderPointerVisual]);

  useEffect(() => {
    schedulePointerVisual();
  }, [camera.x, camera.y, camera.zoom, schedulePointerVisual]);

  useEffect(() => {
    return () => {
      if (pointerVisualFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerVisualFrameRef.current);
      }
    };
  }, []);

  const stageActiveToolPixel = useCallback((
    targetPixel: PixelCoordinate,
    options?: { quiet?: boolean },
  ): boolean => {
    setSelectedPixel(targetPixel);
    setBuildPanelOpen(true);

    const nextUser = currentUserRef.current;
    if (nextUser === null) {
      if (!options?.quiet) {
        setPlacementMessage({ tone: "error", text: "Login required to use the build tools." });
      }
      return false;
    }

    const targetState = getPlacementState(targetPixel);
    const activeMode = activeBuildModeRef.current;

    if (activeMode === "claim") {
      if (!targetState.canClaim) {
        if (!options?.quiet) {
          setPlacementMessage({
            tone: "error",
            text: "This cell cannot be claimed in Holder mode.",
          });
        }
        return false;
      }

      const nextClaims = pendingClaimsRef.current;
      const claimKey = getPixelKey(targetPixel);

      if (pendingClaimMapRef.current.has(claimKey)) {
        return false;
      }

      if (nextClaims.length >= getCurrentDisplayedHolders(nextUser)) {
        if (!options?.quiet) {
          setPlacementMessage({
            tone: "error",
            text: "Not enough Holders for more pending claims.",
          });
        }
        return false;
      }

      const updatedClaims = [...nextClaims, targetPixel];
      syncPendingClaims(updatedClaims);
      setPlacementMessage({
        tone: "info",
        text: `${updatedClaims.length} Holder claim${updatedClaims.length === 1 ? "" : "s"} staged locally.`,
      });
      return true;
    }

    if (!targetState.canPaint) {
      if (!options?.quiet) {
        setPlacementMessage({
          tone: "error",
          text: "Normal mode only paints territory you own or were invited into.",
        });
      }
      return false;
    }

    const paintKey = getPixelKey(targetPixel);
    const nextPaint: PendingPaint = {
      ...targetPixel,
      colorId: selectedColorIdRef.current,
    };
    const remainingPaints = pendingPaintsRef.current.filter((paint) => getPixelKey(paint) !== paintKey);
    const updatedPaints = [...remainingPaints, nextPaint];
    syncPendingPaints(updatedPaints);
    setPlacementMessage({
      tone: "info",
      text: `${updatedPaints.length} pixel${updatedPaints.length === 1 ? "" : "s"} staged locally.`,
    });
    return true;
  }, [getPlacementState, syncPendingClaims, syncPendingPaints]);

  const stageClaimRectangle = useCallback((start: PixelCoordinate, end: PixelCoordinate): boolean => {
    setSelectedPixel(end);
    setBuildPanelOpen(true);

    const nextUser = currentUserRef.current;
    if (nextUser === null) {
      setPlacementMessage({ tone: "error", text: "Login required to use the rectangle claim tool." });
      return false;
    }

    const rectanglePixels = getRectanglePixels(start, end);
    const pendingMap = pendingClaimMapRef.current;
    const newPixels = rectanglePixels.filter((pixel) => !pendingMap.has(getPixelKey(pixel)));

    if (newPixels.length === 0) {
      setPlacementMessage({ tone: "info", text: "This rectangle is already staged." });
      return false;
    }

    const displayedHolders = getCurrentDisplayedHolders(nextUser);
    if (pendingClaimsRef.current.length + newPixels.length > displayedHolders) {
      setPlacementMessage({
        tone: "error",
        text: "Not enough Holders for this rectangle.",
      });
      return false;
    }

    let touchesClaimRoute = false;

    for (const pixel of newPixels) {
      const state = getPlacementState(pixel);

      if (!state.isInsideWorld) {
        setPlacementMessage({ tone: "error", text: "The rectangle leaves the active world." });
        return false;
      }

      if (state.pixelRecord !== null) {
        setPlacementMessage({
          tone: "error",
          text: "The rectangle includes already claimed territory.",
        });
        return false;
      }

      if (state.canClaim) {
        touchesClaimRoute = true;
      }
    }

    if (!touchesClaimRoute) {
      setPlacementMessage({
        tone: "error",
        text: "The rectangle must touch the starter frontier, an existing claim or another pending claim.",
      });
      return false;
    }

    const updatedClaims = [...pendingClaimsRef.current, ...newPixels];
    syncPendingClaims(updatedClaims);
    setPlacementMessage({
      tone: "info",
      text: `${newPixels.length} rectangle claim${newPixels.length === 1 ? "" : "s"} staged locally.`,
    });
    return true;
  }, [getPlacementState, syncPendingClaims]);

  const stageSpaceStroke = useCallback((targetPixel: PixelCoordinate): void => {
    let stroke = spaceStrokeRef.current;

    if (stroke === null) {
      stroke = {
        visitedKeys: new Set(),
        lastPixel: null,
      };
      spaceStrokeRef.current = stroke;
    }

    const linePixels = stroke.lastPixel ? getPixelLine(stroke.lastPixel, targetPixel) : [targetPixel];

    for (const pixel of linePixels) {
      const pixelKey = getPixelKey(pixel);

      if (stroke.visitedKeys.has(pixelKey)) {
        continue;
      }

      if (stageActiveToolPixel(pixel, { quiet: true })) {
        stroke.visitedKeys.add(pixelKey);
      }
    }

    stroke.lastPixel = targetPixel;
  }, [stageActiveToolPixel]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.code !== "Space" ||
        isEditableTarget(event.target) ||
        activeModalRef.current !== null
      ) {
        return;
      }

      event.preventDefault();

      if (event.repeat) {
        return;
      }

      spaceToolActiveRef.current = true;
      setSpaceToolActive(true);
      spaceStrokeRef.current = {
        visitedKeys: new Set(),
        lastPixel: null,
      };

      const currentPointer = pointerRef.current;

      if (currentPointer.inside) {
        stageSpaceStroke(screenPointToWorldPixel(currentPointer.x, currentPointer.y, cameraRef.current));
      }
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== "Space") {
        return;
      }

      spaceToolActiveRef.current = false;
      setSpaceToolActive(false);
      spaceStrokeRef.current = null;
    };

    const handleWindowBlur = (): void => {
      spaceToolActiveRef.current = false;
      setSpaceToolActive(false);
      spaceStrokeRef.current = null;
      dragState.current = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [stageSpaceStroke]);

  function updatePointer(event: React.PointerEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      inside: true,
    };
    schedulePointerVisual();
  }

  function getEventPixel(event: React.PointerEvent<HTMLDivElement>): PixelCoordinate {
    const rect = event.currentTarget.getBoundingClientRect();
    return screenToWorldPixel(event.clientX - rect.left, event.clientY - rect.top);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }

    updatePointer(event);
    const targetPixel = getEventPixel(event);

    if (spaceToolActiveRef.current) {
      stageSpaceStroke(targetPixel);
      return;
    }

    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: camera.x,
      originY: camera.y,
      mode: "pan",
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    updatePointer(event);
    const targetPixel = getEventPixel(event);

    if (spaceToolActiveRef.current) {
      stageSpaceStroke(targetPixel);
      return;
    }

    const drag = dragState.current;

    if (drag?.pointerId !== event.pointerId) {
      return;
    }

    if (drag.mode === "pan") {
      setCamera((current) =>
        clampCamera({
          ...current,
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY,
        }),
      );
      return;
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragState.current;

    if (drag?.pointerId !== event.pointerId) {
      return;
    }

    dragState.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= CLICK_DISTANCE) {
      const clickedPixel = getEventPixel(event);
      setSelectedPixel(clickedPixel);
      setBuildPanelOpen(true);
      setPlacementMessage(null);

      if (activeBuildModeRef.current === "claim" && claimToolRef.current === "rectangle") {
        const anchor = rectangleAnchorRef.current;

        if (anchor === null) {
          setRectangleAnchor(clickedPixel);
          setPlacementMessage({
            tone: "info",
            text: "Rectangle start set. Click the opposite corner to stage the claim.",
          });
          return;
        }

        stageClaimRectangle(anchor, clickedPixel);
        setRectangleAnchor(null);
      }
    }
  }

  function handlePointerLeave(): void {
    pointerRef.current = {
      ...pointerRef.current,
      inside: false,
    };
    schedulePointerVisual();
  }

  function handleGoogleLogin(): void {
    const nextUrl = window.location.href;
    const loginUrl = `${getClientApiBaseUrl()}/auth/google/login?next=${encodeURIComponent(nextUrl)}`;
    window.location.assign(loginUrl);
  }

  async function handleLogout(): Promise<void> {
    setAuthBusy(true);
    await logoutAuthSession();
    setAuthStatus(FALLBACK_AUTH_STATUS);
    setAuthBusy(false);
    setActiveModal(null);
  }

  async function handleDisplayNameSave(): Promise<void> {
    if (!currentUser) {
      return;
    }

    setProfileBusy(true);
    setProfileMessage(null);

    const result = await updateDisplayName(normalizedProfileName);

    if (!result.ok || result.user === null) {
      setProfileMessage({
        tone: "error",
        text: result.error ?? "Display name update failed.",
      });
      setProfileBusy(false);
      return;
    }

    setAuthStatus((current) => ({
      ...current,
      user: result.user,
    }));
    setProfileName(result.user.display_name);
    setProfileMessage({
      tone: "success",
      text: currentUser.needs_display_name_setup
        ? "Display name saved. Welcome to PixelProject."
        : "Display name updated successfully.",
    });
    setProfileBusy(false);
  }

  function handleAvatarUploadClick(): void {
    avatarFileInputRef.current?.click();
  }

  async function handleAvatarFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0] ?? null;

    if (!file || !currentUser) {
      return;
    }

    setAvatarBusy(true);
    setAvatarMessage(null);

    const result = await uploadAvatar(file);

    if (!result.ok || result.user === null) {
      setAvatarMessage({
        tone: "error",
        text: result.error ?? "Avatar upload failed.",
      });
      setAvatarBusy(false);
      event.target.value = "";
      return;
    }

    setAuthStatus((current) => ({
      ...current,
      user: result.user,
    }));
    setAvatarMessage({
      tone: "success",
      text: "Avatar uploaded successfully.",
    });
    setAvatarBusy(false);
    event.target.value = "";
  }

  const applySavedPixel = useCallback((nextPixel: WorldPixel, nextUser: AuthUser): void => {
    const previousPixel = visiblePixelsRef.current.find(
      (pixel) => pixel.id === nextPixel.id || (pixel.x === nextPixel.x && pixel.y === nextPixel.y),
    );
    const nextPixels = visiblePixelsRef.current.filter(
      (pixel) => pixel.id !== nextPixel.id && !(pixel.x === nextPixel.x && pixel.y === nextPixel.y),
    );
    nextPixels.push(nextPixel);
    visiblePixelsRef.current = nextPixels;
    pixelIndexRef.current = new Map(nextPixels.map((pixel) => [`${pixel.x}:${pixel.y}`, pixel]));
    setVisiblePixels(nextPixels);
    currentUserRef.current = nextUser;
    setAuthStatus((current) => ({
      ...current,
      user: nextUser,
    }));
    markWorldTileDirty(nextPixel);
    setSelectedPixel({ x: nextPixel.x, y: nextPixel.y });
    setSelectedArea((currentArea) => {
      if (
        currentArea === null ||
        nextPixel.area_id !== currentArea.id ||
        nextPixel.color_id === null ||
        previousPixel?.color_id !== null
      ) {
        return currentArea;
      }

      return {
        ...currentArea,
        painted_pixels_count: currentArea.painted_pixels_count + 1,
      };
    });
  }, [markWorldTileDirty]);

  async function handlePlacementAction(): Promise<void> {
    if (currentUser === null || placementBusy || activePendingCount === 0) {
      return;
    }

    setPlacementBusy(true);
    setPlacementMessage(null);

    if (activeBuildMode === "claim") {
      const claimsToSubmit = [...pendingClaimsRef.current];
      const failedIndex = await submitPendingClaims(claimsToSubmit);

      if (failedIndex === -1) {
        syncPendingClaims([]);
        setPlacementMessage({
          tone: "success",
          text: `${claimsToSubmit.length} Holder claim${claimsToSubmit.length === 1 ? "" : "s"} saved.`,
        });
      } else {
        syncPendingClaims(claimsToSubmit.slice(failedIndex));
      }

      setPlacementBusy(false);
      return;
    }

    const paintsToSubmit = [...pendingPaintsRef.current];
    const failedIndex = await submitPendingPaints(paintsToSubmit);

    if (failedIndex === -1) {
      syncPendingPaints([]);
      setPlacementMessage({
        tone: "success",
        text: `${paintsToSubmit.length} pixel${paintsToSubmit.length === 1 ? "" : "s"} saved.`,
      });
    } else {
      syncPendingPaints(paintsToSubmit.slice(failedIndex));
    }

    setPlacementBusy(false);
  }

  async function submitPendingClaims(claimsToSubmit: PixelCoordinate[]): Promise<number> {
    const result = await claimWorldPixels(claimsToSubmit);

    if (!result.ok || result.user === null || result.area === null || result.pixels.length === 0) {
      setPlacementMessage({
        tone: "error",
        text: result.error ?? "Claim submission failed. Pending claims stayed local.",
      });
      return 0;
    }

    for (const pixel of result.pixels) {
      applySavedPixel(pixel, result.user);
    }

    setSelectedArea(result.area);
    setAreaDraftName(result.area.name);
    setAreaDraftDescription(result.area.description);
    knownPaintableAreaIdsRef.current.add(result.area.id);
    setWorld(await fetchWorldOverview());
    return -1;
  }

  async function submitPendingPaints(paintsToSubmit: PendingPaint[]): Promise<number> {
    for (let index = 0; index < paintsToSubmit.length; index += 1) {
      const paint = paintsToSubmit[index];
      const result = await paintWorldPixel(paint.x, paint.y, paint.colorId);

      if (!result.ok || result.pixel === null || result.user === null) {
        setPlacementMessage({
          tone: "error",
          text: result.error ?? "Pixel submission failed. Remaining pixels stayed pending.",
        });
        return index;
      }

      applySavedPixel(result.pixel, result.user);
    }

    return -1;
  }

  async function handleAreaSave(): Promise<void> {
    if (selectedArea === null || areaPanelBusy) {
      return;
    }

    setAreaPanelBusy(true);
    setAreaMessage(null);

    const result = await updateClaimArea(selectedArea.id, areaDraftName, areaDraftDescription);

    if (!result.ok || result.area === null) {
      setAreaMessage({
        tone: "error",
        text: result.error ?? "Area update failed.",
      });
      setAreaPanelBusy(false);
      return;
    }

    setSelectedArea(result.area);
    setAreaDraftName(result.area.name);
    setAreaDraftDescription(result.area.description);
    setAreaMessage({
      tone: "success",
      text: "Area info saved.",
    });
    setAreaPanelBusy(false);
  }

  async function handleAreaInvite(): Promise<void> {
    if (selectedArea === null || areaPanelBusy) {
      return;
    }

    const publicId = Number.parseInt(areaInvitePublicId.trim().replace(/^#/, ""), 10);

    if (!Number.isFinite(publicId)) {
      setAreaMessage({
        tone: "error",
        text: "Enter a valid public player number.",
      });
      return;
    }

    setAreaPanelBusy(true);
    setAreaMessage(null);

    const result = await inviteAreaContributor(selectedArea.id, publicId);

    if (!result.ok || result.area === null) {
      setAreaMessage({
        tone: "error",
        text: result.error ?? "Contributor invite failed.",
      });
      setAreaPanelBusy(false);
      return;
    }

    setSelectedArea(result.area);
    setAreaInvitePublicId("");
    setAreaMessage({
      tone: "success",
      text: `Player #${publicId} can now pixel in this area.`,
    });
    setAreaPanelBusy(false);
  }

  function handleBuildModeChange(nextMode: BuildMode): void {
    setActiveBuildMode(nextMode);
    setBuildPanelOpen(true);
    setPlacementMessage(null);
    spaceStrokeRef.current = null;

    if (nextMode !== "claim") {
      setRectangleAnchor(null);
    }
  }

  function handleClaimToolChange(nextTool: ClaimTool): void {
    setClaimTool(nextTool);
    setBuildPanelOpen(true);
    setPlacementMessage(null);

    if (nextTool !== "rectangle") {
      setRectangleAnchor(null);
    }
  }

  function handleCloseBuildPanel(): void {
    setBuildPanelOpen(false);
    setPlacementMessage(null);
    buildPanelDragState.current = null;
  }

  function handleClearActivePending(): void {
    if (activeBuildMode === "claim") {
      syncPendingClaims([]);
      setRectangleAnchor(null);
    } else {
      syncPendingPaints([]);
    }

    setPlacementMessage({
      tone: "info",
      text: `${BUILD_MODE_LABEL[activeBuildMode]} pending changes cleared.`,
    });
  }

  function handleBuildPanelDragStart(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;

    if (target instanceof HTMLElement && target.closest("button")) {
      return;
    }

    const panel = buildPanelRef.current;

    if (panel === null) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const origin = clampPanelPosition(rect.left, rect.top, rect.width, rect.height);

    buildPanelDragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      width: rect.width,
      height: rect.height,
    };
    setBuildPanelPosition(origin);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleBuildPanelDragMove(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = buildPanelDragState.current;

    if (drag?.pointerId !== event.pointerId) {
      return;
    }

    setBuildPanelPosition(
      clampPanelPosition(
        drag.originX + event.clientX - drag.startX,
        drag.originY + event.clientY - drag.startY,
        drag.width,
        drag.height,
      ),
    );
  }

  function handleBuildPanelDragEnd(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = buildPanelDragState.current;

    if (drag?.pointerId !== event.pointerId) {
      return;
    }

    buildPanelDragState.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function openMePage(): void {
    window.open("/me", "_blank", "noopener,noreferrer");
  }

  const accountButtonLabel = currentUser
    ? `${currentUser.display_name} #${currentUser.public_id}`
    : "Login";
  const buildPanelStyle = buildPanelPosition
    ? {
        left: `${buildPanelPosition.x}px`,
        top: `${buildPanelPosition.y}px`,
        bottom: "auto",
        transform: "none",
      }
    : undefined;

  return (
    <main className={`world-shell ${darkMode ? "theme-dark" : "theme-light"}`}>
      <PerfDebugOverlay />
      <div className="world-hud world-hud-left">
        <div className="hud-stack">
          <button
            aria-label="Open information"
            className="hud-icon-button"
            onClick={() => setActiveModal("info")}
            type="button"
          >
            I
          </button>
          <button
            className="hud-version-button"
            onClick={() => setActiveModal("changelog")}
            type="button"
          >
            Version {APP_VERSION}
          </button>
        </div>
      </div>

      <div className="world-hud world-hud-right">
        {currentUser ? (
          <button
            aria-label="Open shop"
            className="hud-icon-button hud-shop-button"
            onClick={() => setActiveModal("shop")}
            type="button"
          >
            <ShopIcon />
          </button>
        ) : null}
        <button className="hud-login-button" onClick={() => setActiveModal("login")} type="button">
          {accountButtonLabel}
        </button>
      </div>

      {selectedPixelRecord && !selectedPixelRecord.is_starter ? (
        <aside className="world-area-panel" aria-label="Selected area information">
          <div className="area-panel-header">
            <span className="coordinate-label">Selected area</span>
            <strong>{areaPanelBusy && selectedArea === null ? "Loading..." : selectedArea?.name ?? "Unassigned claim"}</strong>
          </div>
          {selectedArea ? (
            <>
              <div className="area-stat-grid">
                <article>
                  <span>Owner</span>
                  <strong>#{selectedArea.owner.public_id}</strong>
                  <small>{selectedArea.owner.display_name}</small>
                </article>
                <article>
                  <span>Size</span>
                  <strong>{selectedArea.claimed_pixels_count}</strong>
                  <small>{selectedArea.painted_pixels_count} painted</small>
                </article>
                <article>
                  <span>Contributors</span>
                  <strong>{selectedArea.contributor_count}</strong>
                  <small>{selectedArea.viewer_can_paint ? "You can pixel here" : "View only"}</small>
                </article>
              </div>
              {selectedArea.viewer_can_edit ? (
                <div className="area-owner-tools">
                  <label className="account-label" htmlFor="area-name-input">Name</label>
                  <input
                    className="account-input area-input"
                    id="area-name-input"
                    maxLength={80}
                    onChange={(event) => setAreaDraftName(event.target.value)}
                    value={areaDraftName}
                  />
                  <label className="account-label" htmlFor="area-description-input">Info</label>
                  <textarea
                    className="account-input area-textarea"
                    id="area-description-input"
                    maxLength={1200}
                    onChange={(event) => setAreaDraftDescription(event.target.value)}
                    placeholder="What is shown here?"
                    value={areaDraftDescription}
                  />
                  <button
                    className="google-button area-action-button"
                    disabled={areaPanelBusy}
                    onClick={() => void handleAreaSave()}
                    type="button"
                  >
                    {areaPanelBusy ? "Saving..." : "Save area info"}
                  </button>
                  <label className="account-label" htmlFor="area-invite-input">Invite by #</label>
                  <div className="area-invite-row">
                    <input
                      className="account-input area-input"
                      id="area-invite-input"
                      inputMode="numeric"
                      onChange={(event) => setAreaInvitePublicId(event.target.value)}
                      placeholder="#123"
                      value={areaInvitePublicId}
                    />
                    <button
                      className="google-button area-action-button"
                      disabled={areaPanelBusy}
                      onClick={() => void handleAreaInvite()}
                      type="button"
                    >
                      Invite
                    </button>
                  </div>
                </div>
              ) : (
                <p className="area-description">
                  {selectedArea.description || "No area info yet."}
                </p>
              )}
              {selectedArea.contributors.length > 0 ? (
                <div className="area-contributor-list">
                  <span className="account-label">Can pixel here</span>
                  {selectedArea.contributors.map((contributor) => (
                    <small key={contributor.id}>#{contributor.public_id} {contributor.display_name}</small>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="area-description">This older claim is not assigned to an area yet.</p>
          )}
          {areaMessage ? (
            <p className={`account-feedback is-${areaMessage.tone}`}>{areaMessage.text}</p>
          ) : null}
        </aside>
      ) : null}

      <div className="world-hud world-hud-bottom-left">
        <div className="coordinate-panel">
          <div className="coordinate-row">
            <span className="coordinate-label">Hover</span>
            <span className="coordinate-value" ref={hoverCoordinateValueRef}>-- : --</span>
          </div>
          <div className="coordinate-row">
            <span className="coordinate-label">Selected</span>
            <span className="coordinate-value">
              {selectedPixel === null ? "-- : --" : `${selectedPixel.x} : ${selectedPixel.y}`}
            </span>
          </div>
        </div>
      </div>

      <div className="world-hud world-hud-bottom">
        <button
          aria-label="Toggle grid"
          className={modalButtonClass(showGrid)}
          onClick={() => setShowGrid((current) => !current)}
          type="button"
        >
          Grid
        </button>
        <button
          aria-label="Toggle dark mode"
          className={modalButtonClass(darkMode)}
          onClick={() => setDarkMode((current) => !current)}
          type="button"
        >
          Dark
        </button>
      </div>

      <div className="world-hud world-hud-bottom-center">
        <div className="build-taskbar" aria-label="Build tools">
          <button
            className={`build-tool-button ${activeBuildMode === "claim" ? "is-active" : ""}`}
            onClick={() => handleBuildModeChange("claim")}
            type="button"
          >
            <span>{BUILD_MODE_LABEL.claim}</span>
            <small>Claim only</small>
            {pendingClaims.length > 0 ? <strong>{pendingClaims.length}</strong> : null}
          </button>
          <button
            className={`build-tool-button ${activeBuildMode === "paint" ? "is-active" : ""}`}
            onClick={() => handleBuildModeChange("paint")}
            type="button"
          >
            <span>{BUILD_MODE_LABEL.paint}</span>
            <small>Palette</small>
            {pendingPaints.length > 0 ? <strong>{pendingPaints.length}</strong> : null}
          </button>
          <HolderTaskbarStatus pendingClaims={pendingClaims.length} user={currentUser} />
        </div>
      </div>

      {buildPanelOpen ? (
        <div
          className={`world-hud world-hud-placement ${buildPanelPosition ? "is-floating" : ""}`}
          style={buildPanelStyle}
        >
          <div className="pixel-placement-panel" ref={buildPanelRef}>
            <div
              className="pixel-placement-header"
              onPointerCancel={handleBuildPanelDragEnd}
              onPointerDown={handleBuildPanelDragStart}
              onPointerMove={handleBuildPanelDragMove}
              onPointerUp={handleBuildPanelDragEnd}
            >
              <div>
                <span className="coordinate-label">{BUILD_MODE_LABEL[activeBuildMode]} mode</span>
                <strong className="pixel-placement-title">
                  {selectedPixel === null ? "No pixel selected" : `${selectedPixel.x} : ${selectedPixel.y}`}
                </strong>
                <span className="pixel-placement-mode-help">{BUILD_MODE_HELP[activeBuildMode]}</span>
              </div>
              <div className="pixel-placement-header-actions">
                <span className="pixel-placement-owner">{selectedCellLabel}</span>
                <button
                  aria-label="Close build panel"
                  className="pixel-panel-close"
                  onClick={handleCloseBuildPanel}
                  onPointerDown={(event) => event.stopPropagation()}
                  type="button"
                >
                  X
                </button>
              </div>
            </div>
            <HolderPanelSummary pendingClaims={pendingClaims.length} user={currentUser} />
            {activeBuildMode === "claim" ? (
              <div className="claim-tool-row" aria-label="Holder claim tools">
                <button
                  className={`claim-tool-button ${claimTool === "brush" ? "is-active" : ""}`}
                  onClick={() => handleClaimToolChange("brush")}
                  type="button"
                >
                  Brush
                </button>
                <button
                  className={`claim-tool-button ${claimTool === "rectangle" ? "is-active" : ""}`}
                  onClick={() => handleClaimToolChange("rectangle")}
                  type="button"
                >
                  Rectangle
                </button>
                {rectangleAnchor ? (
                  <span>{rectangleAnchor.x} : {rectangleAnchor.y}</span>
                ) : null}
              </div>
            ) : null}
            {activeBuildMode === "paint" ? (
              <div className="pixel-palette-grid">
                {PIXEL_PALETTE.map((color) => (
                  <button
                    aria-label={`Select ${color.name}`}
                    className={`pixel-color-button ${selectedColorId === color.id ? "is-active" : ""}`}
                    key={color.id}
                    onClick={() => setSelectedColorId(color.id)}
                    style={{ backgroundColor: color.hex }}
                    type="button"
                  />
                ))}
              </div>
            ) : null}
            <div className="pixel-placement-footer">
              <div className="pixel-pending-row">
                <span>{activePendingLabel}</span>
                <button
                  className="pixel-clear-button"
                  disabled={placementBusy || activePendingCount === 0}
                  onClick={handleClearActivePending}
                  type="button"
                >
                  Clear
                </button>
              </div>
              <p className="pixel-placement-help">{placementHelpText}</p>
              {placementMessage ? (
                <p className={`account-feedback is-${placementMessage.tone}`}>{placementMessage.text}</p>
              ) : null}
              <button
                className="google-button pixel-place-button"
                disabled={placementBusy || activePendingCount === 0}
                onClick={() => void handlePlacementAction()}
                type="button"
              >
                {placementLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={`world-viewport immersive ${gridVisible ? "grid-visible" : "grid-hidden"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        ref={viewportRef}
      >
        <div className="world-backdrop-glow" aria-hidden="true" />
        <div
          aria-hidden="true"
          className="world-pixel-grid"
        >
          {gridLines.vertical.map((line) => (
            <span
              className={`world-grid-line world-grid-line-vertical ${line.major ? "is-major" : ""}`}
              key={line.key}
              style={{ left: `${line.position}px` }}
            />
          ))}
          {gridLines.horizontal.map((line) => (
            <span
              className={`world-grid-line world-grid-line-horizontal ${line.major ? "is-major" : ""}`}
              key={line.key}
              style={{ top: `${line.position}px` }}
            />
          ))}
        </div>
        <div className="world-claim-layer" aria-hidden="true">
          {renderedWorldTiles.map((tile) => (
            <span
              className="world-tile"
              key={`claim-${tile.key}`}
              style={{
                left: `${tile.left}px`,
                top: `${tile.top}px`,
                width: `${tile.size}px`,
                height: `${tile.size}px`,
                backgroundImage: `url("${getWorldTileUrl("claims", tile.tileX, tile.tileY, tile.revision)}")`,
              }}
            />
          ))}
          {renderedPendingClaims.map((pixel) => (
            <span
              className={`world-pending-claim ${pixel.isSelected ? "is-selected" : ""}`}
              key={pixel.key}
              style={{
                left: `${pixel.left}px`,
                top: `${pixel.top}px`,
                width: `${pixel.width}px`,
                height: `${pixel.height}px`,
              }}
            />
          ))}
        </div>
        <div className="world-pixel-layer" aria-hidden="true">
          {renderedWorldTiles.map((tile) => (
            <span
              className="world-tile"
              key={`paint-${tile.key}`}
              style={{
                left: `${tile.left}px`,
                top: `${tile.top}px`,
                width: `${tile.size}px`,
                height: `${tile.size}px`,
                backgroundImage: `url("${getWorldTileUrl("paint", tile.tileX, tile.tileY, tile.revision)}")`,
              }}
            />
          ))}
          {renderedPendingPaints.map((pixel) => (
            <span
              className={`world-pending-paint ${pixel.isSelected ? "is-selected" : ""}`}
              key={pixel.key}
              style={{
                left: `${pixel.left}px`,
                top: `${pixel.top}px`,
                width: `${pixel.width}px`,
                height: `${pixel.height}px`,
                backgroundColor: pixel.color,
              }}
            />
          ))}
        </div>
        {selectedPixelOverlay ? (
          <div
            aria-hidden="true"
            className="world-selected-pixel"
            style={{
              left: `${selectedPixelOverlay.left}px`,
              top: `${selectedPixelOverlay.top}px`,
              width: `${selectedPixelOverlay.size}px`,
              height: `${selectedPixelOverlay.size}px`,
            }}
          />
        ) : null}
        {activeChunkEdges.map((edge) => (
          <div
            aria-hidden="true"
            className="world-limit"
            key={edge.key}
            style={{
              left: `${edge.left}px`,
              top: `${edge.top}px`,
              width: `${edge.width}px`,
              height: `${edge.height}px`,
            }}
          />
        ))}

        <div
          aria-hidden="true"
          className="world-crosshair-line world-crosshair-horizontal"
          ref={crosshairHorizontalRef}
        />
        <div
          aria-hidden="true"
          className="world-crosshair-line world-crosshair-vertical"
          ref={crosshairVerticalRef}
        />
      </div>

      {activeModal === "info" ? (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} role="presentation">
          <section
            aria-labelledby="info-title"
            className="modal-window"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Information</p>
                <h2 id="info-title">PixelProject overview</h2>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} type="button">
                Close
              </button>
            </div>

            <div className="modal-scroll-area">
              <div className="modal-sections">
                <article className="modal-card">
                  <h3>Announcements</h3>
                  <p>
                    The landing view stays intentionally minimal: only the world viewport is visible,
                    while project information now lives in dedicated modal windows.
                  </p>
                </article>
                <article className="modal-card">
                  <h3>Rules</h3>
                  <p>
                    Claims must touch the starter frontier or another claimed pixel, and painting is
                    only allowed inside territory that belongs to you.
                  </p>
                </article>
                <article className="modal-card">
                  <h3>Terms of Service</h3>
                  <p>
                    Legal notes, privacy details and account policies are kept out of the canvas view
                    and will be maintained in this information area.
                  </p>
                </article>
                <article className="modal-card">
                  <h3>World internals</h3>
                  <p>
                    The backend still uses hidden chunks of {world.chunk_size} x {world.chunk_size}
                    pixels, but chunk borders are not rendered in the frontend so the canvas stays
                    visually clean.
                  </p>
                </article>
                <article className="modal-card">
                  <h3>Canvas tools</h3>
                  <p>
                    Use the bottom taskbar to switch between Holder claims and normal painting.
                    Press Space over cells to stage changes locally, then submit them together.
                  </p>
                </article>
              </div>
            </div>
            <button className="modal-version-button" onClick={() => setActiveModal("changelog")} type="button">
              Version {APP_VERSION}
            </button>
          </section>
        </div>
      ) : null}

      {activeModal === "changelog" ? (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} role="presentation">
          <section
            aria-labelledby="changelog-title"
            className="modal-window"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Version history</p>
                <h2 id="changelog-title">Project changelog</h2>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} type="button">
                Close
              </button>
            </div>
            <div className="modal-scroll-area">
              <article className="modal-card changelog-card">
                <div className="changelog-list">
                  {APP_CHANGELOG.map((entry) => (
                    <div className="changelog-entry" key={entry.version}>
                      <div className="changelog-entry-header">
                        <strong>{entry.version}</strong>
                        <span>{entry.date}</span>
                      </div>
                      <ul>
                        {entry.changes.map((change) => (
                          <li key={change}>{change}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </article>
            </div>
            <p className="modal-version">Version {APP_VERSION}</p>
          </section>
        </div>
      ) : null}

      {activeModal === "login" ? (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} role="presentation">
          <section
            aria-labelledby="login-title"
            className="modal-window login-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Account</p>
                <h2 id="login-title">
                  {authStatus.authenticated ? "Account profile" : "Continue with Google"}
                </h2>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} type="button">
                Close
              </button>
            </div>
            <div className="modal-scroll-area">
              {currentUser ? (
                <div className="modal-card account-card">
                  <div className="account-header">
                    <div className="account-avatar-stack">
                      {currentUser.avatar_url ? (
                        <Image
                          alt={currentUser.display_name}
                          className="account-avatar"
                          height={72}
                          referrerPolicy="no-referrer"
                          src={currentUser.avatar_url}
                          width={72}
                        />
                      ) : (
                        <div className="account-avatar account-avatar-fallback" aria-hidden="true">
                          <DefaultAvatarIcon />
                        </div>
                      )}
                      <button
                        aria-label="Edit avatar"
                        className="account-avatar-edit-button"
                        onClick={() => setActiveModal("avatar")}
                        type="button"
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    <div className="account-details">
                      <h3>{currentUser.display_name}</h3>
                      <p className="account-tag">#{currentUser.public_id}</p>
                      <p>
                        <HolderAccountCount user={currentUser} />
                      </p>
                      <p>Use the pencil button under your profile image to open avatar editing.</p>
                    </div>
                  </div>
                  {currentUser.needs_display_name_setup ? (
                    <div className="account-onboarding">
                      <strong>Welcome aboard.</strong>
                      <span>New registrations must choose a real display name before settling in.</span>
                    </div>
                  ) : null}
                  <div className="account-stat-grid">
                    <article className="account-stat-card">
                      <span className="account-stat-label">Level</span>
                      <strong>{currentUser.level}</strong>
                      <small>
                        {currentUser.level_progress_current} / {currentUser.level_progress_target}
                      </small>
                    </article>
                    <article className="account-stat-card">
                      <span className="account-stat-label">Placed Holders</span>
                      <strong>{currentUser.holders_placed_total}</strong>
                      <small>{currentUser.claimed_pixels_count} active claimed pixels</small>
                    </article>
                    <article className="account-stat-card">
                      <span className="account-stat-label">Regeneration</span>
                      <HolderAccountStatus user={currentUser} />
                      <small>Projected locally from backend timestamps</small>
                    </article>
                    <article className="account-stat-card">
                      <span className="account-stat-label">Last Login</span>
                      <strong>{formatDateTime(currentUser.last_login_at)}</strong>
                      <small>Created {formatDateTime(currentUser.created_at)}</small>
                    </article>
                  </div>
                  <div className="account-name-editor">
                    <label className="account-label" htmlFor="display-name-input">
                      Display name
                    </label>
                    <input
                      className="account-input"
                      id="display-name-input"
                      maxLength={24}
                      onChange={(event) => setProfileName(event.target.value)}
                      placeholder="Enter a display name"
                      type="text"
                      value={profileName}
                    />
                    <p className="account-helper">{nameChangeHint}</p>
                    {profileMessage ? (
                      <p className={`account-feedback is-${profileMessage.tone}`}>{profileMessage.text}</p>
                    ) : null}
                  </div>
                  <div className="account-actions">
                    <button
                      className="google-button google-button-secondary"
                      disabled={authBusy || profileBusy}
                      onClick={openMePage}
                      type="button"
                    >
                      Open /me JSON
                    </button>
                    <button
                      className="google-button"
                      disabled={
                        authBusy ||
                        profileBusy ||
                        !currentUser.can_change_display_name ||
                        !hasDisplayNameChange
                      }
                      onClick={() => void handleDisplayNameSave()}
                      type="button"
                    >
                      {profileBusy ? "Saving..." : currentUser.needs_display_name_setup ? "Save my name" : "Save display name"}
                    </button>
                    <button
                      className="google-button google-button-secondary"
                      disabled={authBusy || profileBusy}
                      onClick={() => void handleLogout()}
                      type="button"
                    >
                      {authBusy ? "Signing out..." : "Logout"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="modal-card">
                  <p>
                    Google OAuth is the account entry point for PixelProject. The first successful
                    login now creates the player account and redirects brand-new users into the
                    required display-name setup flow.
                  </p>
                  <button
                    className="google-button"
                    disabled={authLoading || authBusy || !authStatus.google_oauth_configured}
                    onClick={handleGoogleLogin}
                    type="button"
                  >
                    {authLoading
                      ? "Checking auth..."
                      : authStatus.google_oauth_configured
                        ? "Continue with Google"
                        : "Google OAuth not configured"}
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {activeModal === "avatar" && currentUser ? (
        <div className="modal-backdrop" onClick={() => setActiveModal("login")} role="presentation">
          <section
            aria-labelledby="avatar-title"
            className="modal-window login-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Profile Edit</p>
                <h2 id="avatar-title">Avatar upload</h2>
              </div>
              <button className="modal-close" onClick={() => setActiveModal("login")} type="button">
                Back
              </button>
            </div>
            <div className="modal-scroll-area">
              <div className="modal-card avatar-editor-card">
                <input
                  accept="image/*"
                  className="avatar-file-input"
                  onChange={(event) => void handleAvatarFileChange(event)}
                  ref={avatarFileInputRef}
                  type="file"
                />
                <div className="avatar-editor-current">
                  {currentUser.avatar_url ? (
                    <Image
                      alt={currentUser.display_name}
                      className="account-avatar avatar-editor-preview"
                      height={88}
                      referrerPolicy="no-referrer"
                      src={currentUser.avatar_url}
                      width={88}
                    />
                  ) : (
                    <div className="account-avatar account-avatar-fallback avatar-editor-preview" aria-hidden="true">
                      <DefaultAvatarIcon />
                    </div>
                  )}
                  <div>
                    <h3>Current avatar</h3>
                    <p className="account-helper">
                      Upload your own image. We crop it to a square and resize it automatically for the profile UI.
                    </p>
                    <div className="avatar-upload-actions">
                      <button
                        className="google-button"
                        disabled={avatarBusy}
                        onClick={handleAvatarUploadClick}
                        type="button"
                      >
                        {avatarBusy ? "Uploading..." : "Upload custom avatar"}
                      </button>
                    </div>
                    {avatarMessage ? (
                      <p className={`account-feedback is-${avatarMessage.tone}`}>{avatarMessage.text}</p>
                    ) : null}
                  </div>
                </div>
                {currentUser.avatar_history.length > 0 ? (
                  <div className="avatar-history-block compact">
                    <span className="account-label">Previous uploads</span>
                    <div className="avatar-history-grid">
                      {currentUser.avatar_history.map((avatar) => (
                        <div className="avatar-history-tile" key={`${avatar.image_url}-${avatar.selected_at}`}>
                          <Image alt={avatar.label} className="avatar-history-image" height={56} src={avatar.image_url} width={56} />
                          <span>{avatar.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activeModal === "shop" ? (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} role="presentation">
          <section
            aria-labelledby="shop-title"
            className="modal-window login-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Shop</p>
                <h2 id="shop-title">Player shop placeholder</h2>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} type="button">
                Close
              </button>
            </div>
            <div className="modal-scroll-area">
              <div className="modal-card">
                <p>
                  The shop entry point now exists for signed-in players. We can fill it with holder
                  upgrades, perks, cosmetics or supporter packs in the next steps.
                </p>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
