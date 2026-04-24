"use client";

import Image from "next/image";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  claimWorldPixels,
  fetchClaimContextPixels,
  fetchClaimOutlinePixels,
  fetchClaimArea,
  fetchClaimAreaAtPixel,
  fetchAuthSession,
  fetchMyClaimAreas,
  fetchVisibleClaimAreaPreviews,
  fetchVisibleWorldPixels,
  fetchWorldOverview,
  getClientApiBaseUrl,
  getWorldRealtimeUrl,
  getWorldTileUrl,
  inviteAreaContributor,
  logoutAuthSession,
  paintWorldPixels,
  promoteAreaContributor,
  removeAreaContributor,
  updateClaimArea,
  updateDisplayName,
  uploadAvatar,
  type AuthUser,
  type AuthSessionStatus,
  type AreaContributorSummary,
  type ClaimAreaOverlayInput,
  type ClaimAreaOverlayRecord,
  type ClaimAreaClaimMode,
  type ClaimContextPixel,
  type ClaimAreaPreview,
  type ClaimAreaRecord,
  type ClaimAreaSummary,
  type ClaimAreaListItem,
  type ClaimAreaStatus,
  type ClaimOutlineSegment,
  type PaintTileInput,
  type WorldOverview,
  type WorldPixel,
  type WorldRealtimeUpdate,
  type WorldTileCoordinate,
} from "@/lib/api";
import { APP_CHANGELOG } from "@/lib/app-changelog";
import { APP_VERSION } from "@/lib/app-version";
import { OUTSIDE_ART_PATTERN_SIZE, type OutsideArtAsset } from "@/lib/outside-art-types";
import { DEFAULT_COLOR_ID, PIXEL_PALETTE, PIXEL_PALETTE_DISPLAY_ROWS } from "@/lib/pixel-palette";

type WorldStageProps = {
  outsideArtAssets: OutsideArtAsset[];
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

type ClaimTool = "brush" | "rectangle" | "overlay";
type PaintTool = "brush" | "eraser" | "picker";

type ActiveModal = "info" | "changelog" | "login" | "shop" | "avatar" | "areas";

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

type WorldBoundaryRect = {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type ActiveChunkViewportRect = WorldBoundaryRect;

type WorldTile = {
  key: string;
  detailScale: number;
  tileX: number;
  tileY: number;
  left: number;
  top: number;
  size: number;
};

type WorldTileFallback = {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  soften: boolean;
};

type WorldTileRasterProps = {
  layer: DebugTileLayer;
  onDebugSignal?: (signal: DebugTileSignal) => void;
  onTileLoaded?: (layer: DebugTileLayer, tileKey: string, src: string) => void;
  retainedSrc?: string | null;
  tile: WorldTile;
  src: string;
  fallback: WorldTileFallback | null;
};

type GridLine = {
  key: string;
  position: number;
  major: boolean;
  origin: boolean;
};

type PixelCoordinate = {
  x: number;
  y: number;
};

type PendingPaint = PixelCoordinate & {
  colorId: number;
};

type PendingClaimRectangle = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type PendingClaimRowInterval = {
  start: number;
  end: number;
};

type ClaimContextPixelRecord = ClaimContextPixel;

type ProfileMessage = {
  tone: "error" | "success" | "info";
  text: string;
};

type AreaOptionsMenuState = {
  publicId: number;
  canEdit: boolean;
  messageTarget: "area" | "areas-list";
  left: number;
  top: number;
};

type AreaPlayerOptionsMenuState = {
  publicId: number;
  displayName: string;
  role: "member" | "admin";
  left: number;
  top: number;
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

type VisibleAreaBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  key: string;
};

type ClaimRectanglePlacementEvaluation = {
  blockedReason: "outside-world" | "claimed-territory" | null;
  unresolvedNeighborCount: number;
  newPixelCount: number;
  overlapsPendingClaim: boolean;
  touchesClaimRoute: boolean;
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

type RightEraseStrokeState = SpaceStrokeState & {
  pointerId: number;
};

type StagePixelOptions = {
  allowPicker?: boolean;
  quiet?: boolean;
  updateSelection?: boolean;
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

type OverlayColorMode = ClaimAreaOverlayInput["color_mode"];
type OverlayResizeHandle = "north" | "east" | "south" | "west" | "north-east" | "south-east" | "south-west" | "north-west";

type ClaimOverlayTransform = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

type ClaimOverlaySource = {
  image: HTMLImageElement;
  imageName: string;
  width: number;
  height: number;
  version: number;
};

type ClaimOverlayTemplatePixel = PixelCoordinate & {
  colorId: number;
};

type ClaimOverlayDraft = {
  sourceVersion: number;
  imageName: string;
  sourceWidth: number;
  sourceHeight: number;
  transform: ClaimOverlayTransform;
  colorMode: OverlayColorMode;
  colorPalette: string;
  dithering: boolean;
  flipX: boolean;
  flipY: boolean;
  enabledColorIds: number[];
  templatePixels: ClaimOverlayTemplatePixel[];
  previewDataUrl: string | null;
  renderMessage: string | null;
};

type OverlayPointerDragState = {
  pointerId: number;
  mode: "move" | "resize";
  handle: OverlayResizeHandle | null;
  startX: number;
  startY: number;
  startTransform: ClaimOverlayTransform;
};

type ClaimOverlayRenderResult = {
  previewDataUrl: string;
  templatePixels: ClaimOverlayTemplatePixel[];
};

type ClaimOverlayPaletteColor = {
  id: number;
  name: string;
  hex: string;
  r: number;
  g: number;
  b: number;
};

const EMPTY_PLACEMENT_STATE: PlacementState = {
  pixelRecord: null,
  isInsideWorld: false,
  canClaim: false,
  canPaint: false,
  isPendingClaim: false,
  pendingPaint: null,
};

type PerfMarkDetail = {
  label: string;
  detail?: string;
  at: number;
};

type DebugEventDetail = {
  kind: PerfEventKind;
  label: string;
  detail?: string;
  at: number;
  duration?: number;
};

type PerfEventKind =
  | "gap"
  | "layout"
  | "longtask"
  | "mark"
  | "action"
  | "network"
  | "measure"
  | "tile"
  | "snapshot"
  | "warning";

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

type PerfDebugOverlayProps = {
  getSnapshot?: () => DebugWorldSnapshot | null;
};

type PerfDebugWindow = Window & {
  __pixelPerfLog?: PerfEventRecord[];
  __pixelPerfDump?: () => string;
  __pixelPerfClear?: () => void;
  __pixelDebugDump?: () => string;
  __pixelDebugClear?: () => void;
  __pixelDebugStart?: () => void;
  __pixelDebugStop?: () => void;
};

type DebugTileLayer = "claims" | "paint" | "visual";

type DebugTileSignal = {
  layer: DebugTileLayer;
  phase: "src" | "load" | "error";
  tileKey: string;
  detailScale: number;
  hasFallback: boolean;
  src: string;
  duration?: number;
};

type DebugTileState = {
  loaded: boolean;
  failed: boolean;
  detailScale: number;
  hasFallback: boolean;
  src: string;
  updatedAt: number;
};

type DebugTileLayerSnapshot = {
  active: number;
  loaded: number;
  loading: number;
  failed: number;
  fallbackVisible: number;
};

type DebugWorldSnapshot = {
  zoom: number;
  cameraX: number;
  cameraY: number;
  growth: WorldOverview["growth"];
  layerMode: "visual" | "semantic";
  tileDetailScale: number | null;
  renderedTiles: number;
  visiblePixels: number;
  claimOutlineSegments: number;
  pendingClaims: number;
  pendingPaints: number;
  selectedPixel: string | null;
  inspectedPixel: string | null;
  selectedAreaId: string | null;
  buildPanelOpen: boolean;
  areaPanelBusy: boolean;
  areaDetailsBusy: boolean;
  rectanglePlacementBusy: boolean;
  visual: DebugTileLayerSnapshot;
  claims: DebugTileLayerSnapshot;
  paint: DebugTileLayerSnapshot;
};

type PendingClaimSegment = {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  isBulk: boolean;
};

type PendingPaintCanvasTile = {
  key: string;
  originX: number;
  originY: number;
  paints: PendingPaint[];
};

type ClaimOverlayStatus = "owner" | "contributor" | "blocked" | "starter";

type ClaimOutlinePath = {
  key: string;
  status: ClaimOverlayStatus;
  d: string;
};

type SelectedPixelOverlay = {
  left: number;
  top: number;
  size: number;
};

type HoverPixelOverlay = SelectedPixelOverlay & {
  key: string;
};

type PaintCursorOverlay = HoverPixelOverlay & {
  color: string;
  isTransparent: boolean;
};

type GridLineSet = {
  vertical: GridLine[];
  horizontal: GridLine[];
};

type WorldViewportCanvasProps = {
  activeChunkBoundaryRects: WorldBoundaryRect[];
  activeChunkViewportRects: ActiveChunkViewportRect[];
  bulkPendingClaimOverlay: boolean;
  claimOutlinePaths: ClaimOutlinePath[];
  crosshairHorizontalRef: RefObject<HTMLDivElement | null>;
  crosshairVerticalRef: RefObject<HTMLDivElement | null>;
  getVisualTileFallback: (tile: WorldTile) => WorldTileFallback | null;
  getVisualTileSrc: (tile: WorldTile) => string;
  gridLines: GridLineSet;
  onTileDebugSignal?: (signal: DebugTileSignal) => void;
  onTileLoaded?: (layer: DebugTileLayer, tileKey: string, src: string) => void;
  outsideArtPatternImages: ReactNode;
  pendingPaintTiles: PendingPaintCanvasTile[];
  pendingClaimOutlinePath: string | null;
  renderedPendingClaims: PendingClaimSegment[];
  renderedWorldTiles: WorldTile[];
  retainedVisualTileSrcs: Map<string, string>;
  camera: CameraState;
  hoverPixelOverlay: HoverPixelOverlay | null;
  paintCursorOverlay: PaintCursorOverlay | null;
  selectedPixelOverlay: SelectedPixelOverlay | null;
  viewportSize: ViewportSize;
  worldOutsideMaskId: string;
  worldOutsidePatternId: string;
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
const WORLD_OVERVIEW_REFRESH_INTERVAL_MS = 60000;
const HOLDER_TICK_MS = 1000;
const PIXEL_FETCH_DEBOUNCE_MS = 120;
const PIXEL_FETCH_REPEAT_CACHE_MS = 500;
const SELECTED_PIXEL_FETCH_DEBOUNCE_MS = 120;
const SELECTED_PIXEL_FETCH_MISS_COOLDOWN_MS = 1500;
const CAMERA_FETCH_SETTLE_MS = 180;
const PIXEL_FETCH_MARGIN = 2;
const RECTANGLE_ANCHOR_PREFETCH_RADIUS = 72;
const CLAIM_OUTLINE_FETCH_DEBOUNCE_MS = 120;
const CLAIM_OUTLINE_FETCH_REPEAT_CACHE_MS = 1000;
const CLAIM_OUTLINE_FETCH_MARGIN = 2;
const CLAIM_OUTLINE_FETCH_OVERSCAN_VIEWPORT_FACTOR = 0.45;
const CLAIM_OUTLINE_MAX_FREE_FETCH_CELLS = 200_000;
const VISIBLE_AREA_PREFETCH_DEBOUNCE_MS = 180;
const VISIBLE_AREA_POLL_INTERVAL_MS = 5000;
const VISIBLE_AREA_PREFETCH_OVERSCAN_VIEWPORT_FACTOR = 0.45;
const VISIBLE_AREA_PREFETCH_SNAP_WORLD_UNITS = 16;
const VISIBLE_AREA_PREFETCH_CACHE_MS = 3000;
const CLAIM_BATCH_PIXEL_LIMIT = 500_000;
const CLAIM_OVERLAY_TEMPLATE_PIXEL_LIMIT = 200_000;
const CLAIM_OVERLAY_MAX_SIDE = 4096;
const CLAIM_OVERLAY_SNAP_DISTANCE = 24;
const CLAIM_OVERLAY_PREVIEW_PIXEL_SCALE = 3;
const CLAIM_OVERLAY_PREVIEW_PIXEL_CENTER = Math.floor(CLAIM_OVERLAY_PREVIEW_PIXEL_SCALE / 2);
const CLAIM_OVERLAY_PREVIEW_PIXEL_ALPHA = 235;
const BULK_PENDING_CLAIM_THRESHOLD = 20_000;
const PENDING_PAINT_CANVAS_TILE_SIZE = 128;
const PENDING_PAINT_CANVAS_MAX_CELL_SIZE = 16;
const CLAIM_AREA_CACHE_LIMIT = 128;
const AREA_NAME_MAX_LENGTH = 20;
const AREA_DESCRIPTION_MAX_LENGTH = 250;
const PERF_EVENT_NAME = "pixelproject:perf-event";
const DEBUG_EVENT_NAME = "pixelproject:debug-event";
const PERF_FRAME_GAP_THRESHOLD_MS = 42;
const PERF_LOG_LIMIT = 500;
const DEBUG_EVENT_PANEL_LIMIT = 14;
const DEBUG_SNAPSHOT_INTERVAL_MS = 1000;
const DEBUG_WARNING_COOLDOWN_MS = 1200;
const DEBUG_LAYOUT_SHIFT_MIN_VALUE = 0.005;
const DEBUG_LAYOUT_SHIFT_SUPPRESSION_AFTER_ZOOM_MS = 700;
const DEBUG_WORLD_RENDER_MARK_MIN_INTERVAL_MS = 500;
const DEBUG_INTERACTION_MARK_MIN_INTERVAL_MS = 120;
const DEBUG_MEASURE_THRESHOLD_MS = 8;
const WORLD_TILE_SIZE = 1000;
const WORLD_LOW_TILE_DETAIL_SCALE = 2;
const WORLD_LOW_TILE_SIZE = WORLD_TILE_SIZE * WORLD_LOW_TILE_DETAIL_SCALE;
const WORLD_DETAIL_TILE_MIN_SCREEN_SIZE = 200;
const WORLD_TILE_MARGIN = 1;
const WORLD_TILE_OVERSCAN_VIEWPORT_FACTOR = 0.35;
const WORLD_LOW_TILE_MARGIN = 0;
const WORLD_LOW_TILE_OVERSCAN_VIEWPORT_FACTOR = 0.08;
const TRANSPARENT_COLOR_ID = 31;
const PIXEL_PALETTE_NAME_BY_ID = new Map<number, string>(PIXEL_PALETTE.map((color) => [color.id, color.name]));
const PIXEL_PALETTE_COLOR_BY_ID = new Map<number, string>(PIXEL_PALETTE.map((color) => [color.id, color.hex]));
const CLAIM_OVERLAY_VISIBLE_PALETTE = PIXEL_PALETTE.filter((color) => color.id !== TRANSPARENT_COLOR_ID);
const CLAIM_OVERLAY_DEFAULT_COLOR_IDS = CLAIM_OVERLAY_VISIBLE_PALETTE.map((color) => color.id);
const BUILD_MODE_LABEL: Record<BuildMode, string> = {
  claim: "Claim Area",
  paint: "Color Pixel",
};
const BUILD_MODE_HELP: Record<BuildMode, string> = {
  claim: "Claim Area only. Uses Holders and has no color palette.",
  paint: "Color Pixel only. You can only pixel in areas you own or where you were added.",
};
const DEV_BUNDLE_RECOVERY_NOTICE =
  "Local development bundle is out of sync. Close this browser tab and reopen PixelProject. If it stays broken, restart the frontend container.";
const DEV_BUNDLE_ERROR_PATTERNS = [
  "__webpack_modules__",
  "React Client Manifest",
  "Cannot find module './",
  "ChunkLoadError",
  "Loading chunk",
  "module factory is not available",
];
const CLAIM_OUTLINE_COLORS: Record<ClaimOverlayStatus, string> = {
  owner: "rgba(118, 255, 228, 0.9)",
  contributor: "rgba(255, 183, 95, 0.9)",
  blocked: "rgba(255, 110, 110, 0.84)",
  starter: "rgba(255, 232, 156, 0.9)",
};

function formatGrowthStageLabel(growth: WorldOverview["growth"]): string {
  return `Stage ${growth.stage} -> ${growth.next_stage}`;
}

const FALLBACK_AUTH_STATUS: AuthSessionStatus = {
  authenticated: false,
  google_oauth_configured: false,
  user: null,
  request_failed: true,
};

function getAuthStatusSignature(status: AuthSessionStatus): string {
  return JSON.stringify(status);
}

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
    perfDebugEnabledCache =
      params.has("perf") ||
      params.has("debug") ||
      window.localStorage.getItem("pixelproject:perf") === "1" ||
      window.localStorage.getItem("pixelproject:debug") === "1";
    return perfDebugEnabledCache;
  } catch {
    perfDebugEnabledCache = false;
    return false;
  }
}

function stringifyUnknownError(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getDevBundleRecoveryNotice(value: unknown): string | null {
  const message = stringifyUnknownError(value);
  return DEV_BUNDLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
    ? DEV_BUNDLE_RECOVERY_NOTICE
    : null;
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

function getPerfMarkThrottleMs(label: string): number {
  switch (label) {
    case "world render":
      return DEBUG_WORLD_RENDER_MARK_MIN_INTERVAL_MS;
    case "wheel zoom":
      return DEBUG_INTERACTION_MARK_MIN_INTERVAL_MS;
    case "holder tick":
    case "normal pixel tick":
      return 2000;
    default:
      return 0;
  }
}

function isPerfMarkDetail(value: unknown): value is PerfMarkDetail {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<PerfMarkDetail>;
  return typeof candidate.label === "string" && typeof candidate.at === "number";
}

function emitDebugEvent(
  kind: Exclude<PerfEventKind, "gap" | "layout" | "longtask" | "mark">,
  label: string,
  detail?: string,
  duration?: number,
): void {
  if (typeof window === "undefined" || !isPerfDebugEnabled()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<DebugEventDetail>(DEBUG_EVENT_NAME, {
      detail: {
        kind,
        label,
        detail,
        at: performance.now(),
        duration,
      },
    }),
  );
}

function measureDebugWork<T>(
  label: string,
  task: () => T,
  detail?: string | ((result: T) => string),
  thresholdMs = DEBUG_MEASURE_THRESHOLD_MS,
): T {
  if (typeof window === "undefined" || !isPerfDebugEnabled()) {
    return task();
  }

  const startedAt = performance.now();
  const result = task();
  const duration = performance.now() - startedAt;

  if (duration >= thresholdMs) {
    emitDebugEvent(
      "measure",
      label,
      typeof detail === "function" ? detail(result) : detail,
      duration,
    );
  }

  return result;
}

function isDebugEventDetail(value: unknown): value is DebugEventDetail {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<DebugEventDetail>;
  return (
    typeof candidate.kind === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.at === "number"
  );
}

function formatPerfTime(value: number): string {
  return `${Math.round(value)}ms`;
}

function formatDebugLayerLabel(snapshot: Pick<DebugWorldSnapshot, "layerMode" | "tileDetailScale">): string {
  if (snapshot.tileDetailScale === null) {
    return snapshot.layerMode;
  }

  return snapshot.tileDetailScale === 1
    ? `${snapshot.layerMode} detail`
    : `${snapshot.layerMode} low x${snapshot.tileDetailScale}`;
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

function isWorldTileCoordinate(value: unknown): value is WorldTileCoordinate {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WorldTileCoordinate).tile_x === "number" &&
    typeof (value as WorldTileCoordinate).tile_y === "number"
  );
}

function isWorldRealtimeUpdate(value: unknown): value is WorldRealtimeUpdate {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<WorldRealtimeUpdate>;
  return (
    payload.type === "world:update" &&
    Array.isArray(payload.paint_tiles) &&
    payload.paint_tiles.every(isWorldTileCoordinate) &&
    Array.isArray(payload.claim_tiles) &&
    payload.claim_tiles.every(isWorldTileCoordinate)
  );
}

function getRealtimeDirtyTiles(update: WorldRealtimeUpdate): WorldTileCoordinate[] {
  const dirtyTiles = new Map<string, WorldTileCoordinate>();

  for (const tile of [...update.paint_tiles, ...update.claim_tiles]) {
    dirtyTiles.set(`${tile.tile_x}:${tile.tile_y}`, tile);
  }

  return [...dirtyTiles.values()];
}

function parsePaletteHex(hexColor: string): { r: number; g: number; b: number } | null {
  if (!hexColor.startsWith("#") || hexColor.length !== 7) {
    return null;
  }

  return {
    r: Number.parseInt(hexColor.slice(1, 3), 16),
    g: Number.parseInt(hexColor.slice(3, 5), 16),
    b: Number.parseInt(hexColor.slice(5, 7), 16),
  };
}

const CLAIM_OVERLAY_PALETTE_RGB: ClaimOverlayPaletteColor[] = CLAIM_OVERLAY_VISIBLE_PALETTE.flatMap((color) => {
  const rgb = parsePaletteHex(color.hex);

  return rgb === null
    ? []
    : [{
        id: color.id,
        name: color.name,
        hex: color.hex,
        ...rgb,
      }];
});

function srgbToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function getOverlayColorDistance(
  r: number,
  g: number,
  b: number,
  color: ClaimOverlayPaletteColor,
  colorMode: OverlayColorMode,
): number {
  if (colorMode === "rgb") {
    return (
      (r - color.r) ** 2 +
      (g - color.g) ** 2 +
      (b - color.b) ** 2
    );
  }

  return (
    0.2126 * (srgbToLinear(r) - srgbToLinear(color.r)) ** 2 +
    0.7152 * (srgbToLinear(g) - srgbToLinear(color.g)) ** 2 +
    0.0722 * (srgbToLinear(b) - srgbToLinear(color.b)) ** 2
  );
}

function findNearestOverlayColor(
  r: number,
  g: number,
  b: number,
  palette: ClaimOverlayPaletteColor[],
  colorMode: OverlayColorMode,
): ClaimOverlayPaletteColor {
  let nearest = palette[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const color of palette) {
    const distance = getOverlayColorDistance(r, g, b, color, colorMode);

    if (distance < nearestDistance) {
      nearest = color;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function buildClaimOverlayDraftColorMap(templatePixels: readonly ClaimOverlayTemplatePixel[]): Map<string, number> {
  return new Map(templatePixels.map((pixel) => [getPixelKey(pixel), pixel.colorId]));
}

function buildClaimOverlayRecordColorMap(
  templatePixels: ClaimAreaOverlayRecord["template_pixels"],
): Map<string, number> {
  return new Map(templatePixels.map((pixel) => [getPixelKey(pixel), pixel.color_id]));
}

function paintClaimOverlayPreviewPixel(
  imageData: ImageData,
  pixelX: number,
  pixelY: number,
  canvasWidth: number,
  color: Pick<ClaimOverlayPaletteColor, "r" | "g" | "b">,
): void {
  const outputX = pixelX * CLAIM_OVERLAY_PREVIEW_PIXEL_SCALE + CLAIM_OVERLAY_PREVIEW_PIXEL_CENTER;
  const outputY = pixelY * CLAIM_OVERLAY_PREVIEW_PIXEL_SCALE + CLAIM_OVERLAY_PREVIEW_PIXEL_CENTER;
  const outputIndex = (outputY * canvasWidth + outputX) * 4;

  imageData.data[outputIndex] = color.r;
  imageData.data[outputIndex + 1] = color.g;
  imageData.data[outputIndex + 2] = color.b;
  imageData.data[outputIndex + 3] = CLAIM_OVERLAY_PREVIEW_PIXEL_ALPHA;
}

function buildClaimOverlayRender(
  source: ClaimOverlaySource,
  draft: ClaimOverlayDraft,
): ClaimOverlayRenderResult {
  const width = Math.max(1, Math.round(draft.transform.width));
  const height = Math.max(1, Math.round(draft.transform.height));
  const cellCount = width * height;

  if (width > CLAIM_OVERLAY_MAX_SIDE || height > CLAIM_OVERLAY_MAX_SIDE) {
    throw new Error(`Overlay sides are limited to ${formatCount(CLAIM_OVERLAY_MAX_SIDE)} pixels.`);
  }

  if (cellCount > CLAIM_OVERLAY_TEMPLATE_PIXEL_LIMIT) {
    throw new Error(`Overlay templates are limited to ${formatCount(CLAIM_OVERLAY_TEMPLATE_PIXEL_LIMIT)} pixels.`);
  }

  const palette = CLAIM_OVERLAY_PALETTE_RGB.filter((color) => draft.enabledColorIds.includes(color.id));

  if (palette.length === 0) {
    throw new Error("Enable at least one color plate before generating the overlay.");
  }

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });

  if (sourceContext === null) {
    throw new Error("Could not prepare the overlay image.");
  }

  sourceContext.imageSmoothingEnabled = true;
  sourceContext.save();

  if (draft.flipX || draft.flipY) {
    sourceContext.translate(draft.flipX ? width : 0, draft.flipY ? height : 0);
    sourceContext.scale(draft.flipX ? -1 : 1, draft.flipY ? -1 : 1);
  }

  sourceContext.clearRect(0, 0, width, height);
  sourceContext.drawImage(source.image, 0, 0, width, height);
  sourceContext.restore();

  const sourceImageData = sourceContext.getImageData(0, 0, width, height);
  const previewCanvas = document.createElement("canvas");
  const previewWidth = width * CLAIM_OVERLAY_PREVIEW_PIXEL_SCALE;
  const previewHeight = height * CLAIM_OVERLAY_PREVIEW_PIXEL_SCALE;
  previewCanvas.width = previewWidth;
  previewCanvas.height = previewHeight;
  const previewContext = previewCanvas.getContext("2d");

  if (previewContext === null) {
    throw new Error("Could not prepare the overlay preview.");
  }

  previewContext.imageSmoothingEnabled = false;
  const outputImageData = previewContext.createImageData(previewWidth, previewHeight);
  const templatePixels: ClaimOverlayTemplatePixel[] = [];
  const errorPixels = draft.dithering ? new Float32Array(cellCount * 3) : null;

  if (errorPixels !== null) {
    for (let pixelIndex = 0; pixelIndex < cellCount; pixelIndex += 1) {
      const sourceIndex = pixelIndex * 4;
      const errorIndex = pixelIndex * 3;
      errorPixels[errorIndex] = sourceImageData.data[sourceIndex];
      errorPixels[errorIndex + 1] = sourceImageData.data[sourceIndex + 1];
      errorPixels[errorIndex + 2] = sourceImageData.data[sourceIndex + 2];
    }
  }

  function addDitherError(pixelX: number, pixelY: number, errorR: number, errorG: number, errorB: number, weight: number): void {
    if (errorPixels === null || pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) {
      return;
    }

    const errorIndex = (pixelY * width + pixelX) * 3;
    errorPixels[errorIndex] = clampColorChannel(errorPixels[errorIndex] + errorR * weight);
    errorPixels[errorIndex + 1] = clampColorChannel(errorPixels[errorIndex + 1] + errorG * weight);
    errorPixels[errorIndex + 2] = clampColorChannel(errorPixels[errorIndex + 2] + errorB * weight);
  }

  for (let pixelY = 0; pixelY < height; pixelY += 1) {
    for (let pixelX = 0; pixelX < width; pixelX += 1) {
      const pixelIndex = pixelY * width + pixelX;
      const sourceIndex = pixelIndex * 4;
      const alpha = sourceImageData.data[sourceIndex + 3];
      const worldX = draft.transform.originX + pixelX;
      const worldY = draft.transform.originY - pixelY;

      if (alpha < 16) {
        continue;
      }

      const r = errorPixels === null ? sourceImageData.data[sourceIndex] : errorPixels[pixelIndex * 3];
      const g = errorPixels === null ? sourceImageData.data[sourceIndex + 1] : errorPixels[pixelIndex * 3 + 1];
      const b = errorPixels === null ? sourceImageData.data[sourceIndex + 2] : errorPixels[pixelIndex * 3 + 2];
      const nearest = findNearestOverlayColor(
        clampColorChannel(r),
        clampColorChannel(g),
        clampColorChannel(b),
        palette,
        draft.colorMode,
      );

      paintClaimOverlayPreviewPixel(outputImageData, pixelX, pixelY, previewWidth, nearest);
      templatePixels.push({
        x: worldX,
        y: worldY,
        colorId: nearest.id,
      });

      if (errorPixels !== null) {
        const errorR = r - nearest.r;
        const errorG = g - nearest.g;
        const errorB = b - nearest.b;
        addDitherError(pixelX + 1, pixelY, errorR, errorG, errorB, 7 / 16);
        addDitherError(pixelX - 1, pixelY + 1, errorR, errorG, errorB, 3 / 16);
        addDitherError(pixelX, pixelY + 1, errorR, errorG, errorB, 5 / 16);
        addDitherError(pixelX + 1, pixelY + 1, errorR, errorG, errorB, 1 / 16);
      }
    }
  }

  previewContext.putImageData(outputImageData, 0, 0);

  return {
    previewDataUrl: previewCanvas.toDataURL("image/png"),
    templatePixels,
  };
}

function buildClaimOverlayRecordPreview(overlay: ClaimAreaOverlayRecord): string | null {
  if (typeof document === "undefined" || overlay.width <= 0 || overlay.height <= 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  const previewWidth = overlay.width * CLAIM_OVERLAY_PREVIEW_PIXEL_SCALE;
  const previewHeight = overlay.height * CLAIM_OVERLAY_PREVIEW_PIXEL_SCALE;
  canvas.width = previewWidth;
  canvas.height = previewHeight;
  const context = canvas.getContext("2d");

  if (context === null) {
    return null;
  }

  context.imageSmoothingEnabled = false;
  const imageData = context.createImageData(previewWidth, previewHeight);

  for (const pixel of overlay.template_pixels) {
    const color = CLAIM_OVERLAY_PALETTE_RGB.find((paletteColor) => paletteColor.id === pixel.color_id);

    if (!color) {
      continue;
    }

    const x = pixel.x - overlay.origin_x;
    const y = overlay.origin_y - pixel.y;

    if (x < 0 || x >= overlay.width || y < 0 || y >= overlay.height) {
      continue;
    }

    paintClaimOverlayPreviewPixel(imageData, x, y, previewWidth, color);
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function toClaimContextPixelRecord(
  pixel: Pick<WorldPixel, "x" | "y" | "owner_user_id" | "area_id" | "is_starter">,
): ClaimContextPixelRecord {
  return {
    x: pixel.x,
    y: pixel.y,
    owner_user_id: pixel.owner_user_id,
    area_id: pixel.area_id,
    is_starter: pixel.is_starter,
  };
}

function areClaimContextPixelsEqual(
  left: ClaimContextPixelRecord,
  right: ClaimContextPixelRecord,
): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.owner_user_id === right.owner_user_id &&
    left.area_id === right.area_id &&
    left.is_starter === right.is_starter
  );
}

function mergeClaimContextPixels(
  currentPixels: Map<string, ClaimContextPixelRecord>,
  fetchedPixels: readonly ClaimContextPixelRecord[],
): Map<string, ClaimContextPixelRecord> {
  if (fetchedPixels.length === 0) {
    return currentPixels;
  }

  let changed = false;
  const nextPixels = new Map(currentPixels);

  for (const pixel of fetchedPixels) {
    const pixelKey = getPixelKey(pixel);
    const previousPixel = nextPixels.get(pixelKey);

    if (previousPixel && areClaimContextPixelsEqual(previousPixel, pixel)) {
      continue;
    }

    nextPixels.set(pixelKey, pixel);
    changed = true;
  }

  return changed ? nextPixels : currentPixels;
}

function syncClaimContextPixelsForWindow(
  currentPixels: Map<string, ClaimContextPixelRecord>,
  bounds: Pick<VisibleAreaBounds, "minX" | "maxX" | "minY" | "maxY">,
  fetchedPixels: readonly ClaimContextPixelRecord[],
): Map<string, ClaimContextPixelRecord> {
  const nextPixels = new Map(currentPixels);
  const visibleKeys = new Set<string>();
  let changed = false;

  for (const pixel of fetchedPixels) {
    const pixelKey = getPixelKey(pixel);
    visibleKeys.add(pixelKey);
    const previousPixel = nextPixels.get(pixelKey);

    if (previousPixel && areClaimContextPixelsEqual(previousPixel, pixel)) {
      continue;
    }

    nextPixels.set(pixelKey, pixel);
    changed = true;
  }

  for (const [pixelKey, pixel] of currentPixels.entries()) {
    if (
      pixel.x < bounds.minX ||
      pixel.x > bounds.maxX ||
      pixel.y < bounds.minY ||
      pixel.y > bounds.maxY ||
      visibleKeys.has(pixelKey)
    ) {
      continue;
    }

    nextPixels.delete(pixelKey);
    changed = true;
  }

  return changed ? nextPixels : currentPixels;
}

function getWorldTileKey(tileX: number, tileY: number, detailScale = 1): string {
  return detailScale === 1 ? `${tileX}:${tileY}` : `low-${detailScale}:${tileX}:${tileY}`;
}

function getLowWorldTileCoordinate(detailTileCoordinate: number): number {
  return Math.floor(detailTileCoordinate / WORLD_LOW_TILE_DETAIL_SCALE);
}

function snapVisibleAreaMin(value: number): number {
  return Math.floor(value / VISIBLE_AREA_PREFETCH_SNAP_WORLD_UNITS) * VISIBLE_AREA_PREFETCH_SNAP_WORLD_UNITS;
}

function snapVisibleAreaMax(value: number): number {
  return (
    Math.ceil((value + 1) / VISIBLE_AREA_PREFETCH_SNAP_WORLD_UNITS) *
      VISIBLE_AREA_PREFETCH_SNAP_WORLD_UNITS
  ) - 1;
}

function getFetchBoundsKey(bounds: Pick<VisibleAreaBounds, "minX" | "maxX" | "minY" | "maxY">): string {
  return `${bounds.minX}:${bounds.minY}:${bounds.maxX}:${bounds.maxY}`;
}

function getPixelTileCoordinate(pixel: PixelCoordinate): { tileX: number; tileY: number } {
  return {
    tileX: Math.floor(pixel.x / WORLD_TILE_SIZE),
    tileY: Math.floor(pixel.y / WORLD_TILE_SIZE),
  };
}

function getTileLocalOffset(pixel: PixelCoordinate): number {
  const { tileX, tileY } = getPixelTileCoordinate(pixel);
  const localX = pixel.x - tileX * WORLD_TILE_SIZE;
  const localY = pixel.y - tileY * WORLD_TILE_SIZE;
  return localY * WORLD_TILE_SIZE + localX;
}

function isClaimAreaSummary(area: ClaimAreaRecord | null): area is ClaimAreaSummary {
  return area !== null && "contributors" in area;
}

function getClaimAreaStatusLabel(status: ClaimAreaStatus): string {
  return status === "active" ? "Active area" : "Finished area";
}

function formatClaimAreaId(publicId: number): string {
  return `#${publicId}`;
}

function isPixelInsideActiveWorldBounds(
  pixel: PixelCoordinate,
  bounds: ActiveWorldBounds,
  activeChunks: WorldOverview["chunks"],
): boolean {
  return activeChunks.length === 0
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
}

function buildAreaSelectionSignature(area: ClaimAreaRecord | null): string {
  if (area === null) {
    return "none";
  }

  const base = [
    area.id,
    area.public_id,
    area.name,
    area.description,
    area.status,
    area.owner.public_id,
    area.owner.display_name,
    area.owner.avatar_url ?? "",
    area.claimed_pixels_count,
    area.painted_pixels_count,
    area.contributor_count,
    Number(area.viewer_can_edit),
    Number(area.viewer_can_paint),
    area.updated_at,
    area.last_activity_at,
    area.bounds
      ? `${area.bounds.min_x}:${area.bounds.min_y}:${area.bounds.max_x}:${area.bounds.max_y}`
      : "",
  ];

  if (isClaimAreaSummary(area)) {
    base.push(
      area.contributors
        .map((contributor) => (
          `${contributor.id}:${contributor.public_id}:${contributor.display_name}:${contributor.avatar_url ?? ""}:${contributor.role}`
        ))
        .join(","),
    );
  }

  return base.join("|");
}

function buildLowTileFallback(tile: WorldTile, src: string): WorldTileFallback | null {
  if (tile.detailScale !== 1) {
    return null;
  }

  const lowTileX = getLowWorldTileCoordinate(tile.tileX);
  const lowTileY = getLowWorldTileCoordinate(tile.tileY);
  const relativeTileX = tile.tileX - lowTileX * WORLD_LOW_TILE_DETAIL_SCALE;
  const relativeTileY =
    WORLD_LOW_TILE_DETAIL_SCALE - 1 - (tile.tileY - lowTileY * WORLD_LOW_TILE_DETAIL_SCALE);
  const scaledSize = tile.size * WORLD_LOW_TILE_DETAIL_SCALE;

  return {
    src,
    left: -relativeTileX * tile.size,
    top: -relativeTileY * tile.size,
    width: scaledSize,
    height: scaledSize,
    soften: true,
  };
}

function areWorldTilesEqual(left: WorldTile, right: WorldTile): boolean {
  return (
    left.key === right.key &&
    left.detailScale === right.detailScale &&
    left.tileX === right.tileX &&
    left.tileY === right.tileY &&
    left.left === right.left &&
    left.top === right.top &&
    left.size === right.size
  );
}

function areWorldTileFallbacksEqual(
  left: WorldTileFallback | null,
  right: WorldTileFallback | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (left === null || right === null) {
    return false;
  }

  return (
    left.src === right.src &&
    left.left === right.left &&
    left.top === right.top &&
    left.width === right.width &&
    left.height === right.height &&
    left.soften === right.soften
  );
}

function areWorldTileRasterPropsEqual(
  previous: WorldTileRasterProps,
  next: WorldTileRasterProps,
): boolean {
  return (
    previous.layer === next.layer &&
    previous.src === next.src &&
    previous.retainedSrc === next.retainedSrc &&
    previous.onDebugSignal === next.onDebugSignal &&
    previous.onTileLoaded === next.onTileLoaded &&
    areWorldTilesEqual(previous.tile, next.tile) &&
    areWorldTileFallbacksEqual(previous.fallback, next.fallback)
  );
}

const WorldTileRaster = memo(function WorldTileRaster({
  layer,
  onDebugSignal,
  onTileLoaded,
  retainedSrc: cachedRetainedSrc = null,
  tile,
  src,
  fallback,
}: WorldTileRasterProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [retainedSrc, setRetainedSrc] = useState<string | null>(null);
  const loadStartAtRef = useRef(typeof performance === "undefined" ? 0 : performance.now());
  const completedSrcRef = useRef<string | null>(null);
  const loadedSrcRef = useRef<string | null>(null);
  const isCurrentSrcLoaded = isLoaded && loadedSrcRef.current === src;
  const previousLoadedSrc = loadedSrcRef.current !== src ? loadedSrcRef.current : null;
  const visibleRetainedSrc = isCurrentSrcLoaded ? null : retainedSrc ?? previousLoadedSrc ?? cachedRetainedSrc;
  const hasParentFallback = fallback !== null;

  const emitTileSignal = useCallback((
    phase: DebugTileSignal["phase"],
    hasVisibleFallback = hasParentFallback,
  ): void => {
    if (!onDebugSignal) {
      return;
    }

    const duration = phase === "src" ? undefined : Math.max(0, performance.now() - loadStartAtRef.current);
    onDebugSignal({
      layer,
      phase,
      tileKey: tile.key,
      detailScale: tile.detailScale,
      hasFallback: hasVisibleFallback,
      src,
      duration,
    });
  }, [hasParentFallback, layer, onDebugSignal, src, tile.detailScale, tile.key]);

  const finalizeTileLoad = useCallback((phase: "load" | "error"): void => {
    if (completedSrcRef.current === src) {
      return;
    }

    completedSrcRef.current = src;
    if (phase === "load") {
      loadedSrcRef.current = src;
      onTileLoaded?.(layer, tile.key, src);
      setRetainedSrc(null);
      setIsLoaded(true);
    } else {
      setIsLoaded(false);
    }
    emitTileSignal(phase);
  }, [emitTileSignal, layer, onTileLoaded, src, tile.key]);

  useLayoutEffect(() => {
    const nextRetainedSrc =
      (loadedSrcRef.current !== null && loadedSrcRef.current !== src ? loadedSrcRef.current : null) ??
      cachedRetainedSrc;
    setRetainedSrc(nextRetainedSrc);
    setIsLoaded(false);
    loadStartAtRef.current = performance.now();
    completedSrcRef.current = null;
    emitTileSignal("src", hasParentFallback && nextRetainedSrc === null);
  }, [cachedRetainedSrc, emitTileSignal, hasParentFallback, src]);

  useLayoutEffect(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
      finalizeTileLoad("load");
    }
  }, [finalizeTileLoad, src]);

  return (
    <span
      className="world-tile"
      style={{
        left: `${tile.left}px`,
        top: `${tile.top}px`,
        width: `${tile.size}px`,
        height: `${tile.size}px`,
      }}
    >
      {fallback ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          alt=""
          aria-hidden="true"
          className={`world-tile-image world-tile-parent-image ${fallback.soften ? "is-softened" : ""} ${isCurrentSrcLoaded || visibleRetainedSrc !== null ? "is-hidden" : ""}`}
          decoding="async"
          draggable={false}
          src={fallback.src}
          style={{
            left: `${fallback.left}px`,
            top: `${fallback.top}px`,
            width: `${fallback.width}px`,
            height: `${fallback.height}px`,
          }}
        />
      ) : null}
      {visibleRetainedSrc ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          alt=""
          aria-hidden="true"
          className="world-tile-image world-tile-retained-image"
          decoding="async"
          draggable={false}
          src={visibleRetainedSrc}
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        aria-hidden="true"
        className={`world-tile-image world-tile-detail-image ${isCurrentSrcLoaded ? "is-loaded" : ""}`}
        decoding="async"
        draggable={false}
        onError={() => {
          finalizeTileLoad("error");
        }}
        onLoad={() => {
          finalizeTileLoad("load");
        }}
        ref={imageRef}
        src={src}
      />
    </span>
  );
}, areWorldTileRasterPropsEqual);

function buildPaintTilePayload(paints: PendingPaint[]): PaintTileInput[] {
  const tiles = new Map<string, PaintTileInput>();

  for (const paint of paints) {
    const { tileX, tileY } = getPixelTileCoordinate(paint);
    const tileKey = getWorldTileKey(tileX, tileY);
    const existingTile = tiles.get(tileKey);
    const tile = existingTile ?? {
      x: tileX,
      y: tileY,
      pixels: {},
    };

    tile.pixels[String(getTileLocalOffset(paint))] = paint.colorId;
    tiles.set(tileKey, tile);
  }

  return [...tiles.values()];
}

function screenPointToWorldPixel(screenX: number, screenY: number, camera: CameraState): PixelCoordinate {
  return {
    x: Math.floor((screenX - camera.x) / camera.zoom),
    y: Math.floor((camera.y - screenY) / camera.zoom),
  };
}

function worldPixelScreenTop(y: number, camera: CameraState): number {
  return camera.y - (y + 1) * camera.zoom;
}

function worldBoundaryScreenY(y: number, camera: CameraState): number {
  return camera.y - y * camera.zoom;
}

function worldRangeScreenTop(maxYExclusive: number, camera: CameraState): number {
  return worldBoundaryScreenY(maxYExclusive, camera);
}

function buildPendingClaimPixelMap(claims: PixelCoordinate[]): Set<string> {
  return new Set(claims.map(getPixelKey));
}

function buildPendingPaintMap(paints: PendingPaint[]): Map<string, PendingPaint> {
  return new Map(paints.map((paint) => [getPixelKey(paint), paint]));
}

function buildPendingPaintCanvasTiles(paints: PendingPaint[]): PendingPaintCanvasTile[] {
  const tiles = new Map<string, PendingPaintCanvasTile>();

  for (const paint of paints) {
    const tileX = Math.floor(paint.x / PENDING_PAINT_CANVAS_TILE_SIZE);
    const tileY = Math.floor(paint.y / PENDING_PAINT_CANVAS_TILE_SIZE);
    const key = `${tileX}:${tileY}`;
    const tile = tiles.get(key) ?? {
      key,
      originX: tileX * PENDING_PAINT_CANVAS_TILE_SIZE,
      originY: tileY * PENDING_PAINT_CANVAS_TILE_SIZE,
      paints: [],
    };

    tile.paints.push(paint);
    tiles.set(key, tile);
  }

  return [...tiles.values()];
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

function createPendingClaimRectangle(
  start: PixelCoordinate,
  end: PixelCoordinate,
): PendingClaimRectangle {
  return {
    minX: Math.min(start.x, end.x),
    maxX: Math.max(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxY: Math.max(start.y, end.y),
  };
}

function getClaimRectangleFetchBounds(
  rectangle: PendingClaimRectangle,
  bounds: ActiveWorldBounds,
): Pick<VisibleAreaBounds, "minX" | "maxX" | "minY" | "maxY"> {
  return {
    minX: Math.max(bounds.minX, rectangle.minX - 1),
    maxX: Math.min(bounds.maxX - 1, rectangle.maxX + 1),
    minY: Math.max(bounds.minY, rectangle.minY - 1),
    maxY: Math.min(bounds.maxY - 1, rectangle.maxY + 1),
  };
}

function getRectangleAnchorPrefetchBounds(
  anchor: PixelCoordinate,
  bounds: ActiveWorldBounds,
): Pick<VisibleAreaBounds, "minX" | "maxX" | "minY" | "maxY"> {
  return {
    minX: Math.max(bounds.minX, anchor.x - RECTANGLE_ANCHOR_PREFETCH_RADIUS),
    maxX: Math.min(bounds.maxX - 1, anchor.x + RECTANGLE_ANCHOR_PREFETCH_RADIUS),
    minY: Math.max(bounds.minY, anchor.y - RECTANGLE_ANCHOR_PREFETCH_RADIUS),
    maxY: Math.min(bounds.maxY - 1, anchor.y + RECTANGLE_ANCHOR_PREFETCH_RADIUS),
  };
}

function getPendingClaimRectanglePixelCount(rectangle: PendingClaimRectangle): number {
  return (rectangle.maxX - rectangle.minX + 1) * (rectangle.maxY - rectangle.minY + 1);
}

function getPendingClaimCount(
  pendingClaimPixels: PixelCoordinate[],
  pendingClaimRectangles: PendingClaimRectangle[],
): number {
  return pendingClaimPixels.length + pendingClaimRectangles.reduce(
    (total, rectangle) => total + getPendingClaimRectanglePixelCount(rectangle),
    0,
  );
}

function getWorldWindowCellCount(bounds: Pick<VisibleAreaBounds, "minX" | "maxX" | "minY" | "maxY">): number {
  return Math.max(0, bounds.maxX - bounds.minX + 1) * Math.max(0, bounds.maxY - bounds.minY + 1);
}

function normalizeOverlayTransform(
  transform: ClaimOverlayTransform,
  bounds: ActiveWorldBounds,
): ClaimOverlayTransform {
  const width = Math.max(1, Math.min(CLAIM_OVERLAY_MAX_SIDE, Math.round(transform.width)));
  const height = Math.max(1, Math.min(CLAIM_OVERLAY_MAX_SIDE, Math.round(transform.height)));
  const minOriginX = bounds.minX;
  const maxOriginX = Math.max(bounds.minX, bounds.maxX - width);
  const minOriginY = bounds.minY + height - 1;
  const maxOriginY = bounds.maxY - 1;

  return {
    originX: Math.max(minOriginX, Math.min(maxOriginX, Math.round(transform.originX))),
    originY: Math.max(minOriginY, Math.min(maxOriginY, Math.round(transform.originY))),
    width,
    height,
  };
}

function snapOverlayTransformToClaims(
  transform: ClaimOverlayTransform,
  claimPixels: Iterable<ClaimContextPixelRecord>,
): ClaimOverlayTransform {
  const overlayLeft = transform.originX;
  const overlayRight = transform.originX + transform.width;
  const overlayTop = transform.originY + 1;
  const overlayBottom = transform.originY - transform.height + 1;
  let bestDeltaX = 0;
  let bestDeltaY = 0;
  let bestAbsDeltaX = CLAIM_OVERLAY_SNAP_DISTANCE + 1;
  let bestAbsDeltaY = CLAIM_OVERLAY_SNAP_DISTANCE + 1;

  for (const pixel of claimPixels) {
    if (pixel.owner_user_id === null && !pixel.is_starter) {
      continue;
    }

    const pixelLeft = pixel.x;
    const pixelRight = pixel.x + 1;
    const pixelBottom = pixel.y;
    const pixelTop = pixel.y + 1;
    const verticalOverlap = pixelTop > overlayBottom && pixelBottom < overlayTop;
    const horizontalOverlap = pixelRight > overlayLeft && pixelLeft < overlayRight;

    if (verticalOverlap) {
      const leftDelta = pixelRight - overlayLeft;
      const rightDelta = pixelLeft - overlayRight;
      const leftAbs = Math.abs(leftDelta);
      const rightAbs = Math.abs(rightDelta);

      if (leftAbs <= CLAIM_OVERLAY_SNAP_DISTANCE && leftAbs < bestAbsDeltaX) {
        bestDeltaX = leftDelta;
        bestAbsDeltaX = leftAbs;
      }

      if (rightAbs <= CLAIM_OVERLAY_SNAP_DISTANCE && rightAbs < bestAbsDeltaX) {
        bestDeltaX = rightDelta;
        bestAbsDeltaX = rightAbs;
      }
    }

    if (horizontalOverlap) {
      const topDelta = pixelBottom - overlayTop;
      const bottomDelta = pixelTop - overlayBottom;
      const topAbs = Math.abs(topDelta);
      const bottomAbs = Math.abs(bottomDelta);

      if (topAbs <= CLAIM_OVERLAY_SNAP_DISTANCE && topAbs < bestAbsDeltaY) {
        bestDeltaY = topDelta;
        bestAbsDeltaY = topAbs;
      }

      if (bottomAbs <= CLAIM_OVERLAY_SNAP_DISTANCE && bottomAbs < bestAbsDeltaY) {
        bestDeltaY = bottomDelta;
        bestAbsDeltaY = bottomAbs;
      }
    }
  }

  if (bestDeltaX === 0 && bestDeltaY === 0) {
    return transform;
  }

  return {
    ...transform,
    originX: transform.originX + bestDeltaX,
    originY: transform.originY + bestDeltaY,
  };
}

function isPixelInsidePendingClaimRectangle(
  pixel: PixelCoordinate,
  rectangle: PendingClaimRectangle,
): boolean {
  return (
    pixel.x >= rectangle.minX &&
    pixel.x <= rectangle.maxX &&
    pixel.y >= rectangle.minY &&
    pixel.y <= rectangle.maxY
  );
}

function hasPendingClaimAtPixel(
  pixel: PixelCoordinate,
  pendingClaimPixelMap: Set<string>,
  pendingClaimRectangles: PendingClaimRectangle[],
): boolean {
  if (pendingClaimPixelMap.has(getPixelKey(pixel))) {
    return true;
  }

  return pendingClaimRectangles.some((rectangle) => isPixelInsidePendingClaimRectangle(pixel, rectangle));
}

function evaluateClaimRectanglePlacement(input: {
  rectangle: PendingClaimRectangle;
  pixelMap: Map<string, ClaimContextPixelRecord>;
  bounds: ActiveWorldBounds;
  activeChunks: WorldOverview["chunks"];
  pendingClaimPixelMap: Set<string>;
  pendingClaimRectangles: PendingClaimRectangle[];
  activeClaimMode: ClaimAreaClaimMode;
  activeClaimTargetAreaId: string | null;
  currentUserId: string;
  startPixel?: PixelCoordinate | null;
  resolvedBounds?: Pick<VisibleAreaBounds, "minX" | "maxX" | "minY" | "maxY"> | null;
}): ClaimRectanglePlacementEvaluation {
  const {
    rectangle,
    pixelMap,
    bounds,
    activeChunks,
    pendingClaimPixelMap,
    pendingClaimRectangles,
    activeClaimMode,
    activeClaimTargetAreaId,
    currentUserId,
    startPixel = null,
    resolvedBounds = null,
  } = input;
  let newPixelCount = 0;
  let overlapsPendingClaim = false;
  let touchesClaimRoute = false;
  const unresolvedNeighborKeys = new Set<string>();
  const iterateForwardX = startPixel === null || startPixel.x === rectangle.minX;
  const iterateForwardY = startPixel === null || startPixel.y === rectangle.minY;
  const startX = iterateForwardX ? rectangle.minX : rectangle.maxX;
  const endX = iterateForwardX ? rectangle.maxX : rectangle.minX;
  const stepX = iterateForwardX ? 1 : -1;
  const startY = iterateForwardY ? rectangle.minY : rectangle.maxY;
  const endY = iterateForwardY ? rectangle.maxY : rectangle.minY;
  const stepY = iterateForwardY ? 1 : -1;

  for (let y = startY; iterateForwardY ? y <= endY : y >= endY; y += stepY) {
    for (let x = startX; iterateForwardX ? x <= endX : x >= endX; x += stepX) {
      const pixel = { x, y };

      if (!isPixelInsideActiveWorldBounds(pixel, bounds, activeChunks)) {
        return {
          blockedReason: "outside-world",
          unresolvedNeighborCount: unresolvedNeighborKeys.size,
          newPixelCount,
          overlapsPendingClaim,
          touchesClaimRoute,
        };
      }

      const pixelKey = getPixelKey(pixel);
      if (pixelMap.has(pixelKey)) {
        return {
          blockedReason: "claimed-territory",
          unresolvedNeighborCount: unresolvedNeighborKeys.size,
          newPixelCount,
          overlapsPendingClaim,
          touchesClaimRoute,
        };
      }

      if (hasPendingClaimAtPixel(pixel, pendingClaimPixelMap, pendingClaimRectangles)) {
        overlapsPendingClaim = true;
        continue;
      }

      newPixelCount += 1;

      if (touchesClaimRoute) {
        continue;
      }

      const neighborPixels = [
        { x: pixel.x - 1, y: pixel.y },
        { x: pixel.x + 1, y: pixel.y },
        { x: pixel.x, y: pixel.y - 1 },
        { x: pixel.x, y: pixel.y + 1 },
      ];

      for (const neighborPixel of neighborPixels) {
        if (isPixelInsidePendingClaimRectangle(neighborPixel, rectangle)) {
          continue;
        }

        if (hasPendingClaimAtPixel(neighborPixel, pendingClaimPixelMap, pendingClaimRectangles)) {
          touchesClaimRoute = true;
          break;
        }

        if (!isPixelInsideActiveWorldBounds(neighborPixel, bounds, activeChunks)) {
          continue;
        }

        const neighborKey = getPixelKey(neighborPixel);
        const neighbor = pixelMap.get(neighborKey);

        if (!neighbor) {
          const isNeighborResolved =
            resolvedBounds !== null &&
            neighborPixel.x >= resolvedBounds.minX &&
            neighborPixel.x <= resolvedBounds.maxX &&
            neighborPixel.y >= resolvedBounds.minY &&
            neighborPixel.y <= resolvedBounds.maxY;

          if (!isNeighborResolved) {
            unresolvedNeighborKeys.add(neighborKey);
          }
          continue;
        }

        if (activeClaimMode === "expand") {
          if (
            neighbor.owner_user_id === currentUserId &&
            neighbor.area_id === activeClaimTargetAreaId
          ) {
            touchesClaimRoute = true;
            break;
          }

          continue;
        }

        if (neighbor.is_starter || neighbor.owner_user_id !== null) {
          touchesClaimRoute = true;
          break;
        }
      }
    }
  }

  return {
    blockedReason: null,
    unresolvedNeighborCount: unresolvedNeighborKeys.size,
    newPixelCount,
    overlapsPendingClaim,
    touchesClaimRoute,
  };
}

function splitPendingClaimRectangleAtPixel(
  rectangle: PendingClaimRectangle,
  pixel: PixelCoordinate,
): PendingClaimRectangle[] {
  if (!isPixelInsidePendingClaimRectangle(pixel, rectangle)) {
    return [rectangle];
  }

  const nextRectangles: PendingClaimRectangle[] = [];

  if (pixel.y > rectangle.minY) {
    nextRectangles.push({
      minX: rectangle.minX,
      maxX: rectangle.maxX,
      minY: rectangle.minY,
      maxY: pixel.y - 1,
    });
  }

  if (pixel.y < rectangle.maxY) {
    nextRectangles.push({
      minX: rectangle.minX,
      maxX: rectangle.maxX,
      minY: pixel.y + 1,
      maxY: rectangle.maxY,
    });
  }

  if (pixel.x > rectangle.minX) {
    nextRectangles.push({
      minX: rectangle.minX,
      maxX: pixel.x - 1,
      minY: pixel.y,
      maxY: pixel.y,
    });
  }

  if (pixel.x < rectangle.maxX) {
    nextRectangles.push({
      minX: pixel.x + 1,
      maxX: rectangle.maxX,
      minY: pixel.y,
      maxY: pixel.y,
    });
  }

  return nextRectangles;
}

function addPendingClaimEdgeInterval(
  target: Map<number, Map<number, number>>,
  line: number,
  start: number,
  end: number,
): void {
  if (start === end) {
    return;
  }

  const events = target.get(line) ?? new Map<number, number>();
  events.set(start, (events.get(start) ?? 0) + 1);
  events.set(end, (events.get(end) ?? 0) - 1);
  target.set(line, events);
}

function appendPendingClaimOutlineCommands(
  target: string[],
  orientation: "horizontal" | "vertical",
  intervalEvents: Map<number, Map<number, number>>,
  camera: CameraState,
): void {
  const lines = [...intervalEvents.entries()].sort((left, right) => left[0] - right[0]);

  for (const [line, events] of lines) {
    const sortedEvents = [...events.entries()].sort((left, right) => left[0] - right[0]);
    let activeCount = 0;
    let segmentStart: number | null = null;

    for (const [position, delta] of sortedEvents) {
      const wasVisible = activeCount % 2 === 1;
      activeCount += delta;
      const isVisible = activeCount % 2 === 1;

      if (!wasVisible && isVisible) {
        segmentStart = position;
        continue;
      }

      if (wasVisible && !isVisible && segmentStart !== null && segmentStart < position) {
        if (orientation === "horizontal") {
          const y = snapSvgLine(worldBoundaryScreenY(line, camera));
          const x1 = snapSvgLine(camera.x + segmentStart * camera.zoom);
          const x2 = snapSvgLine(camera.x + position * camera.zoom);
          target.push(`M${x1} ${y}H${x2}`);
        } else {
          const x = snapSvgLine(camera.x + line * camera.zoom);
          const y1 = snapSvgLine(worldBoundaryScreenY(segmentStart, camera));
          const y2 = snapSvgLine(worldBoundaryScreenY(position, camera));
          target.push(`M${x} ${y1}V${y2}`);
        }

        segmentStart = null;
      }
    }
  }
}

function buildMergedPendingClaimRowIntervals(
  pendingClaimPixels: PixelCoordinate[],
): Array<[number, PendingClaimRowInterval[]]> {
  const rows = new Map<number, PendingClaimRowInterval[]>();
  const addRowInterval = (y: number, start: number, end: number): void => {
    if (start > end) {
      return;
    }

    const row = rows.get(y);
    const interval = { start, end };
    if (row) {
      row.push(interval);
    } else {
      rows.set(y, [interval]);
    }
  };

  for (const pixel of pendingClaimPixels) {
    addRowInterval(pixel.y, pixel.x, pixel.x);
  }

  return [...rows.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([y, intervals]): [number, PendingClaimRowInterval[]] => {
      const sortedIntervals = [...intervals].sort((left, right) => (
        left.start === right.start ? left.end - right.end : left.start - right.start
      ));
      const merged: PendingClaimRowInterval[] = [];

      for (const interval of sortedIntervals) {
        const previous = merged[merged.length - 1];

        if (previous && interval.start <= previous.end + 1) {
          previous.end = Math.max(previous.end, interval.end);
          continue;
        }

        merged.push({ ...interval });
      }

      return [y, merged];
    });
}

function buildPendingClaimPixelRectangles(pendingClaimPixels: PixelCoordinate[]): PendingClaimRectangle[] {
  const rows = buildMergedPendingClaimRowIntervals(pendingClaimPixels);
  const rectangles: PendingClaimRectangle[] = [];
  const activeRectangles = new Map<string, PendingClaimRectangle>();

  for (const [y, intervals] of rows) {
    const activeKeysThisRow = new Set<string>();

    for (const interval of intervals) {
      const key = `${interval.start}:${interval.end}`;
      const activeRectangle = activeRectangles.get(key);

      if (activeRectangle && activeRectangle.maxY + 1 === y) {
        activeRectangle.maxY = y;
      } else {
        if (activeRectangle) {
          rectangles.push(activeRectangle);
        }

        activeRectangles.set(key, {
          minX: interval.start,
          maxX: interval.end,
          minY: y,
          maxY: y,
        });
      }

      activeKeysThisRow.add(key);
    }

    for (const [key, rectangle] of [...activeRectangles.entries()]) {
      if (!activeKeysThisRow.has(key)) {
        rectangles.push(rectangle);
        activeRectangles.delete(key);
      }
    }
  }

  for (const rectangle of activeRectangles.values()) {
    rectangles.push(rectangle);
  }

  return rectangles;
}

function buildPendingClaimSegments(
  pendingClaimPixels: PixelCoordinate[],
  pendingClaimRectangles: PendingClaimRectangle[],
  camera: CameraState,
): PendingClaimSegment[] {
  const segments: PendingClaimSegment[] = [];
  const renderRectangle = (rectangle: PendingClaimRectangle, isBulk: boolean): void => {
    segments.push({
      key: `pending-claim-${isBulk ? "rectangle" : "pixels"}-${rectangle.minX}-${rectangle.minY}-${rectangle.maxX}-${rectangle.maxY}`,
      left: camera.x + rectangle.minX * camera.zoom,
      top: worldRangeScreenTop(rectangle.maxY + 1, camera),
      width: (rectangle.maxX - rectangle.minX + 1) * camera.zoom,
      height: (rectangle.maxY - rectangle.minY + 1) * camera.zoom,
      isBulk,
    });
  };

  for (const rectangle of buildPendingClaimPixelRectangles(pendingClaimPixels)) {
    renderRectangle(rectangle, pendingClaimRectangles.length > 0);
  }

  for (const rectangle of pendingClaimRectangles) {
    renderRectangle(rectangle, true);
  }

  return segments;
}

function buildPendingClaimOutlinePath(
  pendingClaimPixels: PixelCoordinate[],
  pendingClaimRectangles: PendingClaimRectangle[],
  camera: CameraState,
): string | null {
  if (pendingClaimPixels.length === 0 && pendingClaimRectangles.length === 0) {
    return null;
  }

  const horizontalEdges = new Map<number, Map<number, number>>();
  const verticalEdges = new Map<number, Map<number, number>>();
  const pendingClaimPixelRectangles = buildPendingClaimPixelRectangles(pendingClaimPixels);

  const addCellEdges = (minX: number, maxX: number, minY: number, maxY: number): void => {
    const endX = maxX + 1;
    const endY = maxY + 1;
    addPendingClaimEdgeInterval(horizontalEdges, minY, minX, endX);
    addPendingClaimEdgeInterval(horizontalEdges, endY, minX, endX);
    addPendingClaimEdgeInterval(verticalEdges, minX, minY, endY);
    addPendingClaimEdgeInterval(verticalEdges, endX, minY, endY);
  };

  for (const rectangle of pendingClaimPixelRectangles) {
    addCellEdges(rectangle.minX, rectangle.maxX, rectangle.minY, rectangle.maxY);
  }

  for (const rectangle of pendingClaimRectangles) {
    addCellEdges(rectangle.minX, rectangle.maxX, rectangle.minY, rectangle.maxY);
  }

  const commands: string[] = [];
  appendPendingClaimOutlineCommands(commands, "horizontal", horizontalEdges, camera);
  appendPendingClaimOutlineCommands(commands, "vertical", verticalEdges, camera);
  return commands.length === 0 ? null : commands.join("");
}

function snapSvgLine(value: number): number {
  return Math.round(value) + 0.5;
}

function buildClaimOutlinePaths(
  outlineSegments: ClaimOutlineSegment[],
  camera: CameraState,
): ClaimOutlinePath[] {
  const commandsByKey = new Map<string, { status: ClaimOverlayStatus; commands: string[] }>();

  for (const segment of outlineSegments) {
    const key = `${segment.orientation}:${segment.status}`;
    const existing = commandsByKey.get(key) ?? {
      status: segment.status,
      commands: [],
    };

    if (segment.orientation === "horizontal") {
      const y = snapSvgLine(worldBoundaryScreenY(segment.line, camera));
      const x1 = snapSvgLine(camera.x + segment.start * camera.zoom);
      const x2 = snapSvgLine(camera.x + segment.end * camera.zoom);
      existing.commands.push(`M${x1} ${y}H${x2}`);
    } else {
      const x = snapSvgLine(camera.x + segment.line * camera.zoom);
      const y1 = snapSvgLine(worldBoundaryScreenY(segment.start, camera));
      const y2 = snapSvgLine(worldBoundaryScreenY(segment.end, camera));
      existing.commands.push(`M${x} ${y1}V${y2}`);
    }

    commandsByKey.set(key, existing);
  }

  const statusOrder: Record<ClaimOverlayStatus, number> = {
    blocked: 0,
    contributor: 1,
    owner: 2,
    starter: 3,
  };

  return [...commandsByKey.entries()]
    .map(([key, value]) => ({
      key,
      status: value.status,
      d: value.commands.join(""),
    }))
    .sort((left, right) => statusOrder[left.status] - statusOrder[right.status]);
}

function areWorldPixelsEqual(left: WorldPixel[], right: WorldPixel[]): boolean {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftPixel = left[index];
    const rightPixel = right[index];

    if (
      leftPixel.id !== rightPixel.id ||
      leftPixel.x !== rightPixel.x ||
      leftPixel.y !== rightPixel.y ||
      leftPixel.chunk_x !== rightPixel.chunk_x ||
      leftPixel.chunk_y !== rightPixel.chunk_y ||
      leftPixel.color_id !== rightPixel.color_id ||
      leftPixel.owner_user_id !== rightPixel.owner_user_id ||
      leftPixel.owner_public_id !== rightPixel.owner_public_id ||
      leftPixel.owner_display_name !== rightPixel.owner_display_name ||
      leftPixel.area_id !== rightPixel.area_id ||
      leftPixel.is_starter !== rightPixel.is_starter ||
      leftPixel.viewer_relation !== rightPixel.viewer_relation ||
      leftPixel.created_at !== rightPixel.created_at ||
      leftPixel.updated_at !== rightPixel.updated_at
    ) {
      return false;
    }
  }

  return true;
}

function areWorldPixelRecordsEqual(
  left: WorldPixel | null,
  right: WorldPixel | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (left === null || right === null) {
    return false;
  }

  return (
    left.id === right.id &&
    left.x === right.x &&
    left.y === right.y &&
    left.chunk_x === right.chunk_x &&
    left.chunk_y === right.chunk_y &&
    left.color_id === right.color_id &&
    left.owner_user_id === right.owner_user_id &&
    left.owner_public_id === right.owner_public_id &&
    left.owner_display_name === right.owner_display_name &&
    left.area_id === right.area_id &&
    left.is_starter === right.is_starter &&
    left.viewer_relation === right.viewer_relation &&
    left.created_at === right.created_at &&
    left.updated_at === right.updated_at
  );
}

function mergeWorldPixels(currentPixels: WorldPixel[], fetchedPixels: WorldPixel[]): WorldPixel[] {
  if (fetchedPixels.length === 0) {
    return currentPixels;
  }

  const next = [...currentPixels];
  const index = new Map(next.map((pixel, currentIndex) => [getPixelKey(pixel), currentIndex]));
  let changed = false;

  for (const pixel of fetchedPixels) {
    const pixelKey = getPixelKey(pixel);
    const existingIndex = index.get(pixelKey);

    if (existingIndex === undefined) {
      index.set(pixelKey, next.length);
      next.push(pixel);
      changed = true;
      continue;
    }

    if (!areWorldPixelRecordsEqual(next[existingIndex], pixel)) {
      next[existingIndex] = pixel;
      changed = true;
    }
  }

  return changed ? next : currentPixels;
}

function arePendingPaintEntriesEqual(
  left: PendingPaint | null,
  right: PendingPaint | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (left === null || right === null) {
    return false;
  }

  return (
    left.x === right.x &&
    left.y === right.y &&
    left.colorId === right.colorId
  );
}

function arePlacementStatesEqual(
  left: PlacementState,
  right: PlacementState,
): boolean {
  return (
    areWorldPixelRecordsEqual(left.pixelRecord, right.pixelRecord) &&
    left.isInsideWorld === right.isInsideWorld &&
    left.canClaim === right.canClaim &&
    left.canPaint === right.canPaint &&
    left.isPendingClaim === right.isPendingClaim &&
    arePendingPaintEntriesEqual(left.pendingPaint, right.pendingPaint)
  );
}

function areClaimOutlineSegmentsEqual(
  left: ClaimOutlineSegment[],
  right: ClaimOutlineSegment[],
): boolean {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];

    if (
      leftSegment.orientation !== rightSegment.orientation ||
      leftSegment.line !== rightSegment.line ||
      leftSegment.start !== rightSegment.start ||
      leftSegment.end !== rightSegment.end ||
      leftSegment.status !== rightSegment.status
    ) {
      return false;
    }
  }

  return true;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 || value === 0 ? 1 : 2)}%`;
}

function getProjectedHolderState(
  user: AuthUser | null,
  nowMs: number,
): { displayedHolders: number; statusText: string; isUnlimited: boolean } {
  if (user === null) {
    return {
      displayedHolders: 0,
      statusText: "",
      isUnlimited: false,
    };
  }

  if (user.holders_unlimited) {
    return {
      displayedHolders: Number.POSITIVE_INFINITY,
      statusText: `Unlimited Holders - ${user.claim_area_limit} area slot${user.claim_area_limit === 1 ? "" : "s"}`,
      isUnlimited: true,
    };
  }

  if (user.holders >= user.holder_limit) {
    return {
      displayedHolders: user.holders,
      statusText: "Holder storage full",
      isUnlimited: false,
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
      isUnlimited: false,
    };
  }

  const remainderMs = elapsedMs % intervalMs;
  const remainingMs = remainderMs === 0 ? intervalMs : intervalMs - remainderMs;

  return {
    displayedHolders,
    statusText: `Next holder in ${Math.max(0, Math.ceil(remainingMs / 1000))}s`,
    isUnlimited: false,
  };
}

function getCurrentDisplayedHolders(user: AuthUser | null): number {
  return getProjectedHolderState(user, Date.now()).displayedHolders;
}

function useProjectedHolderState(
  user: AuthUser | null,
): { displayedHolders: number; statusText: string; isUnlimited: boolean } {
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

function getProjectedNormalPixelState(
  user: AuthUser | null,
  nowMs: number,
): { displayedPixels: number; statusText: string } {
  if (user === null) {
    return {
      displayedPixels: 0,
      statusText: "",
    };
  }

  if (user.normal_pixels >= user.normal_pixel_limit) {
    return {
      displayedPixels: user.normal_pixels,
      statusText: "Pixel storage full",
    };
  }

  const intervalMs = Math.max(1000, user.normal_pixel_regeneration_interval_seconds * 1000);
  const lastUpdatedMs = new Date(user.normal_pixels_last_updated_at).getTime();
  const elapsedMs = Math.max(0, nowMs - lastUpdatedMs);
  const regenerated = Math.floor(elapsedMs / intervalMs);
  const displayedPixels = Math.min(user.normal_pixel_limit, user.normal_pixels + regenerated);

  if (displayedPixels >= user.normal_pixel_limit) {
    return {
      displayedPixels,
      statusText: "Pixel storage full",
    };
  }

  const remainderMs = elapsedMs % intervalMs;
  const remainingMs = remainderMs === 0 ? intervalMs : intervalMs - remainderMs;

  return {
    displayedPixels,
    statusText: `Next pixel in ${Math.max(0, Math.ceil(remainingMs / 1000))}s`,
  };
}

function getCurrentDisplayedNormalPixels(user: AuthUser | null): number {
  return getProjectedNormalPixelState(user, Date.now()).displayedPixels;
}

function useProjectedNormalPixelState(
  user: AuthUser | null,
): { displayedPixels: number; statusText: string } {
  const [projection, setProjection] = useState(() => getProjectedNormalPixelState(user, Date.now()));

  useEffect(() => {
    const syncProjection = (): void => {
      markPerfEvent("normal pixel tick", user ? `#${user.public_id}` : "anonymous");
      const nextProjection = getProjectedNormalPixelState(user, Date.now());
      setProjection((current) => (
        current.displayedPixels === nextProjection.displayedPixels &&
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

const PendingPaintTileCanvas = memo(function PendingPaintTileCanvas({
  camera,
  tile,
}: {
  camera: CameraState;
  tile: PendingPaintCanvasTile;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const devicePixelRatio = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const cellSize = Math.max(
    1,
    Math.min(PENDING_PAINT_CANVAS_MAX_CELL_SIZE, Math.ceil(camera.zoom * devicePixelRatio)),
  );
  const canvasSize = PENDING_PAINT_CANVAS_TILE_SIZE * cellSize;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return;
    }

    if (canvas.width !== canvasSize) {
      canvas.width = canvasSize;
    }

    if (canvas.height !== canvasSize) {
      canvas.height = canvasSize;
    }

    const context = canvas.getContext("2d");

    if (context === null) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvasSize, canvasSize);
    context.imageSmoothingEnabled = false;

    for (const paint of tile.paints) {
      const left = (paint.x - tile.originX) * cellSize;
      const top = (tile.originY + PENDING_PAINT_CANVAS_TILE_SIZE - 1 - paint.y) * cellSize;
      const color = PIXEL_PALETTE_COLOR_BY_ID.get(paint.colorId) ?? "#ffffff";
      const isTransparent = paint.colorId === TRANSPARENT_COLOR_ID;

      if (isTransparent) {
        context.fillStyle = "rgba(255, 255, 255, 0.9)";
        context.fillRect(left, top, cellSize, cellSize);

        const checkerSize = Math.max(2, Math.min(8, Math.floor(cellSize / 2)));
        context.fillStyle = "rgba(0, 0, 0, 0.1)";

        for (let y = 0; y < cellSize; y += checkerSize) {
          for (let x = 0; x < cellSize; x += checkerSize) {
            if (((x / checkerSize) + (y / checkerSize)) % 2 === 0) {
              context.fillRect(left + x, top + y, checkerSize, checkerSize);
            }
          }
        }
      } else {
        context.fillStyle = color;
        context.fillRect(left, top, cellSize, cellSize);
      }

      if (cellSize >= 2) {
        const borderSize = Math.max(1, Math.round(devicePixelRatio));
        const borderOffset = borderSize / 2;
        context.strokeStyle = "rgba(255, 255, 255, 0.78)";
        context.lineWidth = borderSize;
        context.strokeRect(
          left + borderOffset,
          top + borderOffset,
          Math.max(0, cellSize - borderSize),
          Math.max(0, cellSize - borderSize),
        );
      }

      if (cellSize >= 4) {
        const insetSize = Math.max(1, Math.round(devicePixelRatio));
        const insetOffset = insetSize + insetSize / 2;
        context.strokeStyle = "rgba(6, 12, 18, 0.38)";
        context.lineWidth = insetSize;
        context.strokeRect(
          left + insetOffset,
          top + insetOffset,
          Math.max(0, cellSize - insetSize * 3),
          Math.max(0, cellSize - insetSize * 3),
        );
      }
    }
  }, [canvasSize, cellSize, devicePixelRatio, tile]);

  return (
    <canvas
      aria-hidden="true"
      className="world-pending-paint-canvas"
      ref={canvasRef}
      style={{
        left: `${camera.x + tile.originX * camera.zoom}px`,
        top: `${worldRangeScreenTop(tile.originY + PENDING_PAINT_CANVAS_TILE_SIZE, camera)}px`,
        width: `${PENDING_PAINT_CANVAS_TILE_SIZE * camera.zoom}px`,
        height: `${PENDING_PAINT_CANVAS_TILE_SIZE * camera.zoom}px`,
      }}
    />
  );
});

function ClaimOverlaySurface({
  camera,
  editable,
  imageName,
  onHandlePointerDown,
  onMovePointerDown,
  onPointerCancel,
  onPointerMove,
  onPointerUp,
  previewDataUrl,
  templatePixelCount,
  transform,
}: {
  camera: CameraState;
  editable: boolean;
  imageName: string;
  onHandlePointerDown?: (event: ReactPointerEvent<HTMLButtonElement>, handle: OverlayResizeHandle) => void;
  onMovePointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  previewDataUrl: string | null;
  templatePixelCount: number;
  transform: ClaimOverlayTransform;
}) {
  if (previewDataUrl === null) {
    return null;
  }

  const left = camera.x + transform.originX * camera.zoom;
  const top = worldPixelScreenTop(transform.originY, camera);
  const width = Math.max(1, transform.width * camera.zoom);
  const height = Math.max(1, transform.height * camera.zoom);
  const handles: Array<{ key: OverlayResizeHandle; label: string }> = [
    { key: "north-west", label: "Resize northwest" },
    { key: "north", label: "Resize north" },
    { key: "north-east", label: "Resize northeast" },
    { key: "east", label: "Resize east" },
    { key: "south-east", label: "Resize southeast" },
    { key: "south", label: "Resize south" },
    { key: "south-west", label: "Resize southwest" },
    { key: "west", label: "Resize west" },
  ];

  return (
    <div
      aria-label={`${imageName} overlay, ${templatePixelCount} pixels`}
      className={`claim-template-overlay ${editable ? "is-editable" : "is-saved"}`}
      onPointerDown={editable ? onMovePointerDown : undefined}
      onPointerCancel={editable ? onPointerCancel : undefined}
      onPointerMove={editable ? onPointerMove : undefined}
      onPointerUp={editable ? onPointerUp : undefined}
      role={editable ? "group" : "presentation"}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Overlay previews are generated client-side data URLs. */}
      <img
        alt=""
        className="claim-template-overlay-image"
        draggable={false}
        src={previewDataUrl}
      />
      {editable ? (
        <>
          <div className="claim-template-overlay-border" aria-hidden="true" />
          {handles.map((handle) => (
            <button
              aria-label={handle.label}
              className={`claim-template-resize-handle is-${handle.key}`}
              key={handle.key}
              onPointerDown={(event) => onHandlePointerDown?.(event, handle.key)}
              title={handle.label}
              type="button"
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

const WorldViewportCanvas = memo(function WorldViewportCanvas({
  activeChunkBoundaryRects,
  activeChunkViewportRects,
  bulkPendingClaimOverlay,
  camera,
  claimOutlinePaths,
  crosshairHorizontalRef,
  crosshairVerticalRef,
  getVisualTileFallback,
  getVisualTileSrc,
  gridLines,
  onTileDebugSignal,
  onTileLoaded,
  outsideArtPatternImages,
  pendingPaintTiles,
  pendingClaimOutlinePath,
  renderedPendingClaims,
  renderedWorldTiles,
  retainedVisualTileSrcs,
  hoverPixelOverlay,
  paintCursorOverlay,
  selectedPixelOverlay,
  viewportSize,
  worldOutsideMaskId,
  worldOutsidePatternId,
}: WorldViewportCanvasProps) {
  return (
    <>
      <div className="world-backdrop-glow" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="world-pixel-grid"
      >
        {gridLines.vertical.map((line) => (
          <span
            className={`world-grid-line world-grid-line-vertical ${line.major ? "is-major" : ""} ${line.origin ? "is-origin" : ""}`}
            key={line.key}
            style={{ left: `${line.position}px` }}
          />
        ))}
        {gridLines.horizontal.map((line) => (
          <span
            className={`world-grid-line world-grid-line-horizontal ${line.major ? "is-major" : ""} ${line.origin ? "is-origin" : ""}`}
            key={line.key}
            style={{ top: `${line.position}px` }}
          />
        ))}
      </div>
      <svg
        aria-hidden="true"
        className="world-outside-pattern"
        height={viewportSize.height}
        shapeRendering="crispEdges"
        width={viewportSize.width}
      >
        <defs>
          <pattern
            height={OUTSIDE_ART_PATTERN_SIZE}
            id={worldOutsidePatternId}
            patternUnits="userSpaceOnUse"
            width={OUTSIDE_ART_PATTERN_SIZE}
          >
            <rect
              className="world-outside-pattern-base"
              height={OUTSIDE_ART_PATTERN_SIZE}
              width={OUTSIDE_ART_PATTERN_SIZE}
            />
            <path
              d="M-22 56 L 70 -36 M 18 224 L 152 90 M 140 174 L 248 66"
              fill="none"
              opacity="0.6"
              stroke="var(--world-outside-hatch)"
              strokeWidth="10"
            />
            <path
              d="M-10 144 L 92 42 M 112 244 L 244 112"
              fill="none"
              opacity="0.45"
              stroke="var(--world-outside-hatch)"
              strokeWidth="6"
            />
            <rect fill="var(--world-outside-hatch)" height="4" opacity="0.6" width="4" x="108" y="30" />
            <rect fill="var(--world-outside-hatch)" height="4" opacity="0.45" width="4" x="192" y="100" />
            <rect fill="var(--world-outside-hatch)" height="4" opacity="0.45" width="4" x="26" y="190" />
            {outsideArtPatternImages}
          </pattern>
          <mask id={worldOutsideMaskId}>
            <rect fill="white" height={viewportSize.height} width={viewportSize.width} x="0" y="0" />
            {activeChunkViewportRects.map((rect) => (
              <rect
                fill="black"
                height={rect.height}
                key={rect.key}
                width={rect.width}
                x={rect.left}
                y={rect.top}
              />
            ))}
          </mask>
        </defs>
        <rect
          fill="var(--world-outside-shade)"
          height={viewportSize.height}
          mask={`url(#${worldOutsideMaskId})`}
          width={viewportSize.width}
          x="0"
          y="0"
        />
        <rect
          fill={`url(#${worldOutsidePatternId})`}
          height={viewportSize.height}
          mask={`url(#${worldOutsideMaskId})`}
          width={viewportSize.width}
          x="0"
          y="0"
        />
      </svg>
      {/* Keep the visual raster mounted in build mode; semantic tools ride on top of it. */}
      <div className="world-visual-layer" aria-hidden="true">
        {renderedWorldTiles.map((tile) => (
          <WorldTileRaster
            fallback={getVisualTileFallback(tile)}
            key={`visual-${tile.key}`}
            layer="visual"
            onDebugSignal={onTileDebugSignal}
            onTileLoaded={onTileLoaded}
            retainedSrc={retainedVisualTileSrcs.get(tile.key) ?? null}
            src={getVisualTileSrc(tile)}
            tile={tile}
          />
        ))}
      </div>
      <div className="world-claim-layer" aria-hidden="true">
        {claimOutlinePaths.length > 0 ? (
          <svg
            aria-hidden="true"
            className="world-claim-outline-layer"
            height={viewportSize.height}
            shapeRendering="crispEdges"
            width={viewportSize.width}
          >
            {claimOutlinePaths.map((path) => (
              <path
                d={path.d}
                fill="none"
                key={path.key}
                stroke={CLAIM_OUTLINE_COLORS[path.status]}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        ) : null}
        {pendingClaimOutlinePath ? (
          <svg
            aria-hidden="true"
            className="world-pending-claim-outline-layer"
            height={viewportSize.height}
            shapeRendering="crispEdges"
            width={viewportSize.width}
          >
            <path
              className="world-pending-claim-outline-path"
              d={pendingClaimOutlinePath}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
        {renderedPendingClaims.map((pixel) => (
          <span
            className={`world-pending-claim ${bulkPendingClaimOverlay || pixel.isBulk ? "is-bulk" : ""}`}
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
        {pendingPaintTiles.map((tile) => (
          <PendingPaintTileCanvas camera={camera} key={tile.key} tile={tile} />
        ))}
      </div>
      {hoverPixelOverlay ? (
        <div
          aria-hidden="true"
          className="world-hovered-pixel"
          key={hoverPixelOverlay.key}
          style={{
            left: `${hoverPixelOverlay.left}px`,
            top: `${hoverPixelOverlay.top}px`,
            width: `${hoverPixelOverlay.size}px`,
            height: `${hoverPixelOverlay.size}px`,
          }}
        />
      ) : null}
      {paintCursorOverlay ? (
        <div
          aria-hidden="true"
          className={`world-paint-cursor ${paintCursorOverlay.isTransparent ? "is-transparent" : ""}`}
          key={`paint-cursor-${paintCursorOverlay.key}-${paintCursorOverlay.color}`}
          style={{
            left: `${paintCursorOverlay.left}px`,
            top: `${paintCursorOverlay.top}px`,
            width: `${paintCursorOverlay.size}px`,
            height: `${paintCursorOverlay.size}px`,
            ...(paintCursorOverlay.isTransparent ? {} : { backgroundColor: paintCursorOverlay.color }),
          }}
        />
      ) : null}
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
      <svg
        aria-hidden="true"
        className="world-limit-outline"
        height={viewportSize.height}
        shapeRendering="crispEdges"
        width={viewportSize.width}
      >
        {activeChunkBoundaryRects.map((rect) => (
          <rect
            fill="currentColor"
            height={rect.height}
            key={rect.key}
            width={rect.width}
            x={rect.left}
            y={rect.top}
          />
        ))}
      </svg>

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
    </>
  );
});

function HolderPanelSummary({
  pendingClaims,
  user,
}: {
  pendingClaims: number;
  user: AuthUser | null;
}) {
  const projection = useProjectedHolderState(user);
  const batchFillRatio = Math.min(1, pendingClaims / CLAIM_BATCH_PIXEL_LIMIT);

  if (user === null) {
    return (
      <div className="pixel-resource-summary">
        <span>Holder left</span>
        <strong>--</strong>
        <small>Login required for Holder balance</small>
      </div>
    );
  }

  if (projection.isUnlimited) {
    return (
      <div className="pixel-resource-summary">
        <span>Holder left</span>
        <strong>Unlimited</strong>
        <small>
          {pendingClaims} pending claim{pendingClaims === 1 ? "" : "s"} - {user.claim_area_limit} total area slot
          {user.claim_area_limit === 1 ? "" : "s"}
        </small>
        <div className="claim-batch-progress">
          <div className="claim-batch-progress-header">
            <span>Batch size</span>
            <strong>{formatCount(pendingClaims)} / {formatCount(CLAIM_BATCH_PIXEL_LIMIT)}</strong>
          </div>
          <div className="claim-batch-progress-bar" aria-hidden="true">
            <span style={{ width: `${batchFillRatio * 100}%` }} />
          </div>
        </div>
      </div>
    );
  }

  const remainingHolders = Math.max(0, projection.displayedHolders - pendingClaims);

  return (
    <div className="pixel-resource-summary">
      <span>Holder left</span>
      <strong>{remainingHolders}</strong>
      <small>
        {pendingClaims} pending claim{pendingClaims === 1 ? "" : "s"} from{" "}
        {projection.displayedHolders} ready Holders
      </small>
      <div className="claim-batch-progress">
        <div className="claim-batch-progress-header">
          <span>Batch size</span>
          <strong>{formatCount(pendingClaims)} / {formatCount(CLAIM_BATCH_PIXEL_LIMIT)}</strong>
        </div>
        <div className="claim-batch-progress-bar" aria-hidden="true">
          <span style={{ width: `${batchFillRatio * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

function NormalPixelPanelSummary({
  pendingPaints,
  user,
}: {
  pendingPaints: number;
  user: AuthUser | null;
}) {
  const projection = useProjectedNormalPixelState(user);

  if (user === null) {
    return (
      <div className="pixel-resource-summary">
        <span>Pixels left</span>
        <strong>--</strong>
        <small>Login required for Color Pixel balance</small>
      </div>
    );
  }

  const remainingPixels = Math.max(0, projection.displayedPixels - pendingPaints);

  return (
    <div className="pixel-resource-summary">
      <span>Pixels left</span>
      <strong>{remainingPixels}</strong>
      <small>
        {pendingPaints} pending pixel{pendingPaints === 1 ? "" : "s"} from{" "}
        {projection.displayedPixels} ready Color Pixels
      </small>
    </div>
  );
}

function HolderAccountCount({ user }: { user: AuthUser }) {
  const holderProjection = useProjectedHolderState(user);
  const normalPixelProjection = useProjectedNormalPixelState(user);
  const holderLabel = holderProjection.isUnlimited
    ? "Unlimited"
    : `${holderProjection.displayedHolders} / ${user.holder_limit}`;

  return (
    <>
      Holders: {holderLabel} - Color Pixels: {normalPixelProjection.displayedPixels} / {user.normal_pixel_limit}
    </>
  );
}

function NormalPixelAccountCount({ user }: { user: AuthUser }) {
  const projection = useProjectedNormalPixelState(user);

  return (
    <strong>
      {projection.displayedPixels} / {user.normal_pixel_limit}
    </strong>
  );
}

function NormalPixelAccountStatus({ user }: { user: AuthUser }) {
  const projection = useProjectedNormalPixelState(user);

  return <small>{projection.statusText}</small>;
}

function PerfDebugOverlay({ getSnapshot }: PerfDebugOverlayProps) {
  const [enabled, setEnabled] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [recording, setRecording] = useState(true);
  const [events, setEvents] = useState<PerfEventRecord[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<DebugWorldSnapshot | null>(null);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const eventIdRef = useRef(0);
  const recordingRef = useRef(true);
  const visibleEventsRef = useRef<PerfEventRecord[]>([]);
  const flushEventsFrameRef = useRef<number | null>(null);
  const recentMarksRef = useRef<PerfEventRecord[]>([]);
  const throttledMarkAtRef = useRef<Map<string, number>>(new Map());
  const previousSnapshotRef = useRef<DebugWorldSnapshot | null>(null);
  const lastSnapshotSignatureRef = useRef("");
  const warningCooldownRef = useRef<Map<string, number>>(new Map());
  const maxGapRef = useRef(0);
  const gapCountRef = useRef(0);
  const longTaskCountRef = useRef(0);
  const layoutShiftCountRef = useRef(0);
  const lastZoomInteractionAtRef = useRef(0);
  const networkCountRef = useRef(0);
  const tileCountRef = useRef(0);
  const warningCountRef = useRef(0);
  const snapshotCountRef = useRef(0);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  const clampPanelPosition = useCallback((left: number, top: number): { left: number; top: number } => {
    if (typeof window === "undefined") {
      return { left, top };
    }

    const panelWidth = panelRef.current?.offsetWidth ?? 380;
    const panelHeight = panelRef.current?.offsetHeight ?? (isMinimized ? 58 : 520);
    const padding = 12;

    return {
      left: Math.min(
        Math.max(padding, left),
        Math.max(padding, window.innerWidth - panelWidth - padding),
      ),
      top: Math.min(
        Math.max(padding, top),
        Math.max(padding, window.innerHeight - panelHeight - padding),
      ),
    };
  }, [isMinimized]);

  const handlePanelDragStart = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || panelRef.current === null) {
      return;
    }

    const rect = panelRef.current.getBoundingClientRect();
    dragStateRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setPanelPosition({
      left: rect.left,
      top: rect.top,
    });
    setIsDraggingPanel(true);
    event.preventDefault();
  }, []);

  useEffect(() => {
    if (!isDraggingPanel) {
      return;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      const dragState = dragStateRef.current;

      if (dragState === null) {
        return;
      }

      setPanelPosition(clampPanelPosition(
        event.clientX - dragState.offsetX,
        event.clientY - dragState.offsetY,
      ));
    };

    const handlePointerUp = (): void => {
      dragStateRef.current = null;
      setIsDraggingPanel(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [clampPanelPosition, isDraggingPanel]);

  useEffect(() => {
    if (panelPosition === null) {
      return;
    }

    const handleResize = (): void => {
      setPanelPosition((current) => (
        current === null ? current : clampPanelPosition(current.left, current.top)
      ));
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [clampPanelPosition, panelPosition]);

  const flushVisibleEvents = useCallback((): void => {
    flushEventsFrameRef.current = null;
    setEvents(visibleEventsRef.current.slice(0, DEBUG_EVENT_PANEL_LIMIT));
  }, []);

  const scheduleVisibleEventFlush = useCallback((): void => {
    if (typeof window === "undefined" || flushEventsFrameRef.current !== null) {
      return;
    }

    flushEventsFrameRef.current = window.requestAnimationFrame(flushVisibleEvents);
  }, [flushVisibleEvents]);

  const resetOverlayState = useCallback((): void => {
    eventIdRef.current = 0;
    if (flushEventsFrameRef.current !== null) {
      window.cancelAnimationFrame(flushEventsFrameRef.current);
      flushEventsFrameRef.current = null;
    }
    visibleEventsRef.current = [];
    recentMarksRef.current = [];
    throttledMarkAtRef.current.clear();
    previousSnapshotRef.current = null;
    lastSnapshotSignatureRef.current = "";
    warningCooldownRef.current.clear();
    maxGapRef.current = 0;
    gapCountRef.current = 0;
    longTaskCountRef.current = 0;
    layoutShiftCountRef.current = 0;
    networkCountRef.current = 0;
    tileCountRef.current = 0;
    warningCountRef.current = 0;
    snapshotCountRef.current = 0;
    setEvents([]);
    setLatestSnapshot(null);
  }, []);

  const clearOverlayLog = useCallback((): void => {
    const perfWindow = getPerfDebugWindow();

    if (perfWindow !== null) {
      perfWindow.__pixelPerfLog = [];
    }

    resetOverlayState();
  }, [resetOverlayState]);

  const pushEvent = useCallback((event: Omit<PerfEventRecord, "id">): void => {
    if (!recordingRef.current) {
      return;
    }

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

    if (nextEvent.kind === "network") {
      networkCountRef.current += 1;
    }

    if (nextEvent.kind === "tile") {
      tileCountRef.current += 1;
    }

    if (nextEvent.kind === "warning") {
      warningCountRef.current += 1;
    }

    if (nextEvent.kind === "snapshot") {
      snapshotCountRef.current += 1;
      return;
    }

    visibleEventsRef.current = [nextEvent, ...visibleEventsRef.current].slice(0, DEBUG_EVENT_PANEL_LIMIT);
    scheduleVisibleEventFlush();
  }, [scheduleVisibleEventFlush]);

  const formatSnapshotDetail = useCallback((snapshot: DebugWorldSnapshot): string => {
    const layers = snapshot.visual.active > 0
      ? [
          `visual ${snapshot.visual.loaded}/${snapshot.visual.active} loaded (${snapshot.visual.loading} loading, ${snapshot.visual.fallbackVisible} fallback)`,
        ]
      : [
          `paint ${snapshot.paint.loaded}/${snapshot.paint.active} loaded (${snapshot.paint.loading} loading, ${snapshot.paint.fallbackVisible} fallback)`,
          `claims ${snapshot.claims.loaded}/${snapshot.claims.active} loaded (${snapshot.claims.loading} loading, ${snapshot.claims.fallbackVisible} fallback)`,
        ];

    const detailParts = [
      `${formatGrowthStageLabel(snapshot.growth)}, filled ${formatCount(snapshot.growth.painted_pixels)} / ${formatCount(snapshot.growth.capacity_pixels)} px (${formatPercent(snapshot.growth.filled_percent)})`,
      `cam ${Math.round(snapshot.cameraX)}:${Math.round(snapshot.cameraY)} @ ${snapshot.zoom.toFixed(2)}x`,
      `layer ${formatDebugLayerLabel(snapshot)}`,
      ...layers,
      `pixels ${snapshot.visiblePixels}, outlines ${snapshot.claimOutlineSegments}, pending ${snapshot.pendingClaims}/${snapshot.pendingPaints}`,
    ];

    if (snapshot.rectanglePlacementBusy) {
      detailParts.push("rectangle check running");
    }

    return detailParts.join(" | ");
  }, []);

  const pushWarning = useCallback((key: string, label: string, detail: string): void => {
    const now = performance.now();
    const lastWarningAt = warningCooldownRef.current.get(key) ?? Number.NEGATIVE_INFINITY;

    if (now - lastWarningAt < DEBUG_WARNING_COOLDOWN_MS) {
      return;
    }

    warningCooldownRef.current.set(key, now);
    pushEvent({
      kind: "warning",
      label,
      detail,
      at: now,
    });
  }, [pushEvent]);

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
    perfWindow.__pixelPerfClear = clearOverlayLog;
    perfWindow.__pixelDebugDump = perfWindow.__pixelPerfDump;
    perfWindow.__pixelDebugClear = clearOverlayLog;
    perfWindow.__pixelDebugStart = () => {
      setRecording(true);
    };
    perfWindow.__pixelDebugStop = () => {
      setRecording(false);
    };
  }, [clearOverlayLog, enabled]);

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
    return () => {
      if (flushEventsFrameRef.current !== null) {
        window.cancelAnimationFrame(flushEventsFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handlePerfMark = (event: Event): void => {
      if (!(event instanceof CustomEvent) || !isPerfMarkDetail(event.detail)) {
        return;
      }

      if (event.detail.label === "wheel zoom") {
        lastZoomInteractionAtRef.current = event.detail.at;
      }

      const throttleMs = getPerfMarkThrottleMs(event.detail.label);
      if (throttleMs > 0) {
        const lastAt = throttledMarkAtRef.current.get(event.detail.label) ?? Number.NEGATIVE_INFINITY;

        if (event.detail.at - lastAt < throttleMs) {
          return;
        }

        throttledMarkAtRef.current.set(event.detail.label, event.detail.at);
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
    if (!enabled) {
      return;
    }

    const handleDebugEvent = (event: Event): void => {
      if (!(event instanceof CustomEvent) || !isDebugEventDetail(event.detail)) {
        return;
      }

      pushEvent({
        kind: event.detail.kind,
        label: event.detail.label,
        detail: event.detail.detail ?? "",
        at: event.detail.at,
        duration: event.detail.duration,
      });
    };

    window.addEventListener(DEBUG_EVENT_NAME, handleDebugEvent);

    return () => {
      window.removeEventListener(DEBUG_EVENT_NAME, handleDebugEvent);
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
          const recentMarks = recentMarksRef.current
            .filter((mark) => Math.abs(mark.at - entry.startTime) <= 1200)
            .slice(0, 4)
            .map((mark) => `${mark.label}${mark.detail ? ` (${mark.detail})` : ""}`)
            .join(" -> ");
          pushEvent({
            kind: "longtask",
            label: `Long task ${entry.duration.toFixed(1)}ms`,
            detail: recentMarks ? `${entry.name || "Main thread task"} | near ${recentMarks}` : entry.name || "Main thread task",
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

          if (
            layoutEntry.hadRecentInput ||
            !layoutEntry.value ||
            layoutEntry.value < DEBUG_LAYOUT_SHIFT_MIN_VALUE
          ) {
            continue;
          }

          if (
            lastZoomInteractionAtRef.current > 0 &&
            layoutEntry.startTime - lastZoomInteractionAtRef.current <
              DEBUG_LAYOUT_SHIFT_SUPPRESSION_AFTER_ZOOM_MS
          ) {
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

  useEffect(() => {
    if (!enabled || !getSnapshot) {
      return;
    }

    const sampleSnapshot = (): void => {
      if (!recordingRef.current) {
        return;
      }

      const snapshot = getSnapshot();

      if (snapshot === null) {
        return;
      }

      const signature = JSON.stringify(snapshot);
      const signatureChanged = signature !== lastSnapshotSignatureRef.current;

      if (signatureChanged) {
        lastSnapshotSignatureRef.current = signature;
        setLatestSnapshot(snapshot);
      }

      const now = performance.now();
      const formattedSnapshot = formatSnapshotDetail(snapshot);

      if (signatureChanged) {
        pushEvent({
          kind: "snapshot",
          label: "World snapshot",
          detail: formattedSnapshot,
          at: now,
        });
      }

      const previousSnapshot = previousSnapshotRef.current;

      if (previousSnapshot !== null) {
        if (
          previousSnapshot.visual.loaded > 0 &&
          snapshot.visual.active > 0 &&
          snapshot.visual.loaded === 0
        ) {
          pushWarning(
            "visual-drop",
            "Visual layer dropped to 0 loaded tiles",
            formattedSnapshot,
          );
        }

        if (
          previousSnapshot.paint.loaded > 0 &&
          snapshot.paint.active > 0 &&
          snapshot.paint.loaded === 0
        ) {
          pushWarning(
            "paint-drop",
            "Paint layer dropped to 0 loaded tiles",
            formattedSnapshot,
          );
        }

        if (
          previousSnapshot.claims.loaded > 0 &&
          snapshot.claims.active > 0 &&
          snapshot.claims.loaded === 0
        ) {
          pushWarning(
            "claim-drop",
            "Claim layer dropped to 0 loaded tiles",
            formattedSnapshot,
          );
        }

        if (
          previousSnapshot.visiblePixels > 0 &&
          snapshot.visiblePixels === 0 &&
          snapshot.renderedTiles > 0
        ) {
          pushWarning(
            "pixel-drop",
            "Visible pixel window dropped to 0 records",
            formattedSnapshot,
          );
        }
      }

      previousSnapshotRef.current = snapshot;
    };

    sampleSnapshot();
    const snapshotInterval = window.setInterval(sampleSnapshot, DEBUG_SNAPSHOT_INTERVAL_MS);

    return () => {
      window.clearInterval(snapshotInterval);
    };
  }, [enabled, formatSnapshotDetail, getSnapshot, pushEvent, pushWarning]);

  if (!enabled) {
    return null;
  }

  return (
    <aside
      className={`perf-debug-panel ${isDraggingPanel ? "is-dragging" : ""} ${isMinimized ? "is-minimized" : ""}`}
      ref={panelRef}
      style={panelPosition ? {
        left: `${panelPosition.left}px`,
        top: `${panelPosition.top}px`,
        bottom: "auto",
      } : undefined}
    >
      <div
        className="perf-debug-header"
        onPointerDown={handlePanelDragStart}
      >
        <div>
          <strong>Debug probe</strong>
          <span>?debug=1</span>
        </div>
        <button
          className="perf-debug-button"
          onClick={() => setIsMinimized((current) => !current)}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          {isMinimized ? "Open" : "Minimize"}
        </button>
      </div>
      {isMinimized ? null : (
        <>
      <div className="perf-debug-controls">
        <button
          className={`perf-debug-button ${recording ? "is-active" : ""}`}
          onClick={() => setRecording((current) => !current)}
          type="button"
        >
          {recording ? "Pause" : "Start"}
        </button>
        <button
          className="perf-debug-button"
          onClick={clearOverlayLog}
          type="button"
        >
          Clear
        </button>
      </div>
      <div className="perf-debug-stats">
        <span>{recording ? "REC" : "PAUSED"}</span>
        {latestSnapshot ? <span>Stage: {latestSnapshot.growth.stage}</span> : null}
        {latestSnapshot ? <span>Zoom: {latestSnapshot.zoom.toFixed(2)}x</span> : null}
        {latestSnapshot ? <span>Layer: {formatDebugLayerLabel(latestSnapshot)}</span> : null}
        <span>Gaps: {gapCountRef.current}</span>
        <span>Max: {formatPerfTime(maxGapRef.current)}</span>
        <span>Long: {longTaskCountRef.current}</span>
        <span>CLS: {layoutShiftCountRef.current}</span>
        <span>Net: {networkCountRef.current}</span>
        <span>Tile: {tileCountRef.current}</span>
        <span>Warn: {warningCountRef.current}</span>
        <span>Snap: {snapshotCountRef.current}</span>
      </div>
      <p className="perf-debug-command">
        Console: copy(window.__pixelDebugDump()) | start: window.__pixelDebugStart() | stop: window.__pixelDebugStop()
      </p>
      {latestSnapshot ? (
        <div className="perf-debug-snapshot">
          <strong>Latest snapshot</strong>
          <span>
            Cam {Math.round(latestSnapshot.cameraX)} : {Math.round(latestSnapshot.cameraY)} @ {latestSnapshot.zoom.toFixed(2)}x
          </span>
          <span>
            Layer {formatDebugLayerLabel(latestSnapshot)} | semantic ready from {GRID_THRESHOLD.toFixed(2)}x while build panel is open
          </span>
          <span>
            {formatGrowthStageLabel(latestSnapshot.growth)} | chunks {latestSnapshot.growth.current_chunks} {"->"} {latestSnapshot.growth.next_stage_chunks}
          </span>
          <span>
            Filled {formatCount(latestSnapshot.growth.painted_pixels)} / {formatCount(latestSnapshot.growth.capacity_pixels)} px ({formatPercent(latestSnapshot.growth.filled_percent)}) | expands at {formatPercent(latestSnapshot.growth.expansion_threshold_percent)}
          </span>
          {latestSnapshot.visual.active > 0 ? (
            <span>
              Visual {latestSnapshot.visual.loaded}/{latestSnapshot.visual.active} loaded, {latestSnapshot.visual.loading} loading, {latestSnapshot.visual.fallbackVisible} fallback
            </span>
          ) : (
            <>
              <span>
                Paint {latestSnapshot.paint.loaded}/{latestSnapshot.paint.active} loaded, {latestSnapshot.paint.loading} loading, {latestSnapshot.paint.fallbackVisible} fallback
              </span>
              <span>
                Claims {latestSnapshot.claims.loaded}/{latestSnapshot.claims.active} loaded, {latestSnapshot.claims.loading} loading, {latestSnapshot.claims.fallbackVisible} fallback
              </span>
            </>
          )}
          <span>
            Pixels {latestSnapshot.visiblePixels}, outline {latestSnapshot.claimOutlineSegments}, pending {latestSnapshot.pendingClaims}/{latestSnapshot.pendingPaints}
          </span>
          <span>
            Selected {latestSnapshot.selectedPixel ?? "--"} | Area {latestSnapshot.selectedAreaId ?? "--"} | Panels {latestSnapshot.buildPanelOpen ? "build" : "closed"} / {latestSnapshot.areaPanelBusy || latestSnapshot.areaDetailsBusy ? "busy" : "idle"} | Rectangle {latestSnapshot.rectanglePlacementBusy ? "checking" : "idle"}
          </span>
        </div>
      ) : null}
      <div className="perf-debug-events">
        {events.length === 0 ? (
          <p>No recorded events yet. Start recording, reproduce the glitch, then dump the log from the console.</p>
        ) : (
          events.map((event) => (
            <article className={`perf-debug-event is-${event.kind}`} key={event.id}>
              <strong>{event.label}</strong>
              <span>{event.detail || "No detail"}</span>
            </article>
          ))
        )}
      </div>
        </>
      )}
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

function AreaParticipantAvatar({ participant }: {
  participant: { avatar_url: string | null; display_name: string };
}) {
  if (participant.avatar_url) {
    return (
      <Image
        alt=""
        className="area-participant-avatar"
        height={30}
        src={participant.avatar_url}
        width={30}
      />
    );
  }

  return (
    <div className="area-participant-avatar area-participant-avatar-fallback" aria-hidden="true">
      <DefaultAvatarIcon />
    </div>
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

export function WorldStage({ outsideArtAssets, world: initialWorld }: WorldStageProps) {
  const worldRenderCountRef = useRef(0);
  const outsidePatternIdBase = useId().replace(/:/g, "");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const buildPanelRef = useRef<HTMLDivElement | null>(null);
  const hoverCoordinateValueRef = useRef<HTMLSpanElement | null>(null);
  const crosshairHorizontalRef = useRef<HTMLDivElement | null>(null);
  const crosshairVerticalRef = useRef<HTMLDivElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const overlayFileInputRef = useRef<HTMLInputElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const buildPanelDragState = useRef<BuildPanelDragState | null>(null);
  const overlayPointerDragRef = useRef<OverlayPointerDragState | null>(null);
  const overlaySourceRef = useRef<ClaimOverlaySource | null>(null);
  const cameraUpdateFrameRef = useRef<number | null>(null);
  const pendingCameraUpdateRef = useRef<CameraState | null>(null);
  const pointerVisualFrameRef = useRef<number | null>(null);
  const spaceStrokeRef = useRef<SpaceStrokeState | null>(null);
  const spaceToolActiveRef = useRef(false);
  const currentUserRef = useRef<AuthUser | null>(null);
  const visiblePixelsRef = useRef<WorldPixel[]>([]);
  const pixelIndexRef = useRef<Map<string, WorldPixel>>(new Map());
  const claimContextPixelIndexRef = useRef<Map<string, ClaimContextPixelRecord>>(new Map());
  const activeWorldBoundsRef = useRef<ActiveWorldBounds | null>(null);
  const activeChunksRef = useRef<WorldOverview["chunks"]>([]);
  const pendingClaimPixelsRef = useRef<PixelCoordinate[]>([]);
  const pendingClaimPixelMapRef = useRef<Set<string>>(new Set());
  const pendingClaimRectanglesRef = useRef<PendingClaimRectangle[]>([]);
  const pendingPaintsRef = useRef<PendingPaint[]>([]);
  const pendingPaintMapRef = useRef<Map<string, PendingPaint>>(new Map());
  const pendingOverlayColorMapRef = useRef<Map<string, number>>(new Map());
  const selectedAreaOverlayColorMapRef = useRef<Map<string, number>>(new Map());
  const claimOutlineSegmentsRef = useRef<ClaimOutlineSegment[]>([]);
  const renderedWorldTilesRef = useRef<WorldTile[]>([]);
  const selectedPixelSnapshotRef = useRef<PixelCoordinate | null>(null);
  const selectedPixelFetchKeyRef = useRef<string | null>(null);
  const selectedPixelFetchAbortRef = useRef<AbortController | null>(null);
  const selectedPixelFetchMissesRef = useRef<Map<string, number>>(new Map());
  const semanticZoomModeRef = useRef(false);
  const inspectedPixelSnapshotRef = useRef<PixelCoordinate | null>(null);
  const selectedAreaSnapshotRef = useRef<ClaimAreaRecord | null>(null);
  const buildPanelOpenRef = useRef(false);
  const buildPanelMinimizedRef = useRef(false);
  const areaPanelBusyRef = useRef(false);
  const areaDetailsBusyRef = useRef(false);
  const rectanglePlacementBusyRef = useRef(false);
  const lastWorldRenderMarkAtRef = useRef(0);
  const lastWheelZoomMarkAtRef = useRef(0);
  const debugTileStatesRef = useRef<Record<DebugTileLayer, Map<string, DebugTileState>>>({
    visual: new Map(),
    claims: new Map(),
    paint: new Map(),
  });
  const debugActiveTilesRef = useRef<Record<DebugTileLayer, Map<string, {
    detailScale: number;
    hasFallback: boolean;
  }>>>({
    visual: new Map(),
    claims: new Map(),
    paint: new Map(),
  });
  const retainedTileSrcRef = useRef<Record<DebugTileLayer, Map<string, string>>>({
    visual: new Map(),
    claims: new Map(),
    paint: new Map(),
  });
  const activeBuildModeRef = useRef<BuildMode>("claim");
  const claimAreaModeRef = useRef<ClaimAreaClaimMode>("new");
  const claimTargetAreaIdRef = useRef<string | null>(null);
  const canStartNewAreaRef = useRef(true);
  const newAreaBlockedReasonRef = useRef<string | null>(null);
  const claimToolRef = useRef<ClaimTool>("brush");
  const pendingOverlayDraftRef = useRef<ClaimOverlayDraft | null>(null);
  const paintToolRef = useRef<PaintTool>("brush");
  const rectangleAnchorRef = useRef<PixelCoordinate | null>(null);
  const areaInspectionAbortRef = useRef<AbortController | null>(null);
  const areaDetailsAbortRef = useRef<AbortController | null>(null);
  const visibleAreaFetchAbortRef = useRef<AbortController | null>(null);
  const visibleAreaFetchKeyRef = useRef<string | null>(null);
  const visibleAreaLastSuccessRef = useRef<{ key: string; at: number } | null>(null);
  const visibleAreaPrefetchBoundsRef = useRef<VisibleAreaBounds | null>(null);
  const pixelFetchAbortRef = useRef<AbortController | null>(null);
  const pixelFetchKeyRef = useRef<string | null>(null);
  const pixelFetchLastSuccessRef = useRef<{ key: string; at: number } | null>(null);
  const rectangleAnchorPrefetchAbortRef = useRef<AbortController | null>(null);
  const rectangleAnchorPrefetchKeyRef = useRef<string | null>(null);
  const claimOutlineFetchAbortRef = useRef<AbortController | null>(null);
  const claimOutlineFetchKeyRef = useRef<string | null>(null);
  const claimOutlineFetchLastSuccessRef = useRef<{ key: string; at: number } | null>(null);
  const worldRealtimeRefreshTimerRef = useRef<number | null>(null);
  const refreshVisiblePixelWindowRef = useRef<(options?: { force?: boolean }) => Promise<void>>(async () => undefined);
  const refreshClaimOutlineNowRef = useRef<(options?: { force?: boolean }) => Promise<void>>(async () => undefined);
  const fetchVisibleAreaPreviewWindowRef = useRef<(
    bounds: VisibleAreaBounds,
    triggerLiveRefresh: boolean,
  ) => Promise<void>>(async () => undefined);
  const refreshOwnedAreasRef = useRef<(options?: { showLoading?: boolean }) => Promise<void>>(async () => undefined);
  const refreshAuthStatusRef = useRef<(showLoading?: boolean) => Promise<void>>(async () => undefined);
  const claimOutlineFocusRef = useRef<string | null>(null);
  const syncSelectedPlacementStateRef = useRef<(pixel: PixelCoordinate | null) => void>(() => undefined);
  const syncInspectedPixelRecordRef = useRef<() => void>(() => undefined);
  const rightEraseStrokeRef = useRef<RightEraseStrokeState | null>(null);
  const cameraFetchGenerationRef = useRef(0);
  const claimAreaCacheRef = useRef<Map<string, ClaimAreaRecord>>(new Map());
  const claimAreaDetailCacheRef = useRef<Map<string, ClaimAreaSummary>>(new Map());
  const ownedAreasRef = useRef<ClaimAreaListItem[]>([]);
  const knownPaintableAreaIdsRef = useRef<Set<string>>(new Set());
  const selectedColorIdRef = useRef(DEFAULT_COLOR_ID);
  const lastPaintBlockedMissingPixelAtRef = useRef(0);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const cameraRef = useRef<CameraState>({
    x: 0,
    y: 0,
    zoom: DEFAULT_ZOOM,
  });
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0, inside: false });
  const activeModalRef = useRef<ActiveModal | null>(null);
  const namePromptShownRef = useRef(false);
  const [camera, setCamera] = useState<CameraState>({
    x: 0,
    y: 0,
    zoom: DEFAULT_ZOOM,
  });
  const [fetchCamera, setFetchCamera] = useState<CameraState>({
    x: 0,
    y: 0,
    zoom: DEFAULT_ZOOM,
  });
  const [semanticZoomMode, setSemanticZoomMode] = useState(false);
  const [world, setWorld] = useState<WorldOverview>(initialWorld);
  const worldOriginSignatureRef = useRef(`${initialWorld.origin.x}:${initialWorld.origin.y}`);
  const [showGrid, setShowGrid] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthSessionStatus>(FALLBACK_AUTH_STATUS);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<ProfileMessage | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<ProfileMessage | null>(null);
  const [hoveredPixel, setHoveredPixel] = useState<PixelCoordinate | null>(null);
  const [selectedPixel, setSelectedPixel] = useState<PixelCoordinate | null>(null);
  const [inspectedPixel, setInspectedPixel] = useState<PixelCoordinate | null>(null);
  const [inspectedPixelRecord, setInspectedPixelRecord] = useState<WorldPixel | null>(null);
  const [selectedColorId, setSelectedColorId] = useState(DEFAULT_COLOR_ID);
  const [activeBuildMode, setActiveBuildMode] = useState<BuildMode>("claim");
  const [claimAreaMode, setClaimAreaMode] = useState<ClaimAreaClaimMode>("new");
  const [claimTargetAreaId, setClaimTargetAreaId] = useState<string | null>(null);
  const [claimTool, setClaimTool] = useState<ClaimTool>("brush");
  const [pendingOverlayDraft, setPendingOverlayDraft] = useState<ClaimOverlayDraft | null>(null);
  const [overlayPaletteOpen, setOverlayPaletteOpen] = useState(false);
  const [paintTool, setPaintTool] = useState<PaintTool>("brush");
  const [rectangleAnchor, setRectangleAnchor] = useState<PixelCoordinate | null>(null);
  const [rectanglePlacementBusy, setRectanglePlacementBusy] = useState(false);
  const [buildPanelOpen, setBuildPanelOpen] = useState(false);
  const [buildPanelMinimized, setBuildPanelMinimized] = useState(false);
  const [buildPanelPosition, setBuildPanelPosition] = useState<BuildPanelPosition | null>(null);
  const [pendingClaimPixels, setPendingClaimPixels] = useState<PixelCoordinate[]>([]);
  const [pendingClaimRectangles, setPendingClaimRectangles] = useState<PendingClaimRectangle[]>([]);
  const [pendingPaints, setPendingPaints] = useState<PendingPaint[]>([]);
  const [placementBusy, setPlacementBusy] = useState(false);
  const [placementMessage, setPlacementMessage] = useState<ProfileMessage | null>(null);
  const [devRecoveryNotice, setDevRecoveryNotice] = useState<string | null>(null);
  const [selectedPlacementState, setSelectedPlacementState] = useState<PlacementState>(EMPTY_PLACEMENT_STATE);
  const [claimOutlineSegments, setClaimOutlineSegments] = useState<ClaimOutlineSegment[]>([]);
  const [visualTileRevisions, setVisualTileRevisions] = useState<Record<string, number>>({});
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [isCentered, setIsCentered] = useState(false);
  const [spaceToolActive, setSpaceToolActive] = useState(false);
  const [selectedArea, setSelectedArea] = useState<ClaimAreaRecord | null>(null);
  const [areaPanelBusy, setAreaPanelBusy] = useState(false);
  const [areaDetailsBusy, setAreaDetailsBusy] = useState(false);
  const [areaDraftName, setAreaDraftName] = useState("");
  const [areaDraftDescription, setAreaDraftDescription] = useState("");
  const [areaInvitePublicId, setAreaInvitePublicId] = useState("");
  const [areaEditorOpen, setAreaEditorOpen] = useState(false);
  const [areaMessage, setAreaMessage] = useState<ProfileMessage | null>(null);
  const [areaOptionsMenu, setAreaOptionsMenu] = useState<AreaOptionsMenuState | null>(null);
  const [areaPlayerOptionsMenu, setAreaPlayerOptionsMenu] = useState<AreaPlayerOptionsMenuState | null>(null);
  const [ownedAreas, setOwnedAreas] = useState<ClaimAreaListItem[]>([]);
  const [ownedAreasLoaded, setOwnedAreasLoaded] = useState(false);
  const [ownedAreasLoading, setOwnedAreasLoading] = useState(false);
  const [ownedAreasMessage, setOwnedAreasMessage] = useState<ProfileMessage | null>(null);

  const setRectanglePlacementBusyState = useCallback((nextBusy: boolean): void => {
    rectanglePlacementBusyRef.current = nextBusy;
    setRectanglePlacementBusy(nextBusy);
  }, []);

  const scheduleCameraUpdate = useCallback((nextCamera: CameraState): void => {
    pendingCameraUpdateRef.current = nextCamera;
    cameraRef.current = nextCamera;

    if (cameraUpdateFrameRef.current !== null || typeof window === "undefined") {
      return;
    }

    cameraUpdateFrameRef.current = window.requestAnimationFrame(() => {
      cameraUpdateFrameRef.current = null;
      const queuedCamera = pendingCameraUpdateRef.current;
      pendingCameraUpdateRef.current = null;

      if (queuedCamera === null) {
        return;
      }

      setCamera((current) => (
        current.x === queuedCamera.x &&
        current.y === queuedCamera.y &&
        current.zoom === queuedCamera.zoom
          ? current
          : queuedCamera
      ));
    });
  }, []);

  useEffect(() => {
    return () => {
      if (cameraUpdateFrameRef.current !== null) {
        window.cancelAnimationFrame(cameraUpdateFrameRef.current);
      }
    };
  }, []);

  claimOutlineSegmentsRef.current = claimOutlineSegments;
  selectedPixelSnapshotRef.current = selectedPixel;
  inspectedPixelSnapshotRef.current = inspectedPixel;
  selectedAreaSnapshotRef.current = selectedArea;
  buildPanelOpenRef.current = buildPanelOpen;
  buildPanelMinimizedRef.current = buildPanelMinimized;
  areaPanelBusyRef.current = areaPanelBusy;
  areaDetailsBusyRef.current = areaDetailsBusy;
  rectanglePlacementBusyRef.current = rectanglePlacementBusy;
  ownedAreasRef.current = ownedAreas;
  const worldOutsidePatternId = `${outsidePatternIdBase}-outside-pattern`;
  const worldOutsideMaskId = `${outsidePatternIdBase}-outside-mask`;

  const refreshAuthStatus = useCallback(async (showLoading = true): Promise<void> => {
    markPerfEvent("auth refresh start", showLoading ? "with loading" : "background");
    if (showLoading) {
      setAuthLoading(true);
    }

    const nextStatus = await fetchAuthSession();
    const nextSignature = getAuthStatusSignature(nextStatus);
    setAuthStatus((current) => (
      getAuthStatusSignature(current) === nextSignature ? current : nextStatus
    ));
    setAuthLoading(false);
    markPerfEvent("auth refresh done", nextStatus.authenticated ? "authenticated" : "guest");
  }, []);
  refreshAuthStatusRef.current = refreshAuthStatus;

  const refreshOwnedAreas = useCallback(async (options?: { showLoading?: boolean }): Promise<void> => {
    const showLoading = options?.showLoading ?? true;

    if (showLoading) {
      setOwnedAreasLoading(true);
      setOwnedAreasMessage(null);
    }

    const result = await fetchMyClaimAreas();

    if (!result.ok) {
      if (showLoading) {
        setOwnedAreas([]);
        setOwnedAreasLoaded(true);
        setOwnedAreasMessage({
          tone: "error",
          text: result.error ?? "Your claim areas could not be loaded.",
        });
      }
      setOwnedAreasLoading(false);
      return;
    }

    knownPaintableAreaIdsRef.current = new Set(
      result.areas
        .filter((area) => area.status === "active" && area.viewer_can_paint)
        .map((area) => area.id),
    );

    setOwnedAreas(result.areas);
    setOwnedAreasLoaded(true);
    setOwnedAreasMessage(null);
    setOwnedAreasLoading(false);
  }, []);
  refreshOwnedAreasRef.current = refreshOwnedAreas;

  const syncOwnedAreaSummary = useCallback((summary: ClaimAreaSummary): void => {
    setOwnedAreas((current) => {
      let matched = false;
      const nextAreas = current.map((area) => {
        if (area.id !== summary.id) {
          return area;
        }

        matched = true;
        return {
          ...area,
          public_id: summary.public_id,
          name: summary.name,
          description: summary.description,
          status: summary.status,
          owner: summary.owner,
          claimed_pixels_count: summary.claimed_pixels_count,
          painted_pixels_count: summary.painted_pixels_count,
          contributor_count: summary.contributor_count,
          viewer_can_edit: summary.viewer_can_edit,
          viewer_can_paint: summary.viewer_can_paint,
          created_at: summary.created_at,
          updated_at: summary.updated_at,
          last_activity_at: summary.last_activity_at,
        };
      });

      if (!matched) {
        if (summary.status === "active" && summary.viewer_can_paint) {
          knownPaintableAreaIdsRef.current.add(summary.id);
        } else {
          knownPaintableAreaIdsRef.current.delete(summary.id);
        }
        return current;
      }

      ownedAreasRef.current = nextAreas;
      knownPaintableAreaIdsRef.current = new Set(
        nextAreas
          .filter((area) => area.status === "active" && area.viewer_can_paint)
          .map((area) => area.id),
      );
      return nextAreas;
    });
    setOwnedAreasLoaded(true);
    setOwnedAreasLoading(false);
  }, []);

  const copyClaimAreaId = useCallback(async (
    publicId: number,
    messageTarget: "area" | "areas-list",
  ): Promise<void> => {
    const areaLabel = formatClaimAreaId(publicId);
    setAreaOptionsMenu(null);

    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("Clipboard API is not available.");
      }

      await navigator.clipboard.writeText(areaLabel);
      const message = {
        tone: "success" as const,
        text: `Area ID copied: ${areaLabel}`,
      };

      if (messageTarget === "area") {
        setAreaMessage(message);
      } else {
        setOwnedAreasMessage(message);
      }
    } catch {
      const message = {
        tone: "error" as const,
        text: "Area ID could not be copied automatically.",
      };

      if (messageTarget === "area") {
        setAreaMessage(message);
      } else {
        setOwnedAreasMessage(message);
      }
    }
  }, []);

  const openAreaOptionsMenu = useCallback((
    event: ReactMouseEvent<HTMLButtonElement>,
    publicId: number,
    messageTarget: "area" | "areas-list",
    canEdit = false,
  ): void => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const menuGap = 8;
    const left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    const top = Math.max(12, Math.min(rect.bottom + menuGap, window.innerHeight - 132));

    setAreaPlayerOptionsMenu(null);
    setAreaOptionsMenu({
      publicId,
      canEdit,
      messageTarget,
      left,
      top,
    });
  }, []);

  const openAreaPlayerOptionsMenu = useCallback((
    event: ReactMouseEvent<HTMLButtonElement>,
    contributor: AreaContributorSummary,
  ): void => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 220;
    const menuGap = 8;
    const left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    const top = Math.max(12, Math.min(rect.bottom + menuGap, window.innerHeight - 132));

    setAreaOptionsMenu(null);
    setAreaPlayerOptionsMenu({
      publicId: contributor.public_id,
      displayName: contributor.display_name,
      role: contributor.role,
      left,
      top,
    });
  }, []);

  useEffect(() => {
    worldRenderCountRef.current += 1;

    if (!isPerfDebugEnabled()) {
      return;
    }

    const now = performance.now();

    if (now - lastWorldRenderMarkAtRef.current < DEBUG_WORLD_RENDER_MARK_MIN_INTERVAL_MS) {
      return;
    }

    lastWorldRenderMarkAtRef.current = now;
    markPerfEvent("world render", `#${worldRenderCountRef.current}`);
  });

  useEffect(() => {
    document.body.dataset.theme = darkMode ? "dark" : "light";

    return () => {
      delete document.body.dataset.theme;
    };
  }, [darkMode]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const showRecoverableDevNotice = (value: unknown): void => {
      const notice = getDevBundleRecoveryNotice(value);
      if (notice !== null) {
        setDevRecoveryNotice(notice);
      }
    };

    const handleError = (event: ErrorEvent): void => {
      showRecoverableDevNotice(`${event.message}\n${stringifyUnknownError(event.error)}`);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
      showRecoverableDevNotice(event.reason);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (areaOptionsMenu === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setAreaOptionsMenu(null);
      }
    };

    const closeMenu = (): void => setAreaOptionsMenu(null);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [areaOptionsMenu]);

  useEffect(() => {
    if (areaPlayerOptionsMenu === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setAreaPlayerOptionsMenu(null);
      }
    };

    const closeMenu = (): void => setAreaPlayerOptionsMenu(null);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [areaPlayerOptionsMenu]);

  useEffect(() => {
    void refreshAuthStatus();
  }, [refreshAuthStatus]);

  useEffect(() => {
    knownPaintableAreaIdsRef.current.clear();
    claimAreaCacheRef.current.clear();
    claimAreaDetailCacheRef.current.clear();
  }, [authStatus.user?.id]);

  useEffect(() => {
    if (!authStatus.authenticated) {
      return;
    }

    void refreshOwnedAreas();
  }, [authStatus.authenticated, authStatus.user?.id, refreshOwnedAreas]);

  useEffect(() => {
    let cancelled = false;

    const refreshWorldOverview = async (): Promise<void> => {
      const nextWorld = await fetchWorldOverview();

      if (!cancelled) {
        const nextOriginSignature = `${nextWorld.origin.x}:${nextWorld.origin.y}`;

        if (worldOriginSignatureRef.current !== nextOriginSignature) {
          worldOriginSignatureRef.current = nextOriginSignature;
          setIsCentered(false);
        }

        setWorld(nextWorld);
      }
    };

    void refreshWorldOverview();
    const refreshInterval = window.setInterval(refreshWorldOverview, WORLD_OVERVIEW_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = (): void => {
      if (!document.hidden) {
        void refreshWorldOverview();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!authStatus.authenticated) {
      setOwnedAreas([]);
      setOwnedAreasLoaded(false);
      setOwnedAreasMessage(null);
      setBuildPanelOpen(false);
      setBuildPanelMinimized(false);
      setBuildPanelPosition(null);
      setClaimAreaMode("new");
      setClaimTargetAreaId(null);
      setRectangleAnchor(null);
      setPendingOverlayDraft(null);
      setOverlayPaletteOpen(false);
      setPendingClaimPixels([]);
      setPendingClaimRectangles([]);
      setPendingPaints([]);
      pendingClaimPixelsRef.current = [];
      pendingClaimPixelMapRef.current = new Set();
      pendingClaimRectanglesRef.current = [];
      pendingPaintsRef.current = [];
      pendingPaintMapRef.current = new Map();
      pendingOverlayDraftRef.current = null;
      overlaySourceRef.current = null;
      return;
    }

    const refreshInterval = window.setInterval(() => {
      void refreshAuthStatus(false);
    }, AUTH_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = (): void => {
      if (!document.hidden) {
        void refreshAuthStatus(false);
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
      y: Math.floor((camera.y - screenY) / camera.zoom),
    };
  }, [camera.x, camera.y, camera.zoom]);

  const applyAreaSelection = useCallback((
    area: ClaimAreaRecord | null,
    options?: { syncDrafts?: boolean },
  ): void => {
    const syncDrafts = options?.syncDrafts ?? true;
    setSelectedArea((current) => {
      return buildAreaSelectionSignature(current) === buildAreaSelectionSignature(area) ? current : area;
    });

    if (area === null) {
      setAreaInvitePublicId("");
      setAreaEditorOpen(false);
      setAreaOptionsMenu(null);
      setAreaPlayerOptionsMenu(null);
      if (syncDrafts) {
        setAreaDraftName("");
        setAreaDraftDescription("");
      }
      return;
    }

    if (!syncDrafts) {
      return;
    }

    setAreaInvitePublicId("");
    setAreaEditorOpen(false);
    setAreaDraftName(area.name);
    setAreaDraftDescription(area.description);
  }, []);

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
    const centeredY = viewportSize.height / 2 + activeWorldBounds.centerY * zoom;
    const minCameraX = paddingX - activeWorldBounds.maxX * zoom;
    const maxCameraX = viewportSize.width - paddingX - activeWorldBounds.minX * zoom;
    const minCameraY = paddingY + activeWorldBounds.minY * zoom;
    const maxCameraY = viewportSize.height - paddingY + activeWorldBounds.maxY * zoom;

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

  const focusClaimArea = useCallback((area: ClaimAreaListItem): void => {
    const targetWidth = Math.max(area.bounds.width, 12);
    const targetHeight = Math.max(area.bounds.height, 12);
    const viewportWidth = Math.max(viewportSize.width, 1);
    const viewportHeight = Math.max(viewportSize.height, 1);
    const fitAreaZoom = Math.min(
      viewportWidth / (targetWidth * 1.35),
      viewportHeight / (targetHeight * 1.35),
    );
    const nextZoom = clampZoom(
      Math.min(MAX_ZOOM, Math.max(minZoom, Math.min(16, fitAreaZoom))),
      minZoom,
    );

    setSelectedPixel({
      x: Math.floor(area.bounds.center_x),
      y: Math.floor(area.bounds.center_y),
    });
    setCamera(clampCamera({
      zoom: nextZoom,
      x: viewportWidth / 2 - area.bounds.center_x * nextZoom,
      y: viewportHeight / 2 + area.bounds.center_y * nextZoom,
    }));
    setActiveModal(null);
    setBuildPanelOpen(false);
    setBuildPanelMinimized(false);
  }, [clampCamera, minZoom, viewportSize.height, viewportSize.width]);

  const handleNativeWheel = useCallback((event: WheelEvent): void => {
    event.preventDefault();
    if (isPerfDebugEnabled()) {
      const now = performance.now();

      if (now - lastWheelZoomMarkAtRef.current >= DEBUG_INTERACTION_MARK_MIN_INTERVAL_MS) {
        lastWheelZoomMarkAtRef.current = now;
        markPerfEvent("wheel zoom");
      }
    }

    const viewport = viewportRef.current;

    if (viewport === null) {
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const currentCamera = pendingCameraUpdateRef.current ?? cameraRef.current;
    const zoomDirection = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const nextZoom = clampZoom(currentCamera.zoom * zoomDirection, minZoom);

    if (nextZoom === currentCamera.zoom) {
      return;
    }

    const worldX = (anchorX - currentCamera.x) / currentCamera.zoom;
    const worldY = (currentCamera.y - anchorY) / currentCamera.zoom;

    scheduleCameraUpdate(clampCamera({
      zoom: nextZoom,
      x: anchorX - worldX * nextZoom,
      y: anchorY + worldY * nextZoom,
    }));
  }, [clampCamera, minZoom, scheduleCameraUpdate]);

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
  const ownedActiveAreas = useMemo(() => {
    return ownedAreas.filter((area) => area.status === "active" && area.viewer_can_edit);
  }, [ownedAreas]);
  const contributedActiveAreas = useMemo(() => {
    return ownedAreas.filter((area) => area.status === "active" && !area.viewer_can_edit && area.viewer_can_paint);
  }, [ownedAreas]);
  const finishedVisibleAreas = useMemo(() => {
    return ownedAreas.filter((area) => area.status === "finished");
  }, [ownedAreas]);
  const hasFreeAreaSlot = currentUser === null
    ? true
    : ownedActiveAreas.length < currentUser.claim_area_limit;
  const newAreaBlockedReason = useMemo(() => {
    if (currentUser === null) {
      return null;
    }

    if (!ownedAreasLoaded || ownedAreasLoading) {
      return "Checking your area slots...";
    }

    if (ownedAreasMessage?.tone === "error") {
      return ownedAreasMessage.text;
    }

    if (!hasFreeAreaSlot) {
      if (ownedActiveAreas.length === 1 && currentUser.claim_area_limit === 1) {
        return "Finish or extend your current active area from Area Info before starting a new one.";
      }

      return `You already use all ${currentUser.claim_area_limit} active area slot${currentUser.claim_area_limit === 1 ? "" : "s"}.`;
    }

    return null;
  }, [
    currentUser,
    hasFreeAreaSlot,
    ownedAreasLoaded,
    ownedAreasLoading,
    ownedAreasMessage,
    ownedActiveAreas.length,
  ]);
  const canStartNewArea = currentUser === null || newAreaBlockedReason === null;
  const activeClaimTargetArea = useMemo(() => {
    if (claimTargetAreaId === null) {
      return null;
    }

    if (selectedArea !== null && selectedArea.id === claimTargetAreaId) {
      return selectedArea;
    }

    return ownedAreas.find((area) => area.id === claimTargetAreaId) ?? null;
  }, [claimTargetAreaId, ownedAreas, selectedArea]);
  const activeClaimTargetAreaName = activeClaimTargetArea?.name ?? "selected area";
  const focusedClaimOutlineArea = selectedArea?.bounds ? selectedArea : null;
  const focusedClaimOutlineAreaId = focusedClaimOutlineArea?.id ?? null;
  const focusedClaimOutlineAreaPublicId = focusedClaimOutlineArea?.public_id ?? null;
  const focusedClaimOutlineAreaBounds = focusedClaimOutlineArea?.bounds ?? null;

  currentUserRef.current = currentUser;
  activeWorldBoundsRef.current = activeWorldBounds;
  activeChunksRef.current = activeChunks;
  activeBuildModeRef.current = activeBuildMode;
  claimAreaModeRef.current = claimAreaMode;
  claimTargetAreaIdRef.current = claimTargetAreaId;
  canStartNewAreaRef.current = canStartNewArea;
  newAreaBlockedReasonRef.current = newAreaBlockedReason;
  claimToolRef.current = claimTool;
  pendingOverlayDraftRef.current = pendingOverlayDraft;
  paintToolRef.current = paintTool;
  rectangleAnchorRef.current = rectangleAnchor;
  selectedColorIdRef.current = selectedColorId;
  const effectiveCameraRefState = pendingCameraUpdateRef.current ?? camera;
  zoomRef.current = effectiveCameraRefState.zoom;
  cameraRef.current = effectiveCameraRefState;
  activeModalRef.current = activeModal;
  spaceToolActiveRef.current = spaceToolActive;

  const pendingOverlayColorKey = pendingOverlayDraft?.enabledColorIds.join(",") ?? "";
  const selectedAreaOverlay = isClaimAreaSummary(selectedArea) ? selectedArea.overlay : null;
  const selectedAreaOverlayPreviewDataUrl = useMemo(
    () => (selectedAreaOverlay ? buildClaimOverlayRecordPreview(selectedAreaOverlay) : null),
    [selectedAreaOverlay],
  );
  const selectedAreaOverlayTransform = selectedAreaOverlay
    ? {
        originX: selectedAreaOverlay.origin_x,
        originY: selectedAreaOverlay.origin_y,
        width: selectedAreaOverlay.width,
        height: selectedAreaOverlay.height,
      }
    : null;
  const pendingOverlayColorMap = useMemo(
    () => buildClaimOverlayDraftColorMap(pendingOverlayDraft?.templatePixels ?? []),
    [pendingOverlayDraft?.templatePixels],
  );
  const selectedAreaOverlayColorMap = useMemo(
    () => buildClaimOverlayRecordColorMap(selectedAreaOverlay?.template_pixels ?? []),
    [selectedAreaOverlay?.template_pixels],
  );

  pendingOverlayColorMapRef.current = pendingOverlayColorMap;
  selectedAreaOverlayColorMapRef.current = selectedAreaOverlayColorMap;

  useEffect(() => {
    const renderDraft = pendingOverlayDraftRef.current;

    if (renderDraft === null) {
      return;
    }

    const source = overlaySourceRef.current;

    if (source === null || source.version !== renderDraft.sourceVersion) {
      return;
    }

    let cancelled = false;
    const renderTimeout = window.setTimeout(() => {
      try {
        const result = buildClaimOverlayRender(source, renderDraft);

        if (cancelled) {
          return;
        }

        setPendingOverlayDraft((current) => {
          if (current === null || current.sourceVersion !== renderDraft.sourceVersion) {
            return current;
          }

          return {
            ...current,
            previewDataUrl: result.previewDataUrl,
            templatePixels: result.templatePixels,
            renderMessage: null,
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Overlay rendering failed.";

        if (!cancelled) {
          setPendingOverlayDraft((current) => current === null
            ? current
            : {
                ...current,
                templatePixels: [],
                renderMessage: message,
              });
        }
      }
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(renderTimeout);
    };
  }, [
    pendingOverlayColorKey,
    pendingOverlayDraft?.colorMode,
    pendingOverlayDraft?.dithering,
    pendingOverlayDraft?.flipX,
    pendingOverlayDraft?.flipY,
    pendingOverlayDraft?.sourceVersion,
    pendingOverlayDraft?.transform.height,
    pendingOverlayDraft?.transform.width,
  ]);

  useEffect(() => {
    cameraFetchGenerationRef.current += 1;
    pixelFetchAbortRef.current?.abort();
    pixelFetchAbortRef.current = null;
    pixelFetchKeyRef.current = null;
    claimOutlineFetchAbortRef.current?.abort();
    claimOutlineFetchAbortRef.current = null;
    claimOutlineFetchKeyRef.current = null;
    visibleAreaFetchAbortRef.current?.abort();
    visibleAreaFetchAbortRef.current = null;
    visibleAreaFetchKeyRef.current = null;

    const zoomedOutForPaint =
      buildPanelOpen &&
      activeBuildMode === "paint" &&
      camera.zoom < fetchCamera.zoom;

    if (zoomedOutForPaint) {
      emitDebugEvent(
        "network",
        "Pixel fetch camera updated immediately",
        `zoom-out paint ${fetchCamera.zoom.toFixed(2)}x -> ${camera.zoom.toFixed(2)}x`,
      );
      setFetchCamera({
        x: camera.x,
        y: camera.y,
        zoom: camera.zoom,
      });
      return;
    }

    const settleTimeout = window.setTimeout(() => {
      setFetchCamera({
        x: camera.x,
        y: camera.y,
        zoom: camera.zoom,
      });
    }, CAMERA_FETCH_SETTLE_MS);

    return () => {
      window.clearTimeout(settleTimeout);
    };
  }, [activeBuildMode, buildPanelOpen, camera.x, camera.y, camera.zoom, fetchCamera.zoom]);

  useEffect(() => {
    setSemanticZoomMode((current) => {
      const next = buildPanelOpen && fetchCamera.zoom >= GRID_THRESHOLD;

      if (current === next) {
        return current;
      }

      markPerfEvent("semantic mode", next ? "semantic" : "visual");
      return next;
    });
  }, [buildPanelOpen, fetchCamera.zoom]);

  useEffect(() => {
    semanticZoomModeRef.current = semanticZoomMode;
  }, [semanticZoomMode]);

  useEffect(() => {
    if (
      claimAreaMode !== "expand" ||
      claimTargetAreaId === null ||
      !ownedAreasLoaded
    ) {
      return;
    }

    if (
      activeClaimTargetArea !== null &&
      activeClaimTargetArea.status === "active" &&
      activeClaimTargetArea.viewer_can_edit
    ) {
      return;
    }

    setClaimAreaMode("new");
    setClaimTargetAreaId(null);
  }, [activeClaimTargetArea, claimAreaMode, claimTargetAreaId, ownedAreasLoaded]);

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
        y: viewportSize.height / 2 + activeWorldBounds.centerY * initialZoom,
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

  const canShowGrid = semanticZoomMode;
  const gridVisible = showGrid && canShowGrid;

  useEffect(() => {
    markPerfEvent("tile mode", semanticZoomMode ? "visual+semantic" : "visual");
  }, [semanticZoomMode]);

  const gridLines = useMemo(() => {
    return measureDebugWork("Compute grid lines", () => {
      if (!gridVisible || viewportSize.width === 0 || viewportSize.height === 0) {
        return {
          horizontal: [] as GridLine[],
          vertical: [] as GridLine[],
        };
      }

      const startX = Math.floor(-camera.x / camera.zoom) - 1;
      const endX = Math.ceil((viewportSize.width - camera.x) / camera.zoom) + 1;
      const startY = Math.floor((camera.y - viewportSize.height) / camera.zoom) - 1;
      const endY = Math.ceil(camera.y / camera.zoom) + 1;
      const vertical: GridLine[] = [];
      const horizontal: GridLine[] = [];

      for (let x = startX; x <= endX; x += 1) {
        vertical.push({
          key: `v-${x}`,
          position: snapScreen(camera.x + x * camera.zoom),
          major: x % GRID_MAJOR_STEP === 0,
          origin: x === 0,
        });
      }

      for (let y = startY; y <= endY; y += 1) {
        horizontal.push({
          key: `h-${y}`,
          position: snapScreen(worldBoundaryScreenY(y, camera)),
          major: y % GRID_MAJOR_STEP === 0,
          origin: y === 0,
        });
      }

      return {
        horizontal,
        vertical,
      };
    }, (lines) => `${lines.vertical.length} vertical, ${lines.horizontal.length} horizontal @ ${camera.zoom.toFixed(2)}x`);
  }, [camera, gridVisible, viewportSize.height, viewportSize.width]);

  const activeChunkViewportRects = useMemo<ActiveChunkViewportRect[]>(() => {
    return activeChunks
      .map((chunk) => {
        const left = snapScreen(camera.x + chunk.origin_x * camera.zoom);
        const top = snapScreen(worldBoundaryScreenY(chunk.origin_y + chunk.height, camera));
        const right = snapScreen(camera.x + (chunk.origin_x + chunk.width) * camera.zoom);
        const bottom = snapScreen(worldBoundaryScreenY(chunk.origin_y, camera));

        return {
          key: chunk.id,
          left,
          top,
          width: right - left,
          height: bottom - top,
        };
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);
  }, [activeChunks, camera]);

  const activeChunkBoundaryRects = useMemo(() => {
    const chunkIndex = new Set(activeChunks.map((chunk) => `${chunk.chunk_x}:${chunk.chunk_y}`));
    const rects: WorldBoundaryRect[] = [];
    const pushRect = (rect: WorldBoundaryRect): void => {
      if (rect.width > 0 && rect.height > 0) {
        rects.push(rect);
      }
    };

    for (const chunk of activeChunks) {
      const left = snapScreen(camera.x + chunk.origin_x * camera.zoom);
      const top = snapScreen(worldBoundaryScreenY(chunk.origin_y + chunk.height, camera));
      const right = snapScreen(camera.x + (chunk.origin_x + chunk.width) * camera.zoom);
      const bottom = snapScreen(worldBoundaryScreenY(chunk.origin_y, camera));
      const width = right - left;
      const height = bottom - top;
      const hasTopEdge = !chunkIndex.has(`${chunk.chunk_x}:${chunk.chunk_y + 1}`);
      const hasRightEdge = !chunkIndex.has(`${chunk.chunk_x + 1}:${chunk.chunk_y}`);
      const hasBottomEdge = !chunkIndex.has(`${chunk.chunk_x}:${chunk.chunk_y - 1}`);
      const hasLeftEdge = !chunkIndex.has(`${chunk.chunk_x - 1}:${chunk.chunk_y}`);
      const horizontalWidth = Math.min(WORLD_BORDER_WIDTH, Math.max(1, height));
      const verticalWidth = Math.min(WORLD_BORDER_WIDTH, Math.max(1, width));

      if (hasTopEdge) {
        pushRect({
          key: `${chunk.id}-top`,
          left,
          top: top - horizontalWidth,
          width,
          height: horizontalWidth,
        });
      }

      if (hasRightEdge) {
        pushRect({
          key: `${chunk.id}-right`,
          left: right,
          top,
          width: verticalWidth,
          height,
        });
      }

      if (hasBottomEdge) {
        pushRect({
          key: `${chunk.id}-bottom`,
          left,
          top: bottom,
          width,
          height: horizontalWidth,
        });
      }

      if (hasLeftEdge) {
        pushRect({
          key: `${chunk.id}-left`,
          left: left - verticalWidth,
          top,
          width: verticalWidth,
          height,
        });
      }

      if (hasTopEdge && hasLeftEdge) {
        pushRect({
          key: `${chunk.id}-top-left`,
          left: left - verticalWidth,
          top: top - horizontalWidth,
          width: verticalWidth,
          height: horizontalWidth,
        });
      }

      if (hasTopEdge && hasRightEdge) {
        pushRect({
          key: `${chunk.id}-top-right`,
          left: right,
          top: top - horizontalWidth,
          width: verticalWidth,
          height: horizontalWidth,
        });
      }

      if (hasBottomEdge && hasRightEdge) {
        pushRect({
          key: `${chunk.id}-bottom-right`,
          left: right,
          top: bottom,
          width: verticalWidth,
          height: horizontalWidth,
        });
      }

      if (hasBottomEdge && hasLeftEdge) {
        pushRect({
          key: `${chunk.id}-bottom-left`,
          left: left - verticalWidth,
          top: bottom,
          width: verticalWidth,
          height: horizontalWidth,
        });
      }
    }

    return rects;
  }, [activeChunks, camera]);

  const outsideArtPatternImages = useMemo(() => {
    return outsideArtAssets.map((asset) => {
      const centerX = asset.x + asset.size / 2;
      const centerY = asset.y + asset.size / 2;

      return (
        <image
          height={asset.size}
          href={asset.src}
          key={asset.key}
          opacity={asset.opacity}
          preserveAspectRatio="xMidYMid meet"
          style={{ imageRendering: "pixelated" }}
          transform={`rotate(${asset.rotation} ${centerX} ${centerY})`}
          width={asset.size}
          x={asset.x}
          y={asset.y}
        />
      );
    });
  }, [outsideArtAssets]);

  const visibleWorldTileDetailScale = WORLD_TILE_SIZE * camera.zoom < WORLD_DETAIL_TILE_MIN_SCREEN_SIZE
    ? WORLD_LOW_TILE_DETAIL_SCALE
    : 1;
  const fetchWorldTileDetailScale = WORLD_TILE_SIZE * fetchCamera.zoom < WORLD_DETAIL_TILE_MIN_SCREEN_SIZE
    ? WORLD_LOW_TILE_DETAIL_SCALE
    : 1;
  const renderedWorldTiles = useMemo<WorldTile[]>(() => {
    return measureDebugWork("Compute world tiles", () => {
      if (viewportSize.width === 0 || viewportSize.height === 0) {
        return [];
      }

      const detailScale = visibleWorldTileDetailScale;
      const tileWorldSize = detailScale === 1 ? WORLD_TILE_SIZE : WORLD_LOW_TILE_SIZE;
      const tileMargin = detailScale === 1 ? WORLD_TILE_MARGIN : WORLD_LOW_TILE_MARGIN;
      const tileOverscanFactor = detailScale === 1
        ? WORLD_TILE_OVERSCAN_VIEWPORT_FACTOR
        : WORLD_LOW_TILE_OVERSCAN_VIEWPORT_FACTOR;
      const visibleMinX = Math.floor(-camera.x / camera.zoom);
      const visibleMaxX = Math.ceil((viewportSize.width - camera.x) / camera.zoom);
      const visibleMinY = Math.floor((camera.y - viewportSize.height) / camera.zoom);
      const visibleMaxY = Math.ceil(camera.y / camera.zoom);
      const overscanWorldX = Math.ceil((viewportSize.width / camera.zoom) * tileOverscanFactor);
      const overscanWorldY = Math.ceil((viewportSize.height / camera.zoom) * tileOverscanFactor);
      const overscanMinX = visibleMinX - overscanWorldX;
      const overscanMaxX = visibleMaxX + overscanWorldX;
      const overscanMinY = visibleMinY - overscanWorldY;
      const overscanMaxY = visibleMaxY + overscanWorldY;
      const worldMinTileX = Math.floor(activeWorldBounds.minX / tileWorldSize);
      const worldMaxTileX = Math.floor((activeWorldBounds.maxX - 1) / tileWorldSize);
      const worldMinTileY = Math.floor(activeWorldBounds.minY / tileWorldSize);
      const worldMaxTileY = Math.floor((activeWorldBounds.maxY - 1) / tileWorldSize);
      const minTileX = Math.max(
        worldMinTileX,
        Math.floor(overscanMinX / tileWorldSize) - tileMargin,
      );
      const maxTileX = Math.min(
        worldMaxTileX,
        Math.floor(overscanMaxX / tileWorldSize) + tileMargin,
      );
      const minTileY = Math.max(
        worldMinTileY,
        Math.floor(overscanMinY / tileWorldSize) - tileMargin,
      );
      const maxTileY = Math.min(
        worldMaxTileY,
        Math.floor(overscanMaxY / tileWorldSize) + tileMargin,
      );
      const tiles: WorldTile[] = [];

      for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
        for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
          const key = getWorldTileKey(tileX, tileY, detailScale);
          const tileOriginX = tileX * tileWorldSize;
          const tileOriginY = tileY * tileWorldSize;
          const intersectsActiveChunk = activeChunks.some((chunk) => (
            tileOriginX < chunk.origin_x + chunk.width &&
            tileOriginX + tileWorldSize > chunk.origin_x &&
            tileOriginY < chunk.origin_y + chunk.height &&
            tileOriginY + tileWorldSize > chunk.origin_y
          ));

          if (!intersectsActiveChunk) {
            continue;
          }

          tiles.push({
            key,
            detailScale,
            tileX,
            tileY,
            left: snapScreen(camera.x + tileOriginX * camera.zoom),
            top: snapScreen(worldBoundaryScreenY(tileOriginY + tileWorldSize, camera)),
            size: Math.ceil(tileWorldSize * camera.zoom),
          });
        }
      }

      return tiles;
    }, (tiles) => `${tiles.length} ${visibleWorldTileDetailScale === 1 ? "detail" : `low x${visibleWorldTileDetailScale}`} tiles @ ${camera.zoom.toFixed(2)}x`);
  }, [
    activeWorldBounds.maxX,
    activeWorldBounds.maxY,
    activeWorldBounds.minX,
    activeWorldBounds.minY,
    activeChunks,
    camera,
    visibleWorldTileDetailScale,
    viewportSize.height,
    viewportSize.width,
  ]);
  renderedWorldTilesRef.current = renderedWorldTiles;
  const getVisualTileSrc = useCallback((tile: WorldTile): string => {
    return getWorldTileUrl(
      tile.detailScale === 1 ? "visual" : "visual-low",
      tile.tileX,
      tile.tileY,
      visualTileRevisions[tile.key] ?? 0,
    );
  }, [visualTileRevisions]);
  const getVisualTileFallback = useCallback((tile: WorldTile): WorldTileFallback | null => {
    if (tile.detailScale !== 1) {
      return null;
    }

    const lowTileX = getLowWorldTileCoordinate(tile.tileX);
    const lowTileY = getLowWorldTileCoordinate(tile.tileY);
    const lowTileKey = getWorldTileKey(lowTileX, lowTileY, WORLD_LOW_TILE_DETAIL_SCALE);
    return buildLowTileFallback(
      tile,
      getWorldTileUrl(
        "visual-low",
        lowTileX,
        lowTileY,
        visualTileRevisions[lowTileKey] ?? 0,
      ),
    );
  }, [visualTileRevisions]);

  useEffect(() => {
    const visualActiveTiles = new Map<string, { detailScale: number; hasFallback: boolean }>();
    const claimsActiveTiles = new Map<string, { detailScale: number; hasFallback: boolean }>();
    const paintActiveTiles = new Map<string, { detailScale: number; hasFallback: boolean }>();

    for (const tile of renderedWorldTiles) {
      const meta = {
        detailScale: tile.detailScale,
        hasFallback: tile.detailScale === 1,
      };

      visualActiveTiles.set(tile.key, meta);
    }

    debugActiveTilesRef.current = {
      visual: visualActiveTiles,
      claims: claimsActiveTiles,
      paint: paintActiveTiles,
    };

    for (const layer of ["visual", "claims", "paint"] as const) {
      const stateMap = debugTileStatesRef.current[layer];
      const activeTiles =
        layer === "visual"
          ? visualActiveTiles
          : layer === "claims"
            ? claimsActiveTiles
            : paintActiveTiles;

      for (const tileKey of [...stateMap.keys()]) {
        if (!activeTiles.has(tileKey)) {
          stateMap.delete(tileKey);
        }
      }
    }
  }, [renderedWorldTiles]);

  const pixelFetchBounds = useMemo(() => {
    if (!gridVisible || viewportSize.width === 0 || viewportSize.height === 0) {
      return null;
    }

    return {
      minX: Math.max(activeWorldBounds.minX, Math.floor(-fetchCamera.x / fetchCamera.zoom) - PIXEL_FETCH_MARGIN),
      maxX: Math.min(
        activeWorldBounds.maxX - 1,
        Math.ceil((viewportSize.width - fetchCamera.x) / fetchCamera.zoom) + PIXEL_FETCH_MARGIN,
      ),
      minY: Math.max(
        activeWorldBounds.minY,
        Math.floor((fetchCamera.y - viewportSize.height) / fetchCamera.zoom) - PIXEL_FETCH_MARGIN,
      ),
      maxY: Math.min(
        activeWorldBounds.maxY - 1,
        Math.ceil(fetchCamera.y / fetchCamera.zoom) + PIXEL_FETCH_MARGIN,
      ),
    };
  }, [
    activeWorldBounds.maxX,
    activeWorldBounds.maxY,
    activeWorldBounds.minX,
    activeWorldBounds.minY,
    fetchCamera.x,
    fetchCamera.y,
    fetchCamera.zoom,
    gridVisible,
    viewportSize.height,
    viewportSize.width,
  ]);

  const claimOutlineFetchBounds = useMemo(() => {
    if (
      viewportSize.width === 0 ||
      viewportSize.height === 0
    ) {
      return null;
    }

    if (focusedClaimOutlineAreaId !== null) {
      if (focusedClaimOutlineAreaBounds === null) {
        return null;
      }

      const focusedAreaBounds = {
        minX: Math.max(activeWorldBounds.minX, focusedClaimOutlineAreaBounds.min_x - 1),
        maxX: Math.min(activeWorldBounds.maxX - 1, focusedClaimOutlineAreaBounds.max_x + 1),
        minY: Math.max(activeWorldBounds.minY, focusedClaimOutlineAreaBounds.min_y - 1),
        maxY: Math.min(activeWorldBounds.maxY - 1, focusedClaimOutlineAreaBounds.max_y + 1),
      };

      if (
        focusedAreaBounds.minX > focusedAreaBounds.maxX ||
        focusedAreaBounds.minY > focusedAreaBounds.maxY
      ) {
        return null;
      }

      return focusedAreaBounds;
    }

    if (!semanticZoomMode || fetchWorldTileDetailScale !== 1) {
      return null;
    }

    const overscanWorldX = Math.ceil(
      (viewportSize.width / Math.max(fetchCamera.zoom, ABSOLUTE_MIN_ZOOM)) *
        CLAIM_OUTLINE_FETCH_OVERSCAN_VIEWPORT_FACTOR,
    );
    const overscanWorldY = Math.ceil(
      (viewportSize.height / Math.max(fetchCamera.zoom, ABSOLUTE_MIN_ZOOM)) *
        CLAIM_OUTLINE_FETCH_OVERSCAN_VIEWPORT_FACTOR,
    );

    const viewportBounds = {
      minX: Math.max(
        activeWorldBounds.minX,
        snapVisibleAreaMin(
          Math.floor(-fetchCamera.x / fetchCamera.zoom) - CLAIM_OUTLINE_FETCH_MARGIN - overscanWorldX,
        ),
      ),
      maxX: Math.min(
        activeWorldBounds.maxX - 1,
        snapVisibleAreaMax(
          Math.ceil((viewportSize.width - fetchCamera.x) / fetchCamera.zoom) +
            CLAIM_OUTLINE_FETCH_MARGIN +
            overscanWorldX,
        ),
      ),
      minY: Math.max(
        activeWorldBounds.minY,
        snapVisibleAreaMin(
          Math.floor((fetchCamera.y - viewportSize.height) / fetchCamera.zoom) -
            CLAIM_OUTLINE_FETCH_MARGIN -
            overscanWorldY,
        ),
      ),
      maxY: Math.min(
        activeWorldBounds.maxY - 1,
        snapVisibleAreaMax(
          Math.ceil(fetchCamera.y / fetchCamera.zoom) + CLAIM_OUTLINE_FETCH_MARGIN + overscanWorldY,
        ),
      ),
    };

    if (getWorldWindowCellCount(viewportBounds) > CLAIM_OUTLINE_MAX_FREE_FETCH_CELLS) {
      return null;
    }

    return viewportBounds;
  }, [
    activeWorldBounds.maxX,
    activeWorldBounds.maxY,
    activeWorldBounds.minX,
    activeWorldBounds.minY,
    fetchCamera.x,
    fetchCamera.y,
    fetchCamera.zoom,
    fetchWorldTileDetailScale,
    focusedClaimOutlineAreaBounds,
    focusedClaimOutlineAreaId,
    semanticZoomMode,
    viewportSize.height,
    viewportSize.width,
  ]);

  const visibleAreaPrefetchBounds = useMemo<VisibleAreaBounds | null>(() => {
    if (
      !semanticZoomMode ||
      viewportSize.width === 0 ||
      viewportSize.height === 0 ||
      fetchWorldTileDetailScale !== 1
    ) {
      return null;
    }

    const overscanWorldX = Math.ceil(
      (viewportSize.width / Math.max(fetchCamera.zoom, ABSOLUTE_MIN_ZOOM)) *
        VISIBLE_AREA_PREFETCH_OVERSCAN_VIEWPORT_FACTOR,
    );
    const overscanWorldY = Math.ceil(
      (viewportSize.height / Math.max(fetchCamera.zoom, ABSOLUTE_MIN_ZOOM)) *
        VISIBLE_AREA_PREFETCH_OVERSCAN_VIEWPORT_FACTOR,
    );
    const minX = Math.max(
      activeWorldBounds.minX,
      snapVisibleAreaMin(Math.floor(-fetchCamera.x / fetchCamera.zoom) - overscanWorldX),
    );
    const maxX = Math.min(
      activeWorldBounds.maxX - 1,
      snapVisibleAreaMax(Math.ceil((viewportSize.width - fetchCamera.x) / fetchCamera.zoom) + overscanWorldX),
    );
    const minY = Math.max(
      activeWorldBounds.minY,
      snapVisibleAreaMin(
        Math.floor((fetchCamera.y - viewportSize.height) / fetchCamera.zoom) - overscanWorldY,
      ),
    );
    const maxY = Math.min(
      activeWorldBounds.maxY - 1,
      snapVisibleAreaMax(Math.ceil(fetchCamera.y / fetchCamera.zoom) + overscanWorldY),
    );

    return {
      minX,
      maxX,
      minY,
      maxY,
      key: `${minX}:${minY}:${maxX}:${maxY}:${currentUser?.id ?? "guest"}`,
    };
  }, [
    activeWorldBounds.maxX,
    activeWorldBounds.maxY,
    activeWorldBounds.minX,
    activeWorldBounds.minY,
    currentUser?.id,
    fetchCamera.x,
    fetchCamera.y,
    fetchCamera.zoom,
    fetchWorldTileDetailScale,
    semanticZoomMode,
    viewportSize.height,
    viewportSize.width,
  ]);
  visibleAreaPrefetchBoundsRef.current = visibleAreaPrefetchBounds;

  const refreshVisiblePixelWindow = useCallback(async (options?: { force?: boolean }): Promise<void> => {
    if (pixelFetchBounds === null) {
      return;
    }

    const bounds = pixelFetchBounds;
    const requestKey = getFetchBoundsKey(bounds);
    const now = performance.now();
    const force = options?.force === true;
    const cacheHit = pixelFetchLastSuccessRef.current;

    if (!force) {
      if (pixelFetchKeyRef.current === requestKey) {
        return;
      }

      if (
        cacheHit !== null &&
        cacheHit.key === requestKey &&
        now - cacheHit.at < PIXEL_FETCH_REPEAT_CACHE_MS
      ) {
        return;
      }
    }

    pixelFetchAbortRef.current?.abort();
    const abortController = new AbortController();
    pixelFetchAbortRef.current = abortController;
    pixelFetchKeyRef.current = requestKey;
    const startedAt = now;
    markPerfEvent("pixel fetch start");
    emitDebugEvent(
      "network",
      "Pixel window fetch start",
      `${bounds.minX}:${bounds.minY} -> ${bounds.maxX}:${bounds.maxY}`,
    );
    const result = await fetchVisibleWorldPixels(
      bounds.minX,
      bounds.maxX,
      bounds.minY,
      bounds.maxY,
      abortController.signal,
    );

    if (abortController.signal.aborted) {
      return;
    }

    if (pixelFetchAbortRef.current === abortController) {
      pixelFetchAbortRef.current = null;
      if (pixelFetchKeyRef.current === requestKey) {
        pixelFetchKeyRef.current = null;
      }
    }
    pixelFetchLastSuccessRef.current = {
      key: requestKey,
      at: performance.now(),
    };

    measureDebugWork("Apply pixel window", () => {
      if (areWorldPixelsEqual(visiblePixelsRef.current, result.pixels)) {
        return false;
      }

      visiblePixelsRef.current = result.pixels;
      pixelIndexRef.current = new Map(result.pixels.map((pixel) => [`${pixel.x}:${pixel.y}`, pixel]));
      const claimContextPixels = result.pixels.map((pixel) => toClaimContextPixelRecord(pixel));
      claimContextPixelIndexRef.current = result.truncated
        ? mergeClaimContextPixels(claimContextPixelIndexRef.current, claimContextPixels)
        : syncClaimContextPixelsForWindow(
          claimContextPixelIndexRef.current,
          {
            minX: result.min_x,
            maxX: result.max_x,
            minY: result.min_y,
            maxY: result.max_y,
          },
          claimContextPixels,
        );
      syncSelectedPlacementStateRef.current(selectedPixelSnapshotRef.current);
      syncInspectedPixelRecordRef.current();
      return true;
    }, (applied) => `${result.pixels.length} pixels${applied ? "" : " unchanged"}`);
    markPerfEvent("pixel fetch done", `${result.pixels.length} pixels`);
    emitDebugEvent(
      "network",
      "Pixel window fetch done",
      `${result.pixels.length} pixels`,
      performance.now() - startedAt,
    );
  }, [pixelFetchBounds]);
  refreshVisiblePixelWindowRef.current = refreshVisiblePixelWindow;

  const clearClaimOutlinesImmediately = useCallback((): void => {
    claimOutlineFetchAbortRef.current?.abort();
    claimOutlineFetchAbortRef.current = null;
    claimOutlineFetchKeyRef.current = null;
    claimOutlineFetchLastSuccessRef.current = null;
    claimOutlineSegmentsRef.current = [];
    setClaimOutlineSegments((current) => current.length === 0 ? current : []);
  }, []);

  useEffect(() => {
    if (claimOutlineFocusRef.current === focusedClaimOutlineAreaId) {
      return;
    }

    claimOutlineFocusRef.current = focusedClaimOutlineAreaId;
    clearClaimOutlinesImmediately();
  }, [clearClaimOutlinesImmediately, focusedClaimOutlineAreaId]);

  const refreshClaimOutlineNow = useCallback(async (options?: { force?: boolean }): Promise<void> => {
    if (claimOutlineFetchBounds === null) {
      clearClaimOutlinesImmediately();
      return;
    }

    const bounds = claimOutlineFetchBounds;
    const requestKey = `${getFetchBoundsKey(bounds)}:${focusedClaimOutlineAreaPublicId ?? "active"}:${currentUser?.id ?? "guest"}`;
    const now = performance.now();
    const force = options?.force === true;
    const cacheHit = claimOutlineFetchLastSuccessRef.current;

    if (!force) {
      if (claimOutlineFetchKeyRef.current === requestKey) {
        return;
      }

      if (
        cacheHit !== null &&
        cacheHit.key === requestKey &&
        now - cacheHit.at < CLAIM_OUTLINE_FETCH_REPEAT_CACHE_MS
      ) {
        return;
      }
    }

    claimOutlineFetchAbortRef.current?.abort();
    const abortController = new AbortController();
    claimOutlineFetchAbortRef.current = abortController;
    claimOutlineFetchKeyRef.current = requestKey;
    const startedAt = now;
    markPerfEvent("claim outline fetch start");
    emitDebugEvent(
      "network",
      "Claim outline fetch start",
      `${bounds.minX}:${bounds.minY} -> ${bounds.maxX}:${bounds.maxY}`,
    );
    const result = await fetchClaimOutlinePixels(
      bounds.minX,
      bounds.maxX,
      bounds.minY,
      bounds.maxY,
      focusedClaimOutlineAreaPublicId,
      abortController.signal,
    );

    if (abortController.signal.aborted) {
      return;
    }

    if (claimOutlineFetchAbortRef.current === abortController) {
      claimOutlineFetchAbortRef.current = null;
      if (claimOutlineFetchKeyRef.current === requestKey) {
        claimOutlineFetchKeyRef.current = null;
      }
    }
    claimOutlineFetchLastSuccessRef.current = {
      key: requestKey,
      at: performance.now(),
    };

    measureDebugWork("Apply claim outline segments", () => {
      if (areClaimOutlineSegmentsEqual(claimOutlineSegmentsRef.current, result.segments)) {
        return false;
      }

      claimOutlineSegmentsRef.current = result.segments;
      setClaimOutlineSegments(result.segments);
      return true;
    }, (applied) => `${result.segments.length} segments${applied ? "" : " unchanged"}`);
    markPerfEvent("claim outline fetch done", `${result.segments.length} segments`);
    emitDebugEvent(
      "network",
      "Claim outline fetch done",
      `${result.segments.length} segments`,
      performance.now() - startedAt,
    );
  }, [
    claimOutlineFetchBounds,
    clearClaimOutlinesImmediately,
    currentUser?.id,
    focusedClaimOutlineAreaPublicId,
  ]);
  refreshClaimOutlineNowRef.current = refreshClaimOutlineNow;

  useEffect(() => {
    if (pixelFetchBounds === null) {
      pixelFetchAbortRef.current?.abort();
      pixelFetchAbortRef.current = null;
      pixelFetchKeyRef.current = null;
      return;
    }

    let cancelled = false;
    const fetchGeneration = cameraFetchGenerationRef.current;
    markPerfEvent(
      "pixel fetch scheduled",
      `${pixelFetchBounds.minX}:${pixelFetchBounds.minY} -> ${pixelFetchBounds.maxX}:${pixelFetchBounds.maxY}`,
    );
    const fetchDelay = buildPanelOpen && activeBuildMode === "paint" ? 30 : PIXEL_FETCH_DEBOUNCE_MS;
    const fetchTimeout = window.setTimeout(async () => {
      if (!cancelled && fetchGeneration === cameraFetchGenerationRef.current) {
        await refreshVisiblePixelWindow();
      }
    }, fetchDelay);

    return () => {
      cancelled = true;
      window.clearTimeout(fetchTimeout);
      pixelFetchAbortRef.current?.abort();
      pixelFetchAbortRef.current = null;
      pixelFetchKeyRef.current = null;
    };
  }, [activeBuildMode, buildPanelOpen, pixelFetchBounds, refreshVisiblePixelWindow]);

  useEffect(() => {
    if (claimOutlineFetchBounds === null) {
      claimOutlineFetchAbortRef.current?.abort();
      claimOutlineFetchAbortRef.current = null;
      claimOutlineFetchKeyRef.current = null;
      claimOutlineSegmentsRef.current = [];
      setClaimOutlineSegments((current) => current.length === 0 ? current : []);
      return;
    }

    let cancelled = false;
    const fetchGeneration = cameraFetchGenerationRef.current;
    markPerfEvent(
      "claim outline fetch scheduled",
      `${claimOutlineFetchBounds.minX}:${claimOutlineFetchBounds.minY} -> ${claimOutlineFetchBounds.maxX}:${claimOutlineFetchBounds.maxY}`,
    );
    const fetchTimeout = window.setTimeout(async () => {
      if (!cancelled && fetchGeneration === cameraFetchGenerationRef.current) {
        await refreshClaimOutlineNow();
      }
    }, CLAIM_OUTLINE_FETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(fetchTimeout);
      claimOutlineFetchAbortRef.current?.abort();
      claimOutlineFetchAbortRef.current = null;
      claimOutlineFetchKeyRef.current = null;
    };
  }, [claimOutlineFetchBounds, refreshClaimOutlineNow]);

  useEffect(() => {
    return () => {
      pixelFetchAbortRef.current?.abort();
      pixelFetchKeyRef.current = null;
      claimOutlineFetchAbortRef.current?.abort();
      claimOutlineFetchKeyRef.current = null;
      if (worldRealtimeRefreshTimerRef.current !== null) {
        window.clearTimeout(worldRealtimeRefreshTimerRef.current);
        worldRealtimeRefreshTimerRef.current = null;
      }
    };
  }, []);

  const pendingClaimPixelMap = useMemo(
    () => measureDebugWork(
      "Build pending claim index",
      () => buildPendingClaimPixelMap(pendingClaimPixels),
      `${pendingClaimPixels.length} pixels`,
    ),
    [pendingClaimPixels],
  );
  pendingClaimPixelsRef.current = pendingClaimPixels;
  pendingClaimPixelMapRef.current = pendingClaimPixelMap;
  pendingClaimRectanglesRef.current = pendingClaimRectangles;
  pendingPaintsRef.current = pendingPaints;

  const syncPendingClaims = useCallback((
    nextPixels: PixelCoordinate[],
    nextRectangles: PendingClaimRectangle[],
  ): void => {
    pendingClaimPixelsRef.current = nextPixels;
    pendingClaimPixelMapRef.current = measureDebugWork(
      "Sync pending claim index",
      () => buildPendingClaimPixelMap(nextPixels),
      `${nextPixels.length} pixels, ${nextRectangles.length} rectangles`,
    );
    pendingClaimRectanglesRef.current = nextRectangles;
    setPendingClaimPixels(nextPixels);
    setPendingClaimRectangles(nextRectangles);
  }, []);

  const syncPendingPaints = useCallback((
    nextPaints: PendingPaint[],
    nextPaintMap?: Map<string, PendingPaint>,
  ): void => {
    pendingPaintsRef.current = nextPaints;
    pendingPaintMapRef.current = nextPaintMap ?? measureDebugWork(
      "Sync pending paint index",
      () => buildPendingPaintMap(nextPaints),
      `${nextPaints.length} pixels`,
    );
    setPendingPaints(nextPaints);
  }, []);

  const isPixelInsideActiveWorld = useCallback((pixel: PixelCoordinate | null): boolean => {
    if (pixel === null) {
      return false;
    }

    const bounds = activeWorldBoundsRef.current;

    if (bounds === null) {
      return false;
    }

    return isPixelInsideActiveWorldBounds(pixel, bounds, activeChunksRef.current);
  }, []);

  const removePendingPaintAtPixel = useCallback((
    targetPixel: PixelCoordinate,
    options?: { quiet?: boolean; updateSelection?: boolean },
  ): boolean => {
    if (!isPixelInsideActiveWorld(targetPixel)) {
      if (!options?.quiet) {
        setPlacementMessage({
          tone: "error",
          text: "This cell is outside the active world.",
        });
      }
      return false;
    }

    if (options?.updateSelection !== false) {
      setSelectedPixel((current) => (
        current !== null && current.x === targetPixel.x && current.y === targetPixel.y
          ? current
          : targetPixel
      ));
    }

    const targetKey = getPixelKey(targetPixel);
    const hasPendingPaint = pendingPaintMapRef.current.has(targetKey);

    if (!hasPendingPaint) {
      if (!options?.quiet) {
        setPlacementMessage({
          tone: "info",
          text: "No local Color Pixel change to erase here.",
        });
      }
      return false;
    }

    const nextPaints = pendingPaintsRef.current.filter((paint) => getPixelKey(paint) !== targetKey);
    const nextPaintMap = new Map(pendingPaintMapRef.current);
    nextPaintMap.delete(targetKey);
    syncPendingPaints(nextPaints, nextPaintMap);

    if (!options?.quiet) {
      setPlacementMessage({
        tone: "info",
        text: "Local Color Pixel change erased.",
      });
    }

    return true;
  }, [isPixelInsideActiveWorld, syncPendingPaints]);

  const cacheClaimAreaPreview = useCallback((area: ClaimAreaPreview): ClaimAreaRecord => {
    const cachedDetail = claimAreaDetailCacheRef.current.get(area.id) ?? null;
    const cachedPreview = claimAreaCacheRef.current.get(area.id) ?? null;
    const preservedBounds = area.bounds ?? cachedDetail?.bounds ?? cachedPreview?.bounds ?? null;
    const areaWithBounds = preservedBounds === area.bounds ? area : { ...area, bounds: preservedBounds };
    const nextArea: ClaimAreaRecord = cachedDetail
      ? {
        ...cachedDetail,
        ...areaWithBounds,
        contributors: cachedDetail.contributors,
      }
      : areaWithBounds;
    const cache = claimAreaCacheRef.current;
    cache.delete(area.id);
    cache.set(area.id, nextArea);

    if (cache.size > CLAIM_AREA_CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }

    if (nextArea.status === "active" && nextArea.viewer_can_paint) {
      knownPaintableAreaIdsRef.current.add(nextArea.id);
    } else {
      knownPaintableAreaIdsRef.current.delete(nextArea.id);
    }

    return nextArea;
  }, []);

  const cacheClaimAreaSummary = useCallback((area: ClaimAreaSummary): ClaimAreaSummary => {
    claimAreaDetailCacheRef.current.set(area.id, area);
    return cacheClaimAreaPreview(area) as ClaimAreaSummary;
  }, [cacheClaimAreaPreview]);

  const getCachedClaimArea = useCallback((areaId: string): ClaimAreaRecord | null => {
    return claimAreaDetailCacheRef.current.get(areaId) ?? claimAreaCacheRef.current.get(areaId) ?? null;
  }, []);

  const handleTileLoaded = useCallback((layer: DebugTileLayer, tileKey: string, nextSrc: string): void => {
    retainedTileSrcRef.current[layer].set(tileKey, nextSrc);
  }, []);

  const handleTileDebugSignal = useCallback((signal: DebugTileSignal): void => {
    const tileStateMap = debugTileStatesRef.current[signal.layer];
    const existingState = tileStateMap.get(signal.tileKey) ?? null;
    const nextState: DebugTileState = {
      loaded: signal.phase === "load" || (
        signal.phase === "src" &&
        existingState?.loaded === true &&
        existingState.src === signal.src
      ),
      failed: signal.phase === "error",
      detailScale: signal.detailScale,
      hasFallback: signal.hasFallback,
      src: signal.src,
      updatedAt: performance.now(),
    };

    tileStateMap.set(signal.tileKey, nextState);

    if (signal.phase === "src") {
      emitDebugEvent(
        "tile",
        `${signal.layer} tile request`,
        `${signal.tileKey} (${signal.detailScale === 1 ? "detail" : `low x${signal.detailScale}`})${signal.hasFallback ? " with fallback" : ""}`,
      );
      return;
    }

    emitDebugEvent(
      signal.phase === "load" ? "tile" : "warning",
      signal.phase === "load" ? `${signal.layer} tile loaded` : `${signal.layer} tile failed`,
      `${signal.tileKey}${signal.duration ? ` in ${formatPerfTime(signal.duration)}` : ""}`,
      signal.duration,
    );
  }, []);

  const buildDebugTileLayerSnapshot = useCallback((layer: DebugTileLayer): DebugTileLayerSnapshot => {
    const activeTiles = debugActiveTilesRef.current[layer];
    const tileStateMap = debugTileStatesRef.current[layer];
    let loaded = 0;
    let failed = 0;
    let fallbackVisible = 0;

    for (const [tileKey, meta] of activeTiles) {
      const state = tileStateMap.get(tileKey);

      if (state?.failed) {
        failed += 1;
      }

      if (state?.loaded) {
        loaded += 1;
      } else if (state?.hasFallback ?? meta.hasFallback) {
        fallbackVisible += 1;
      }
    }

    return {
      active: activeTiles.size,
      loaded,
      loading: Math.max(0, activeTiles.size - loaded - failed),
      failed,
      fallbackVisible,
    };
  }, []);

  const getDebugWorldSnapshot = useCallback((): DebugWorldSnapshot => {
    const selectedPixelSnapshot = selectedPixelSnapshotRef.current;
    const inspectedPixelSnapshot = inspectedPixelSnapshotRef.current;
    const primaryRenderedTile = renderedWorldTilesRef.current[0] ?? null;

    return {
      zoom: zoomRef.current,
      cameraX: cameraRef.current.x,
      cameraY: cameraRef.current.y,
      growth: world.growth,
      layerMode: semanticZoomModeRef.current ? "semantic" : "visual",
      tileDetailScale: primaryRenderedTile?.detailScale ?? null,
      renderedTiles: renderedWorldTilesRef.current.length,
      visiblePixels: visiblePixelsRef.current.length,
      claimOutlineSegments: claimOutlineSegmentsRef.current.length,
      pendingClaims: getPendingClaimCount(
        pendingClaimPixelsRef.current,
        pendingClaimRectanglesRef.current,
      ),
      pendingPaints: pendingPaintsRef.current.length,
      selectedPixel: selectedPixelSnapshot ? getPixelKey(selectedPixelSnapshot) : null,
      inspectedPixel: inspectedPixelSnapshot ? getPixelKey(inspectedPixelSnapshot) : null,
      selectedAreaId: selectedAreaSnapshotRef.current?.id ?? null,
      buildPanelOpen: buildPanelOpenRef.current,
      areaPanelBusy: areaPanelBusyRef.current,
      areaDetailsBusy: areaDetailsBusyRef.current,
      rectanglePlacementBusy: rectanglePlacementBusyRef.current,
      visual: buildDebugTileLayerSnapshot("visual"),
      claims: buildDebugTileLayerSnapshot("claims"),
      paint: buildDebugTileLayerSnapshot("paint"),
    };
  }, [buildDebugTileLayerSnapshot, world.growth]);

  const markWorldTilesDirty = useCallback((
    tiles: Array<{ tile_x: number; tile_y: number }>,
  ): void => {
    if (tiles.length === 0) {
      return;
    }

    emitDebugEvent(
      "action",
      "visual tile revisions bumped",
      `${tiles.length} dirty tile coordinate${tiles.length === 1 ? "" : "s"}`,
    );

    setVisualTileRevisions((current) => {
      const next = { ...current };
      const dirtyKeys = new Set<string>();

      for (const tile of tiles) {
        dirtyKeys.add(getWorldTileKey(tile.tile_x, tile.tile_y));
        dirtyKeys.add(getWorldTileKey(
          getLowWorldTileCoordinate(tile.tile_x),
          getLowWorldTileCoordinate(tile.tile_y),
          WORLD_LOW_TILE_DETAIL_SCALE,
        ));
      }

      for (const tileKey of dirtyKeys) {
        next[tileKey] = (next[tileKey] ?? 0) + 1;
      }

      return next;
    });
  }, []);

  const syncVisibleAreaPreviewWindow = useCallback((
    areas: ClaimAreaPreview[],
  ): void => {
    const nextAreaMap = new Map<string, ClaimAreaRecord>();

    for (const area of areas) {
      const cachedArea = cacheClaimAreaPreview(area);
      nextAreaMap.set(cachedArea.id, cachedArea);
    }

    const currentSelectedArea = selectedAreaSnapshotRef.current;

    if (currentSelectedArea !== null) {
      const nextSelectedArea = nextAreaMap.get(currentSelectedArea.id) ?? null;

      if (
        nextSelectedArea !== null &&
        buildAreaSelectionSignature(nextSelectedArea) !== buildAreaSelectionSignature(currentSelectedArea)
      ) {
        applyAreaSelection(nextSelectedArea, { syncDrafts: false });
      }
    }
  }, [
    applyAreaSelection,
    cacheClaimAreaPreview,
  ]);

  const fetchVisibleAreaPreviewWindow = useCallback(async (
    bounds: VisibleAreaBounds,
    triggerLiveRefresh: boolean,
  ): Promise<void> => {
    const startedAt = performance.now();
    const existingRequestKey = visibleAreaFetchKeyRef.current;
    const cacheHit = visibleAreaLastSuccessRef.current;
    const requestKey = bounds.key;

    if (existingRequestKey === requestKey) {
      return;
    }

    if (
      !triggerLiveRefresh &&
      cacheHit !== null &&
      cacheHit.key === bounds.key &&
      startedAt - cacheHit.at < VISIBLE_AREA_PREFETCH_CACHE_MS
    ) {
      return;
    }

    visibleAreaFetchAbortRef.current?.abort();
    const abortController = new AbortController();
    visibleAreaFetchAbortRef.current = abortController;
    visibleAreaFetchKeyRef.current = requestKey;
    markPerfEvent(
      triggerLiveRefresh ? "visible area poll start" : "visible area prefetch start",
      bounds.key,
    );
    emitDebugEvent(
      "network",
      triggerLiveRefresh ? "Visible area poll start" : "Visible area prefetch start",
      bounds.key,
    );

    const result = await fetchVisibleClaimAreaPreviews(
      bounds.minX,
      bounds.maxX,
      bounds.minY,
      bounds.maxY,
      abortController.signal,
    );

    if (abortController.signal.aborted) {
      if (visibleAreaFetchAbortRef.current === abortController) {
        visibleAreaFetchAbortRef.current = null;
      }
      if (visibleAreaFetchAbortRef.current === null && visibleAreaFetchKeyRef.current === requestKey) {
        visibleAreaFetchKeyRef.current = null;
      }
      return;
    }

    if (visibleAreaFetchAbortRef.current === abortController) {
      visibleAreaFetchAbortRef.current = null;
      if (visibleAreaFetchKeyRef.current === requestKey) {
        visibleAreaFetchKeyRef.current = null;
      }
    }

    if (!result.ok) {
      if (result.error !== "Visible area preview request aborted.") {
        markPerfEvent("visible area prefetch failed", result.error ?? bounds.key);
        emitDebugEvent(
          "warning",
          "Visible area request failed",
          result.error ?? bounds.key,
          performance.now() - startedAt,
        );
      }
      return;
    }

    measureDebugWork(
      "Apply visible area previews",
      () => syncVisibleAreaPreviewWindow(result.window.areas),
      `${result.window.areas.length} areas`,
    );
    visibleAreaLastSuccessRef.current = {
      key: bounds.key,
      at: performance.now(),
    };
    markPerfEvent(
      triggerLiveRefresh ? "visible area poll done" : "visible area prefetch done",
      `${bounds.key} -> ${result.window.areas.length}`,
    );
    emitDebugEvent(
      "network",
      triggerLiveRefresh ? "Visible area poll done" : "Visible area prefetch done",
      `${result.window.areas.length} areas`,
      performance.now() - startedAt,
    );
  }, [syncVisibleAreaPreviewWindow]);
  fetchVisibleAreaPreviewWindowRef.current = fetchVisibleAreaPreviewWindow;

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
    const pixelMap = pixelIndexRef.current;
    const pendingClaimPixelMap = pendingClaimPixelMapRef.current;
    const pendingClaimRectangles = pendingClaimRectanglesRef.current;
    const pendingPaintsMap = pendingPaintMapRef.current;
    const nextUser = currentUserRef.current;
    const activeClaimMode = claimAreaModeRef.current;
    const activeClaimTargetAreaId = claimTargetAreaIdRef.current;
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

    const isInsideWorld = isPixelInsideActiveWorld(pixel);
    const pixelRecord = pixelMap.get(pixelKey) ?? null;
    const isPendingClaim = hasPendingClaimAtPixel(pixel, pendingClaimPixelMap, pendingClaimRectangles);
    const pendingPaint = pendingPaintsMap.get(pixelKey) ?? null;

    if (
      nextUser === null ||
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
      !isPendingClaim &&
      pixelRecord !== null &&
      !pixelRecord.is_starter &&
      pixelRecord.area_id !== null &&
      knownPaintableAreaIdsRef.current.has(pixelRecord.area_id);
    let canClaim = false;

    if (!semanticZoomModeRef.current) {
      return {
        pixelRecord,
        isInsideWorld,
        canClaim: false,
        canPaint,
        isPendingClaim,
        pendingPaint,
      };
    }

    if (pixelRecord === null && !isPendingClaim) {
      if (activeClaimMode === "new" && !canStartNewAreaRef.current) {
        return {
          pixelRecord,
          isInsideWorld,
          canClaim: false,
          canPaint,
          isPendingClaim,
          pendingPaint,
        };
      }

      if (activeClaimMode === "expand" && activeClaimTargetAreaId === null) {
        return {
          pixelRecord,
          isInsideWorld,
          canClaim: false,
          canPaint,
          isPendingClaim,
          pendingPaint,
        };
      }

      const neighborPixels = [
        { x: pixel.x - 1, y: pixel.y },
        { x: pixel.x + 1, y: pixel.y },
        { x: pixel.x, y: pixel.y - 1 },
        { x: pixel.x, y: pixel.y + 1 },
      ];
      canClaim = neighborPixels.some((neighborPixel) => {
        if (hasPendingClaimAtPixel(neighborPixel, pendingClaimPixelMap, pendingClaimRectangles)) {
          return true;
        }

        const neighborKey = getPixelKey(neighborPixel);
        const neighbor = pixelMap.get(neighborKey);

        if (!neighbor) {
          return false;
        }

        if (activeClaimMode === "expand") {
          return neighbor.owner_user_id === nextUser.id && neighbor.area_id === activeClaimTargetAreaId;
        }

        return neighbor.is_starter || neighbor.owner_user_id !== null;
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
  }, [isPixelInsideActiveWorld]);

  const syncSelectedPlacementState = useCallback((pixel: PixelCoordinate | null): void => {
    const nextState = getPlacementState(pixel);

    setSelectedPlacementState((current) => (
      arePlacementStatesEqual(current, nextState) ? current : nextState
    ));
  }, [getPlacementState]);

  const syncInspectedPixelRecord = useCallback((): void => {
    const inspectedPixelValue = inspectedPixelSnapshotRef.current;
    const nextPixelRecord = inspectedPixelValue === null
      ? null
      : pixelIndexRef.current.get(getPixelKey(inspectedPixelValue)) ?? null;

    setInspectedPixelRecord((current) => (
      areWorldPixelRecordsEqual(current, nextPixelRecord) ? current : nextPixelRecord
    ));
  }, []);

  syncSelectedPlacementStateRef.current = syncSelectedPlacementState;
  syncInspectedPixelRecordRef.current = syncInspectedPixelRecord;

  const mergeFetchedPixelsIntoVisibleWindow = useCallback((
    fetchedPixels: WorldPixel[],
    bounds: Pick<VisibleAreaBounds, "minX" | "maxX" | "minY" | "maxY">,
    truncated: boolean,
    debugLabel: string,
  ): boolean => {
    return measureDebugWork(debugLabel, () => {
      const next = mergeWorldPixels(visiblePixelsRef.current, fetchedPixels);

      if (next === visiblePixelsRef.current) {
        return false;
      }

      visiblePixelsRef.current = next;
      pixelIndexRef.current = new Map(next.map((pixel) => [getPixelKey(pixel), pixel]));
      const claimContextPixels = fetchedPixels.map((pixel) => toClaimContextPixelRecord(pixel));
      claimContextPixelIndexRef.current = truncated
        ? mergeClaimContextPixels(claimContextPixelIndexRef.current, claimContextPixels)
        : syncClaimContextPixelsForWindow(
          claimContextPixelIndexRef.current,
          bounds,
          claimContextPixels,
        );
      syncSelectedPlacementStateRef.current(selectedPixelSnapshotRef.current);
      syncInspectedPixelRecordRef.current();
      return true;
    }, (applied) => `${fetchedPixels.length} fetched, ${visiblePixelsRef.current.length} current${applied ? "" : " unchanged"}`);
  }, []);

  const mergeFetchedPixelsIntoClaimContext = useCallback((
    fetchedPixels: ClaimContextPixelRecord[],
    debugLabel: string,
  ): boolean => {
    return measureDebugWork(debugLabel, () => {
      const next = mergeClaimContextPixels(claimContextPixelIndexRef.current, fetchedPixels);

      if (next === claimContextPixelIndexRef.current) {
        return false;
      }

      claimContextPixelIndexRef.current = next;
      return true;
    }, (applied) => `${fetchedPixels.length} fetched, ${claimContextPixelIndexRef.current.size} current${applied ? "" : " unchanged"}`);
  }, []);

  const hydrateClaimRectanglePixelWindow = useCallback(async (
    rectangle: PendingClaimRectangle,
  ): Promise<{ pixelCount: number; truncated: boolean }> => {
    const bounds = activeWorldBoundsRef.current;

    if (bounds === null) {
      return { pixelCount: 0, truncated: false };
    }

    const fetchBounds = getClaimRectangleFetchBounds(rectangle, bounds);
    const startedAt = performance.now();
    emitDebugEvent(
      "network",
      "Rectangle claim fetch start",
      `${fetchBounds.minX}:${fetchBounds.minY} -> ${fetchBounds.maxX}:${fetchBounds.maxY}`,
    );
    const result = await fetchClaimContextPixels(
      fetchBounds.minX,
      fetchBounds.maxX,
      fetchBounds.minY,
      fetchBounds.maxY,
    );

    mergeFetchedPixelsIntoClaimContext(result.pixels, "Apply rectangle claim fetch");
    emitDebugEvent(
      "network",
      "Rectangle claim fetch done",
      `${result.pixels.length} pixels${result.truncated ? " (truncated)" : ""}`,
      performance.now() - startedAt,
    );

    return {
      pixelCount: result.pixels.length,
      truncated: result.truncated,
    };
  }, [mergeFetchedPixelsIntoClaimContext]);

  const prefetchRectangleAnchorWindow = useCallback(async (
    anchor: PixelCoordinate,
  ): Promise<void> => {
    const nextUser = currentUserRef.current;
    const bounds = activeWorldBoundsRef.current;

    if (nextUser === null || bounds === null) {
      return;
    }

    const activeClaimMode = claimAreaModeRef.current;
    const activeClaimTargetAreaId = claimTargetAreaIdRef.current;
    const anchorRectangle = createPendingClaimRectangle(anchor, anchor);
    const anchorEvaluation = evaluateClaimRectanglePlacement({
      rectangle: anchorRectangle,
      pixelMap: claimContextPixelIndexRef.current,
      bounds,
      activeChunks: activeChunksRef.current,
      pendingClaimPixelMap: pendingClaimPixelMapRef.current,
      pendingClaimRectangles: pendingClaimRectanglesRef.current,
      activeClaimMode,
      activeClaimTargetAreaId,
      currentUserId: nextUser.id,
      startPixel: anchor,
    });

    if (
      anchorEvaluation.blockedReason !== null ||
      anchorEvaluation.touchesClaimRoute ||
      anchorEvaluation.unresolvedNeighborCount === 0
    ) {
      emitDebugEvent(
        "action",
        "Rectangle anchor prefetch skipped",
        anchorEvaluation.blockedReason
          ? `${anchor.x}:${anchor.y}; ${anchorEvaluation.blockedReason}`
          : `${anchor.x}:${anchor.y}; resolved locally`,
      );
      return;
    }

    const fetchBounds = getRectangleAnchorPrefetchBounds(anchor, bounds);
    const requestKey = `${fetchBounds.minX}:${fetchBounds.minY}:${fetchBounds.maxX}:${fetchBounds.maxY}`;

    if (rectangleAnchorPrefetchKeyRef.current === requestKey) {
      emitDebugEvent("action", "Rectangle anchor prefetch skipped", `${requestKey}; already running`);
      return;
    }

    rectangleAnchorPrefetchAbortRef.current?.abort();
    const abortController = new AbortController();
    rectangleAnchorPrefetchAbortRef.current = abortController;
    rectangleAnchorPrefetchKeyRef.current = requestKey;
    const startedAt = performance.now();

    emitDebugEvent(
      "network",
      "Rectangle anchor prefetch start",
      `${requestKey}; unresolved neighbors ${anchorEvaluation.unresolvedNeighborCount}`,
    );

    try {
      const result = await fetchClaimContextPixels(
        fetchBounds.minX,
        fetchBounds.maxX,
        fetchBounds.minY,
        fetchBounds.maxY,
        abortController.signal,
      );

      if (abortController.signal.aborted) {
        return;
      }

      mergeFetchedPixelsIntoClaimContext(result.pixels, "Apply rectangle anchor prefetch");
      emitDebugEvent(
        "network",
        "Rectangle anchor prefetch done",
        `${result.pixels.length} pixels${result.truncated ? " (truncated)" : ""}`,
        performance.now() - startedAt,
      );
    } finally {
      if (rectangleAnchorPrefetchAbortRef.current === abortController) {
        rectangleAnchorPrefetchAbortRef.current = null;
      }

      if (rectangleAnchorPrefetchKeyRef.current === requestKey) {
        rectangleAnchorPrefetchKeyRef.current = null;
      }
    }
  }, [mergeFetchedPixelsIntoClaimContext]);

  useEffect(() => {
    syncSelectedPlacementState(selectedPixel);
  }, [
    activeChunks,
    activeWorldBounds.maxX,
    activeWorldBounds.maxY,
    activeWorldBounds.minX,
    activeWorldBounds.minY,
    canStartNewArea,
    claimAreaMode,
    claimTargetAreaId,
    pendingClaimPixels,
    pendingClaimRectangles,
    pendingPaints,
    selectedPixel,
    semanticZoomMode,
    syncSelectedPlacementState,
    currentUser?.id,
  ]);

  const selectedPixelRecord = selectedPlacementState.pixelRecord;
  const selectedPendingPaint = selectedPlacementState.pendingPaint;
  const canFetchSelectedPixelRecord = semanticZoomMode && (
    activeBuildMode !== "paint" ||
    selectedPendingPaint === null
  );

  useEffect(() => {
    if (selectedArea !== null) {
      if (isClaimAreaSummary(selectedArea)) {
        cacheClaimAreaSummary(selectedArea);
      } else {
        cacheClaimAreaPreview(selectedArea);
      }
    }
  }, [cacheClaimAreaPreview, cacheClaimAreaSummary, selectedArea]);

  useEffect(() => {
    return () => {
      areaInspectionAbortRef.current?.abort();
      areaDetailsAbortRef.current?.abort();
      visibleAreaFetchAbortRef.current?.abort();
      visibleAreaFetchKeyRef.current = null;
      selectedPixelFetchAbortRef.current?.abort();
      rectangleAnchorPrefetchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (visibleAreaPrefetchBounds === null) {
      return;
    }

    let cancelled = false;
    const bounds = visibleAreaPrefetchBounds;
    const fetchGeneration = cameraFetchGenerationRef.current;
    const fetchTimeout = window.setTimeout(() => {
      if (!cancelled && fetchGeneration === cameraFetchGenerationRef.current) {
        void fetchVisibleAreaPreviewWindow(bounds, false);
      }
    }, VISIBLE_AREA_PREFETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(fetchTimeout);
    };
  }, [fetchVisibleAreaPreviewWindow, visibleAreaPrefetchBounds]);

  useEffect(() => {
    if (visibleAreaPrefetchBounds === null) {
      return;
    }

    const bounds = visibleAreaPrefetchBounds;
    const fetchGeneration = cameraFetchGenerationRef.current;
    const pollVisibleAreas = (): void => {
      if (!document.hidden && fetchGeneration === cameraFetchGenerationRef.current) {
        void fetchVisibleAreaPreviewWindow(bounds, true);
      }
    };

    const intervalId = window.setInterval(pollVisibleAreas, VISIBLE_AREA_POLL_INTERVAL_MS);
    const handleVisibilityChange = (): void => {
      if (!document.hidden && fetchGeneration === cameraFetchGenerationRef.current) {
        void fetchVisibleAreaPreviewWindow(bounds, true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchVisibleAreaPreviewWindow, visibleAreaPrefetchBounds]);

  useEffect(() => {
    let closed = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const scheduleRealtimeRefresh = (source: string): void => {
      if (worldRealtimeRefreshTimerRef.current !== null) {
        return;
      }

      worldRealtimeRefreshTimerRef.current = window.setTimeout(() => {
        worldRealtimeRefreshTimerRef.current = null;

        void (async () => {
          const startedAt = performance.now();
          const visibleAreaBounds = visibleAreaPrefetchBoundsRef.current;

          emitDebugEvent("network", "Realtime world refresh start", source);
          const refreshes: Promise<unknown>[] = [
            refreshVisiblePixelWindowRef.current({ force: true }),
            refreshClaimOutlineNowRef.current({ force: true }),
            fetchWorldOverview().then((nextWorld) => setWorld(nextWorld)),
          ];

          if (visibleAreaBounds !== null) {
            refreshes.push(fetchVisibleAreaPreviewWindowRef.current(visibleAreaBounds, true));
          }

          if (currentUserRef.current !== null) {
            refreshes.push(refreshOwnedAreasRef.current({ showLoading: false }));
            refreshes.push(refreshAuthStatusRef.current(false));
          }

          const results = await Promise.allSettled(refreshes);
          const failedCount = results.filter((result) => result.status === "rejected").length;

          emitDebugEvent(
            failedCount > 0 ? "warning" : "network",
            failedCount > 0 ? "Realtime world refresh partially failed" : "Realtime world refresh done",
            `${failedCount} failed refresh${failedCount === 1 ? "" : "es"}`,
            performance.now() - startedAt,
          );
        })();
      }, 80);
    };

    const connect = (): void => {
      if (closed) {
        return;
      }

      socket = new WebSocket(getWorldRealtimeUrl());

      socket.onopen = () => {
        emitDebugEvent("network", "Realtime world socket connected", "world/live");
      };

      socket.onmessage = (event) => {
        let payload: unknown;

        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (!isWorldRealtimeUpdate(payload)) {
          return;
        }

        const dirtyTiles = getRealtimeDirtyTiles(payload);

        if (dirtyTiles.length > 0) {
          markWorldTilesDirty(dirtyTiles);
        }

        scheduleRealtimeRefresh(payload.source);
      };

      socket.onclose = () => {
        socket = null;

        if (closed) {
          return;
        }

        emitDebugEvent("warning", "Realtime world socket closed", "reconnecting");
        reconnectTimer = window.setTimeout(connect, 2000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closed = true;

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
  }, [markWorldTilesDirty]);

  useEffect(() => {
    if (selectedArea === null || isClaimAreaSummary(selectedArea)) {
      areaDetailsAbortRef.current?.abort();
      areaDetailsAbortRef.current = null;
      setAreaDetailsBusy(false);
      return;
    }

    const cachedArea = claimAreaDetailCacheRef.current.get(selectedArea.id) ?? null;

    if (cachedArea !== null) {
      applyAreaSelection(cachedArea, { syncDrafts: false });
      setAreaDetailsBusy(false);
      return;
    }

    const abortController = new AbortController();
    areaDetailsAbortRef.current?.abort();
    areaDetailsAbortRef.current = abortController;
    setAreaDetailsBusy(true);
    markPerfEvent("area detail hydrate start", selectedArea.id);

    void fetchClaimArea(selectedArea.id, abortController.signal).then((result) => {
      if (abortController.signal.aborted) {
        return;
      }

      areaDetailsAbortRef.current = null;
      setAreaDetailsBusy(false);

      if (!result.ok || result.area === null) {
        if (result.error === "Area request aborted.") {
          return;
        }

        setAreaMessage((currentMessage) => currentMessage ?? {
          tone: "error",
          text: result.error ?? "Area details could not be loaded.",
        });
        return;
      }

      const cachedSummary = cacheClaimAreaSummary(result.area);

      if (selectedArea.id === cachedSummary.id) {
        applyAreaSelection(cachedSummary, { syncDrafts: false });
      }

      markPerfEvent("area detail hydrate done", cachedSummary.id);
    });

    return () => {
      abortController.abort();
    };
  }, [
    applyAreaSelection,
    cacheClaimAreaSummary,
    selectedArea,
  ]);

  useEffect(() => {
    if (selectedPixel === null || !canFetchSelectedPixelRecord || selectedPixelRecord !== null) {
      return;
    }

    const isInsideWorld = isPixelInsideActiveWorldBounds(selectedPixel, activeWorldBounds, activeChunks);

    if (!isInsideWorld) {
      return;
    }

    let abortController: AbortController | null = null;
    let cancelled = false;
    const pixelKey = getPixelKey(selectedPixel);
    const now = performance.now();

    for (const [missedPixelKey, missedAt] of selectedPixelFetchMissesRef.current.entries()) {
      if (now - missedAt >= SELECTED_PIXEL_FETCH_MISS_COOLDOWN_MS) {
        selectedPixelFetchMissesRef.current.delete(missedPixelKey);
      }
    }

    const missedAt = selectedPixelFetchMissesRef.current.get(pixelKey);

    if (
      selectedPixelFetchKeyRef.current === pixelKey ||
      (missedAt !== undefined &&
        performance.now() - missedAt < SELECTED_PIXEL_FETCH_MISS_COOLDOWN_MS)
    ) {
      return;
    }

    selectedPixelFetchKeyRef.current = pixelKey;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      selectedPixelFetchAbortRef.current?.abort();
      abortController = new AbortController();
      selectedPixelFetchAbortRef.current = abortController;
      markPerfEvent("selected pixel fetch start", pixelKey);

      void fetchVisibleWorldPixels(
        selectedPixel.x,
        selectedPixel.x,
        selectedPixel.y,
        selectedPixel.y,
        abortController.signal,
      ).then((result) => {
        if (abortController?.signal.aborted) {
          return;
        }

        if (selectedPixelFetchAbortRef.current === abortController) {
          selectedPixelFetchAbortRef.current = null;
        }

        if (selectedPixelFetchKeyRef.current === pixelKey) {
          selectedPixelFetchKeyRef.current = null;
        }

        if (cancelled) {
          return;
        }

        if (result.pixels.length === 0) {
          selectedPixelFetchMissesRef.current.set(pixelKey, performance.now());
          markPerfEvent("selected pixel fetch empty", pixelKey);
          return;
        }

        selectedPixelFetchMissesRef.current.delete(pixelKey);
        markPerfEvent("selected pixel fetch done", pixelKey);
        mergeFetchedPixelsIntoVisibleWindow(result.pixels, {
          minX: result.min_x,
          maxX: result.max_x,
          minY: result.min_y,
          maxY: result.max_y,
        }, result.truncated, "Apply selected pixel fetch");
      });
    }, SELECTED_PIXEL_FETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      abortController?.abort();
      if (selectedPixelFetchAbortRef.current === abortController) {
        selectedPixelFetchAbortRef.current = null;
      }
      if (selectedPixelFetchKeyRef.current === pixelKey) {
        selectedPixelFetchKeyRef.current = null;
      }
    };
  }, [
    activeChunks,
    activeWorldBounds,
    canFetchSelectedPixelRecord,
    mergeFetchedPixelsIntoVisibleWindow,
    selectedPixel,
    selectedPixelRecord,
  ]);

  const renderedPendingClaims = useMemo(() => {
    return measureDebugWork(
      "Compute pending claim overlay",
      () => buildPendingClaimSegments(pendingClaimPixels, pendingClaimRectangles, camera),
      (segments) => `${segments.length} segments from ${pendingClaimPixels.length} pixels, ${pendingClaimRectangles.length} rectangles`,
    );
  }, [camera, pendingClaimPixels, pendingClaimRectangles]);

  const pendingClaimOutlinePath = useMemo(() => {
    return measureDebugWork(
      "Compute pending claim outline",
      () => buildPendingClaimOutlinePath(pendingClaimPixels, pendingClaimRectangles, camera),
      (path) => (path === null ? "no outline" : `${path.length} path characters`),
    );
  }, [camera, pendingClaimPixels, pendingClaimRectangles]);

  const claimOutlinePaths = useMemo(() => {
    return measureDebugWork(
      "Compute claim outline paths",
      () => buildClaimOutlinePaths(
        claimOutlineSegments,
        camera,
      ),
      (paths) => `${paths.length} paths from ${claimOutlineSegments.length} segments`,
    );
  }, [camera, claimOutlineSegments]);

  const pendingPaintTiles = useMemo(() => {
    return measureDebugWork(
      "Compute pending paint canvas tiles",
      () => buildPendingPaintCanvasTiles(pendingPaints),
      (tiles) => `${tiles.length} tiles from ${pendingPaints.length} pixels`,
    );
  }, [pendingPaints]);

  const selectedPixelOverlay = useMemo(() => {
    if (selectedPixel === null || !selectedPlacementState.isInsideWorld) {
      return null;
    }

    return {
      left: camera.x + selectedPixel.x * camera.zoom,
      top: worldPixelScreenTop(selectedPixel.y, camera),
      size: camera.zoom,
    };
  }, [camera, selectedPixel, selectedPlacementState.isInsideWorld]);

  const hoverPixelOverlay = useMemo(() => {
    if (
      hoveredPixel === null ||
      (selectedPixel !== null && hoveredPixel.x === selectedPixel.x && hoveredPixel.y === selectedPixel.y)
    ) {
      return null;
    }

    return {
      key: getPixelKey(hoveredPixel),
      left: camera.x + hoveredPixel.x * camera.zoom,
      top: worldPixelScreenTop(hoveredPixel.y, camera),
      size: camera.zoom,
    };
  }, [camera, hoveredPixel, selectedPixel]);

  const paintCursorOverlay = useMemo<PaintCursorOverlay | null>(() => {
    if (
      hoveredPixel === null ||
      !buildPanelOpen ||
      activeBuildMode !== "paint" ||
      paintTool !== "brush"
    ) {
      return null;
    }

    return {
      key: getPixelKey(hoveredPixel),
      left: camera.x + hoveredPixel.x * camera.zoom,
      top: worldPixelScreenTop(hoveredPixel.y, camera),
      size: camera.zoom,
      color: PIXEL_PALETTE_COLOR_BY_ID.get(selectedColorId) ?? "#ffffff",
      isTransparent: selectedColorId === TRANSPARENT_COLOR_ID,
    };
  }, [activeBuildMode, buildPanelOpen, camera, hoveredPixel, paintTool, selectedColorId]);

  const canClaimSelectedPixel = selectedPlacementState.canClaim;
  const canPaintSelectedPixel = selectedPlacementState.canPaint;
  const pendingClaimCount = useMemo(
    () => getPendingClaimCount(pendingClaimPixels, pendingClaimRectangles),
    [pendingClaimPixels, pendingClaimRectangles],
  );
  const pendingOverlayPixelCount = pendingOverlayDraft?.templatePixels.length ?? 0;
  const activeClaimPendingCount = claimTool === "overlay" ? pendingOverlayPixelCount : pendingClaimCount;
  const bulkPendingClaimOverlay = pendingClaimCount >= BULK_PENDING_CLAIM_THRESHOLD;
  const activePendingCount = activeBuildMode === "claim" ? activeClaimPendingCount : pendingPaints.length;
  const activePendingLabel = activeBuildMode === "claim"
    ? claimTool === "overlay"
      ? `${pendingOverlayPixelCount} overlay claim${pendingOverlayPixelCount === 1 ? "" : "s"}`
      : `${pendingClaimCount} pending claim${pendingClaimCount === 1 ? "" : "s"}`
    : `${pendingPaints.length} pending pixel${pendingPaints.length === 1 ? "" : "s"}`;
  const selectedPendingClaim = useMemo(() => {
    if (selectedPixel === null) {
      return false;
    }

    return hasPendingClaimAtPixel(selectedPixel, pendingClaimPixelMap, pendingClaimRectangles);
  }, [pendingClaimPixelMap, pendingClaimRectangles, selectedPixel]);
  const canRemoveSelectedPending = activeBuildMode === "claim" && claimTool === "overlay"
    ? false
    : activeBuildMode === "claim"
    ? selectedPendingClaim
    : selectedPendingPaint !== null;

  const placementLabel = useMemo(() => {
    if (placementBusy) {
      return "Saving...";
    }

    if (activePendingCount === 0) {
      return "Nothing pending";
    }

    if (activeBuildMode === "claim" && claimTool === "overlay") {
      return `Create overlay claim (${formatCount(activePendingCount)})`;
    }

    return activeBuildMode === "claim"
      ? `Submit ${activePendingCount} claim${activePendingCount === 1 ? "" : "s"}`
      : `Submit ${activePendingCount} pixel${activePendingCount === 1 ? "" : "s"}`;
  }, [activeBuildMode, activePendingCount, claimTool, placementBusy]);

  const selectedCellLabel = useMemo(() => {
    if (selectedPixel === null) {
      return "No cell selected";
    }

    if (selectedPixelRecord === null) {
      return selectedPlacementState.isPendingClaim ? "Pending Claim Area cell" : "Unclaimed cell";
    }

    if (selectedPixelRecord.is_starter) {
      return "Starter frontier";
    }

    if (currentUser && selectedPixelRecord.owner_user_id === currentUser.id) {
      return selectedPendingPaint ? "Pending paint change" : "Your claimed territory";
    }

    if (selectedPixelRecord.viewer_relation === "contributor") {
      return "Contributor access";
    }

    return `Claimed by #${selectedPixelRecord.owner_public_id}`;
  }, [currentUser, selectedPendingPaint, selectedPixel, selectedPixelRecord, selectedPlacementState.isPendingClaim]);

  const placementHelpText = useMemo(() => {
    if (currentUser === null) {
      return "Login required to use the build tools.";
    }

    if (activeBuildMode === "claim" && claimTool === "overlay") {
      if (claimAreaMode !== "new") {
        return "Overlay creates a new Claim Area. Finish or close extend mode before creating an overlay claim.";
      }

      if (pendingOverlayDraft === null) {
        return "Upload an image, position it on the world, then create the Claim Area and private pixel template together.";
      }

      if (pendingOverlayDraft.renderMessage !== null) {
        return pendingOverlayDraft.renderMessage;
      }

      return "Drag the overlay on the canvas, resize it from the edges or corners, then submit to claim the generated template pixels.";
    }

    if (!semanticZoomMode) {
      return "Zoom in until the pixel grid is visible before staging changes.";
    }

    if (activeBuildMode === "claim" && claimTool === "rectangle" && rectanglePlacementBusy) {
      return "Checking nearby claims for the current rectangle before staging it.";
    }

    if (selectedPixel === null) {
      if (activeBuildMode === "claim") {
        if (claimAreaMode === "new" && currentUser !== null && newAreaBlockedReason !== null) {
          return newAreaBlockedReason;
        }

        if (claimAreaMode === "expand") {
          return activeClaimTargetArea === null
            ? "Open Area Info on one of your areas and choose Extend this area before staging more Claim Area cells."
            : `Select an empty cell touching ${activeClaimTargetAreaName}, or press Space over the canvas to extend it.`;
        }

        return "Select a connected empty cell or press Space over the canvas to stage Claim Area cells.";
      }

      return "Select one of your claimed cells or press Space over your territory to stage Color Pixel changes.";
    }

    if (activeBuildMode === "claim") {
      if (claimAreaMode === "new" && currentUser !== null && newAreaBlockedReason !== null) {
        return newAreaBlockedReason;
      }

      if (claimAreaMode === "expand" && activeClaimTargetArea === null) {
        return "Open Area Info on one of your areas and choose Extend this area before staging more Claim Area cells.";
      }

      if (claimTool === "rectangle") {
        if (claimAreaMode === "expand") {
          return rectangleAnchor
            ? "Click the opposite corner. The rectangle must stay empty and touch the selected area or one of your staged extension cells."
            : "Click the first rectangle corner, then click the opposite corner to extend the selected area.";
        }

        return rectangleAnchor
          ? "Click the opposite corner. The rectangle cannot cover existing claims and must touch the starter frontier, claimed territory or a staged claim."
          : "Click the first rectangle corner, then click the opposite corner to start a new Claim Area.";
      }

      if (selectedPlacementState.isPendingClaim) {
        return claimAreaMode === "expand"
          ? `This extension for ${activeClaimTargetAreaName} is staged locally. Submit the pending claims when your shape is ready.`
          : "This new Claim Area cell is staged locally. Submit the pending claims when your shape is ready.";
      }

      if (canClaimSelectedPixel) {
        return claimAreaMode === "expand"
          ? `Press Space over empty cells to extend ${activeClaimTargetAreaName}. New claims must touch this area or another staged extension cell.`
          : "Press Space over empty cells to stage a new area. New claims must touch the starter frontier, an existing claim or another staged claim.";
      }

      return claimAreaMode === "expand"
        ? `Extend mode only claims empty cells that connect to ${activeClaimTargetAreaName}.`
        : "Claim Area only starts new active areas on empty cells connected to the starter frontier or existing claimed territory.";
    }

    if (paintTool === "picker") {
      return "Picker samples exact pixel colors from the canvas or overlay. Middle-click triggers it too.";
    }

    if (paintTool === "eraser") {
      return selectedPendingPaint
        ? "Left-click this cell, hold Space, or right-click-drag staged Color Pixels to erase only local pending changes. Nothing transparent is submitted."
        : "Eraser only removes Color Pixels you staged locally. Right-click-drag uses the same stroke behavior as Space.";
    }

    if (selectedPendingPaint) {
      return selectedPendingPaint.colorId === TRANSPARENT_COLOR_ID
        ? "This erase is staged locally. Keep brushing with Space, then submit all pending changes together. Each saved change spends 1 Color Pixel."
        : "This color is staged locally. Keep painting with Space, then submit all pending pixels together. Each saved change spends 1 Color Pixel.";
    }

    if (canPaintSelectedPixel) {
      return "Color Pixel mode stages instantly with the selected brush color. Submit validates access and saves owned or contributed territory.";
    }

    if (selectedPixelRecord === null || selectedPlacementState.isPendingClaim) {
      return "Color Pixel mode cannot claim new cells. Switch to Claim Area first, submit the claim, then paint it.";
    }

    if (selectedPixelRecord.is_starter) {
      return "Starter frontier cells are reserved and cannot be painted.";
    }

    return "You can only paint inside territory you own or were invited into.";
  }, [
    activeBuildMode,
    canClaimSelectedPixel,
    canPaintSelectedPixel,
    claimTool,
    claimAreaMode,
    currentUser,
    activeClaimTargetArea,
    activeClaimTargetAreaName,
    newAreaBlockedReason,
    paintTool,
    rectangleAnchor,
    rectanglePlacementBusy,
    pendingOverlayDraft,
    semanticZoomMode,
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
      setHoveredPixel((current) => (current === null ? current : null));
      return;
    }

    const hoverPixel = screenPointToWorldPixel(nextPointer.x, nextPointer.y, cameraRef.current);
    const isInsideWorld = isPixelInsideActiveWorld(hoverPixel);
    const crosshairColor = isInsideWorld ? "var(--crosshair)" : "var(--crosshair-outside)";

    horizontalLine.style.background = crosshairColor;
    verticalLine.style.background = crosshairColor;
    horizontalLine.style.display = "block";
    verticalLine.style.display = "block";
    horizontalLine.style.transform = `translateY(${Math.round(nextPointer.y)}px)`;
    verticalLine.style.transform = `translateX(${Math.round(nextPointer.x)}px)`;

    if (!isInsideWorld) {
      hoverValue.textContent = "-- : --";
      setHoveredPixel((current) => (current === null ? current : null));
      return;
    }

    setHoveredPixel((current) => (
      current !== null && current.x === hoverPixel.x && current.y === hoverPixel.y
        ? current
        : hoverPixel
    ));
    hoverValue.textContent = `${hoverPixel.x} : ${hoverPixel.y}`;
  }, [isPixelInsideActiveWorld]);

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
  }, [
    activeChunks,
    activeWorldBounds.maxX,
    activeWorldBounds.maxY,
    activeWorldBounds.minX,
    activeWorldBounds.minY,
    camera.x,
    camera.y,
    camera.zoom,
    schedulePointerVisual,
  ]);

  useEffect(() => {
    return () => {
      if (pointerVisualFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerVisualFrameRef.current);
      }
    };
  }, []);

  const getOverlayColorIdAtPixel = useCallback((targetPixel: PixelCoordinate): number | null => {
    const pixelKey = getPixelKey(targetPixel);
    const pendingOverlayColorId = pendingOverlayColorMapRef.current.get(pixelKey);

    if (pendingOverlayColorId !== undefined) {
      return pendingOverlayColorId;
    }

    return selectedAreaOverlayColorMapRef.current.get(pixelKey) ?? null;
  }, []);

  const pickPaintColorAtPixel = useCallback((
    targetPixel: PixelCoordinate,
    options?: { activateBrush?: boolean; quiet?: boolean },
  ): boolean => {
    const targetState = getPlacementState(targetPixel);

    if (!targetState.isInsideWorld) {
      if (!options?.quiet) {
        setPlacementMessage({
          tone: "error",
          text: "This cell is outside the active world.",
        });
      }
      return false;
    }

    setSelectedPixel((current) => (
      current !== null && current.x === targetPixel.x && current.y === targetPixel.y
        ? current
        : targetPixel
    ));

    const pickedColorId =
      getOverlayColorIdAtPixel(targetPixel) ??
      targetState.pendingPaint?.colorId ??
      targetState.pixelRecord?.color_id ??
      null;

    if (pickedColorId === null) {
      if (!options?.quiet) {
        setPlacementMessage({
          tone: "error",
          text: "This spot has no overlay or painted color to pick.",
        });
      }
      return false;
    }

    setSelectedColorId(pickedColorId);
    emitDebugEvent(
      "action",
      "Brush color picked",
      `${targetPixel.x}:${targetPixel.y} -> #${pickedColorId}${options?.activateBrush ? " and brush activated" : ""}`,
    );

    if (options?.activateBrush) {
      setPaintTool("brush");
    }

    if (!options?.quiet) {
      const pickedColorName = PIXEL_PALETTE_NAME_BY_ID.get(pickedColorId) ?? `Color #${pickedColorId}`;
      setPlacementMessage({
        tone: "info",
        text: options?.activateBrush
          ? `${pickedColorName} picked from the canvas or overlay. Brush is ready.`
          : `${pickedColorName} picked from the canvas or overlay.`,
      });
    }

    return true;
  }, [getOverlayColorIdAtPixel, getPlacementState]);

  const stagePaintBrushPixels = useCallback((
    targetPixels: PixelCoordinate[],
    options?: Pick<StagePixelOptions, "quiet" | "updateSelection">,
  ): Set<string> => {
    const stagedKeys = new Set<string>();

    if (targetPixels.length === 0) {
      return stagedKeys;
    }

    if (options?.updateSelection !== false) {
      const lastPixel = targetPixels[targetPixels.length - 1];
      setSelectedPixel((current) => (
        current !== null && current.x === lastPixel.x && current.y === lastPixel.y
          ? current
          : lastPixel
      ));
    }

    const nextUser = currentUserRef.current;

    if (nextUser === null) {
      if (!options?.quiet) {
        setPlacementMessage({ tone: "error", text: "Login required to use the build tools." });
      }
      return stagedKeys;
    }

    const selectedColorIdValue = selectedColorIdRef.current;
    const nextPaints = [...pendingPaintsRef.current];
    const paintIndexByKey = new Map<string, number>();
    const nextPaintMap = new Map<string, PendingPaint>();
    const availablePixels = getCurrentDisplayedNormalPixels(nextUser);
    let changed = false;
    let blockedOutsidePaintableArea = false;
    let notEnoughPixels = false;

    for (let index = 0; index < nextPaints.length; index += 1) {
      const paint = nextPaints[index];
      const paintKey = getPixelKey(paint);
      paintIndexByKey.set(paintKey, index);
      nextPaintMap.set(paintKey, paint);
    }

    for (const targetPixel of targetPixels) {
      const targetState = getPlacementState(targetPixel);

      if (!targetState.canPaint) {
        blockedOutsidePaintableArea = true;

        if (targetState.pixelRecord === null && targetState.isInsideWorld) {
          const now = performance.now();

          if (now - lastPaintBlockedMissingPixelAtRef.current > 1000) {
            lastPaintBlockedMissingPixelAtRef.current = now;
            emitDebugEvent(
              "warning",
              "Paint blocked outside active paintable area",
              `${targetPixel.x}:${targetPixel.y}; visible records ${visiblePixelsRef.current.length}; active paintable areas ${ownedAreasRef.current.filter((area) => area.status === "active" && area.viewer_can_paint).length}`,
            );
          }
        }

        continue;
      }

      const paintKey = getPixelKey(targetPixel);
      const existingPaintIndex = paintIndexByKey.get(paintKey);

      if (
        existingPaintIndex !== undefined &&
        nextPaints[existingPaintIndex].colorId === selectedColorIdValue
      ) {
        stagedKeys.add(paintKey);
        continue;
      }

      if (existingPaintIndex === undefined && nextPaints.length >= availablePixels) {
        notEnoughPixels = true;
        break;
      }

      const nextPaint: PendingPaint = {
        ...targetPixel,
        colorId: selectedColorIdValue,
      };

      if (existingPaintIndex === undefined) {
        paintIndexByKey.set(paintKey, nextPaints.length);
        nextPaints.push(nextPaint);
      } else {
        nextPaints[existingPaintIndex] = nextPaint;
      }

      nextPaintMap.set(paintKey, nextPaint);

      stagedKeys.add(paintKey);
      changed = true;
    }

    if (changed) {
      syncPendingPaints(nextPaints, nextPaintMap);
    }

    if (!options?.quiet) {
      if (notEnoughPixels) {
        setPlacementMessage({
          tone: "error",
          text: "Not enough Color Pixels for more pending paint.",
        });
      } else if (stagedKeys.size > 0) {
        setPlacementMessage({
          tone: "info",
          text: `${nextPaints.length} pixel${nextPaints.length === 1 ? "" : "s"} staged locally.`,
        });
      } else if (blockedOutsidePaintableArea) {
        setPlacementMessage({
          tone: "error",
          text: "Color Pixel mode only paints territory you own or were invited into.",
        });
      }
    }

    return stagedKeys;
  }, [getPlacementState, syncPendingPaints]);

  const stageActiveToolPixel = useCallback((
    targetPixel: PixelCoordinate,
    options?: StagePixelOptions,
  ): boolean => {
    if (!isPixelInsideActiveWorld(targetPixel)) {
      if (!options?.quiet) {
        setPlacementMessage({
          tone: "error",
          text: "This cell is outside the active world.",
        });
      }
      return false;
    }

    if (options?.updateSelection !== false) {
      setSelectedPixel((current) => (
        current !== null && current.x === targetPixel.x && current.y === targetPixel.y
          ? current
          : targetPixel
      ));
    }

    const activeMode = activeBuildModeRef.current;

    if (activeMode === "paint" && paintToolRef.current === "picker") {
      if (options?.allowPicker === false) {
        return false;
      }

      return pickPaintColorAtPixel(targetPixel, {
        activateBrush: true,
        quiet: options?.quiet,
      });
    }

    if (activeMode === "paint" && paintToolRef.current === "eraser") {
      return removePendingPaintAtPixel(targetPixel, {
        quiet: options?.quiet,
        updateSelection: options?.updateSelection,
      });
    }

    const nextUser = currentUserRef.current;
    if (nextUser === null) {
      if (!options?.quiet) {
        setPlacementMessage({ tone: "error", text: "Login required to use the build tools." });
      }
      return false;
    }

    if (activeMode === "claim") {
      if (claimToolRef.current === "overlay") {
        if (!options?.quiet) {
          setPlacementMessage({
            tone: "info",
            text: "Overlay mode uses the uploaded template instead of single-cell staging.",
          });
        }
        return false;
      }

      const targetState = getPlacementState(targetPixel);
      const activeClaimMode = claimAreaModeRef.current;
      const activeClaimTargetAreaId = claimTargetAreaIdRef.current;

      if (activeClaimMode === "new" && !canStartNewAreaRef.current) {
        if (!options?.quiet) {
          setPlacementMessage({
            tone: "error",
            text: newAreaBlockedReasonRef.current
              ?? "Finish or extend your current active area before starting a new one.",
          });
        }
        return false;
      }

      if (activeClaimMode === "expand" && activeClaimTargetAreaId === null) {
        if (!options?.quiet) {
          setPlacementMessage({
            tone: "error",
            text: "Open Area Info on one of your areas and choose Extend this area first.",
          });
        }
        return false;
      }

      if (!targetState.canClaim) {
        if (!options?.quiet) {
          setPlacementMessage({
            tone: "error",
            text: activeClaimMode === "expand"
              ? "This cell does not connect to the selected area in extend mode."
              : "This cell cannot start a new Claim Area.",
          });
        }
        return false;
      }

      if (hasPendingClaimAtPixel(
        targetPixel,
        pendingClaimPixelMapRef.current,
        pendingClaimRectanglesRef.current,
      )) {
        return false;
      }

      const pendingClaimCount = getPendingClaimCount(
        pendingClaimPixelsRef.current,
        pendingClaimRectanglesRef.current,
      );

      if (pendingClaimCount >= getCurrentDisplayedHolders(nextUser)) {
        if (!options?.quiet) {
          setPlacementMessage({
            tone: "error",
            text: "Not enough Holders for more pending claims.",
          });
        }
        return false;
      }

      if (pendingClaimCount >= CLAIM_BATCH_PIXEL_LIMIT) {
        if (!options?.quiet) {
          setPlacementMessage({
            tone: "error",
            text: `Claim batches are limited to ${formatCount(CLAIM_BATCH_PIXEL_LIMIT)} pixels.`,
          });
        }
        return false;
      }

      const updatedClaimPixels = [...pendingClaimPixelsRef.current, targetPixel];
      syncPendingClaims(updatedClaimPixels, pendingClaimRectanglesRef.current);
      setPlacementMessage({
        tone: "info",
        text: `${pendingClaimCount + 1} Claim Area cell${pendingClaimCount + 1 === 1 ? "" : "s"} staged locally.`,
      });
      return true;
    }

    return stagePaintBrushPixels([targetPixel], {
      quiet: options?.quiet,
      updateSelection: false,
    }).size > 0;
  }, [
    getPlacementState,
    isPixelInsideActiveWorld,
    pickPaintColorAtPixel,
    removePendingPaintAtPixel,
    stagePaintBrushPixels,
    syncPendingClaims,
  ]);

  const stageClaimRectangle = useCallback(async (start: PixelCoordinate, end: PixelCoordinate): Promise<boolean> => {
    if (isPixelInsideActiveWorld(end)) {
      setSelectedPixel(end);
    }

    const nextUser = currentUserRef.current;
    if (nextUser === null) {
      setPlacementMessage({ tone: "error", text: "Login required to use the rectangle claim tool." });
      return false;
    }

    const activeClaimMode = claimAreaModeRef.current;
    const activeClaimTargetAreaId = claimTargetAreaIdRef.current;

    if (activeClaimMode === "new" && !canStartNewAreaRef.current) {
      setPlacementMessage({
        tone: "error",
        text: newAreaBlockedReasonRef.current
          ?? "Finish or extend your current active area before starting a new one.",
      });
      return false;
    }

    if (activeClaimMode === "expand" && activeClaimTargetAreaId === null) {
      setPlacementMessage({
        tone: "error",
        text: "Open Area Info on one of your areas and choose Extend this area first.",
      });
      return false;
    }

    const rectangle = createPendingClaimRectangle(start, end);
    const pixelMap = claimContextPixelIndexRef.current;
    const bounds = activeWorldBoundsRef.current;
    const activeChunks = activeChunksRef.current;
    let pendingClaimPixels = pendingClaimPixelsRef.current;
    let pendingClaimPixelMap = pendingClaimPixelMapRef.current;
    let pendingClaimRectangles = pendingClaimRectanglesRef.current;
    let currentPendingClaimCount = getPendingClaimCount(pendingClaimPixels, pendingClaimRectangles);

    const displayedHolders = getCurrentDisplayedHolders(nextUser);

    if (bounds === null) {
      setPlacementMessage({ tone: "error", text: "The active world is not ready yet." });
      return false;
    }

    let placementEvaluation = evaluateClaimRectanglePlacement({
      rectangle,
      pixelMap,
      bounds,
      activeChunks,
      pendingClaimPixelMap,
      pendingClaimRectangles,
      activeClaimMode,
      activeClaimTargetAreaId,
      currentUserId: nextUser.id,
      startPixel: start,
    });

    if (!placementEvaluation.touchesClaimRoute && placementEvaluation.unresolvedNeighborCount > 0) {
      setPlacementMessage({
        tone: "info",
        text: "Checking nearby claims for this rectangle. This can take a moment while local claim data finishes loading.",
      });
      emitDebugEvent(
        "action",
        "Rectangle claim fetch fallback",
        `${rectangle.minX}:${rectangle.minY} -> ${rectangle.maxX}:${rectangle.maxY}; unresolved neighbors ${placementEvaluation.unresolvedNeighborCount}`,
      );
      const resolvedBounds = getClaimRectangleFetchBounds(rectangle, bounds);
      const fetchResult = await hydrateClaimRectanglePixelWindow(rectangle);
      pendingClaimPixels = pendingClaimPixelsRef.current;
      pendingClaimPixelMap = pendingClaimPixelMapRef.current;
      pendingClaimRectangles = pendingClaimRectanglesRef.current;
      currentPendingClaimCount = getPendingClaimCount(pendingClaimPixels, pendingClaimRectangles);
      placementEvaluation = evaluateClaimRectanglePlacement({
        rectangle,
        pixelMap: claimContextPixelIndexRef.current,
        bounds,
        activeChunks,
        pendingClaimPixelMap,
        pendingClaimRectangles,
        activeClaimMode,
        activeClaimTargetAreaId,
        currentUserId: nextUser.id,
        startPixel: start,
        resolvedBounds,
      });
      emitDebugEvent(
        "action",
        "Rectangle claim recheck",
        `${fetchResult.pixelCount} pixels fetched${fetchResult.truncated ? " (truncated)" : ""}; touch ${placementEvaluation.touchesClaimRoute ? "yes" : "no"}; unresolved neighbors ${placementEvaluation.unresolvedNeighborCount}`,
      );
    }

    if (placementEvaluation.blockedReason === "outside-world") {
      setPlacementMessage({ tone: "error", text: "The rectangle leaves the active world." });
      return false;
    }

    if (placementEvaluation.blockedReason === "claimed-territory") {
      setPlacementMessage({
        tone: "error",
        text: "The rectangle includes already claimed territory.",
      });
      return false;
    }

    if (placementEvaluation.newPixelCount === 0) {
      setPlacementMessage({ tone: "info", text: "This rectangle is already staged." });
      return false;
    }

    if (!placementEvaluation.touchesClaimRoute) {
      setPlacementMessage({
        tone: "error",
        text: activeClaimMode === "expand"
          ? "The rectangle must touch the selected area or one of your staged extension cells."
          : "The rectangle must touch the starter frontier, an existing claim or another pending claim.",
      });
      return false;
    }

    if (currentPendingClaimCount + placementEvaluation.newPixelCount > displayedHolders) {
      setPlacementMessage({
        tone: "error",
        text: "Not enough Holders for the new part of this rectangle.",
      });
      return false;
    }

    if (currentPendingClaimCount + placementEvaluation.newPixelCount > CLAIM_BATCH_PIXEL_LIMIT) {
      setPlacementMessage({
        tone: "error",
        text: `This rectangle would exceed the ${formatCount(CLAIM_BATCH_PIXEL_LIMIT)} pixel batch limit.`,
      });
      return false;
    }

    if (!placementEvaluation.overlapsPendingClaim) {
      syncPendingClaims(pendingClaimPixels, [...pendingClaimRectangles, rectangle]);
    } else {
      const newPixels: PixelCoordinate[] = [];

      for (let y = rectangle.minY; y <= rectangle.maxY; y += 1) {
        for (let x = rectangle.minX; x <= rectangle.maxX; x += 1) {
          const pixel = { x, y };
          if (!hasPendingClaimAtPixel(pixel, pendingClaimPixelMap, pendingClaimRectangles)) {
            newPixels.push(pixel);
          }
        }
      }

      syncPendingClaims([...pendingClaimPixels, ...newPixels], pendingClaimRectangles);
    }

    setPlacementMessage({
      tone: "info",
      text: `${placementEvaluation.newPixelCount} rectangle claim${placementEvaluation.newPixelCount === 1 ? "" : "s"} staged locally.`,
    });
    return true;
  }, [hydrateClaimRectanglePixelWindow, isPixelInsideActiveWorld, syncPendingClaims]);

  const stageSpaceStroke = useCallback((targetPixel: PixelCoordinate): void => {
    if (activeBuildModeRef.current === "paint" && paintToolRef.current === "picker") {
      return;
    }

    let stroke = spaceStrokeRef.current;

    if (stroke === null) {
      stroke = {
        visitedKeys: new Set(),
        lastPixel: null,
      };
      spaceStrokeRef.current = stroke;
    }

    const linePixels = stroke.lastPixel ? getPixelLine(stroke.lastPixel, targetPixel) : [targetPixel];
    const freshPixels = linePixels.filter((pixel) => !stroke.visitedKeys.has(getPixelKey(pixel)));

    if (activeBuildModeRef.current === "paint" && paintToolRef.current === "brush") {
      const stagedKeys = stagePaintBrushPixels(freshPixels, {
        quiet: true,
        updateSelection: false,
      });

      for (const stagedKey of stagedKeys) {
        stroke.visitedKeys.add(stagedKey);
      }

      stroke.lastPixel = targetPixel;
      return;
    }

    for (const pixel of freshPixels) {
      const pixelKey = getPixelKey(pixel);

      if (stageActiveToolPixel(pixel, { allowPicker: false, quiet: true, updateSelection: false })) {
        stroke.visitedKeys.add(pixelKey);
      }
    }

    stroke.lastPixel = targetPixel;
  }, [stageActiveToolPixel, stagePaintBrushPixels]);

  const stageRightEraseStroke = useCallback((targetPixel: PixelCoordinate): void => {
    const stroke = rightEraseStrokeRef.current;

    if (stroke === null) {
      return;
    }

    const linePixels = stroke.lastPixel ? getPixelLine(stroke.lastPixel, targetPixel) : [targetPixel];

    for (const pixel of linePixels) {
      const pixelKey = getPixelKey(pixel);

      if (stroke.visitedKeys.has(pixelKey)) {
        continue;
      }

      if (removePendingPaintAtPixel(pixel, { quiet: true, updateSelection: false })) {
        stroke.visitedKeys.add(pixelKey);
      }
    }

    stroke.lastPixel = targetPixel;
  }, [removePendingPaintAtPixel]);

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
      rightEraseStrokeRef.current = null;
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

  function getMouseEventPixel(event: React.MouseEvent<HTMLDivElement>): PixelCoordinate {
    const rect = event.currentTarget.getBoundingClientRect();
    return screenToWorldPixel(event.clientX - rect.left, event.clientY - rect.top);
  }

  function inspectAreaAtPixel(targetPixel: PixelCoordinate): void {
    const pixelKey = getPixelKey(targetPixel);
    const immediatePlacementState = getPlacementState(targetPixel);
    const immediatePixelRecord = immediatePlacementState.pixelRecord;
    const immediateAreaId = immediatePixelRecord?.is_starter ? null : immediatePixelRecord?.area_id ?? null;
    const cachedArea = immediateAreaId === null
      ? null
      : getCachedClaimArea(immediateAreaId);

    areaInspectionAbortRef.current?.abort();
    setInspectedPixel(targetPixel);
    setInspectedPixelRecord(immediatePixelRecord);
    setAreaMessage(null);

    if (cachedArea !== null) {
      areaInspectionAbortRef.current = null;
      applyAreaSelection(cachedArea);
      setAreaPanelBusy(false);
      markPerfEvent("area inspect cache hit", `${pixelKey} -> ${cachedArea.id}`);
      return;
    }

    if (immediatePixelRecord?.is_starter || immediateAreaId === null) {
      applyAreaSelection(null);
    } else {
      setSelectedArea(null);
    }

    const abortController = new AbortController();
    areaInspectionAbortRef.current = abortController;
    setAreaPanelBusy(true);
    markPerfEvent("area inspect start", pixelKey);

    void fetchClaimAreaAtPixel(targetPixel.x, targetPixel.y, abortController.signal).then((result) => {
      if (abortController.signal.aborted) {
        return;
      }

      areaInspectionAbortRef.current = null;
      setAreaPanelBusy(false);

      if (!result.ok || result.inspection === null) {
        if (result.error === "Area inspection request aborted.") {
          return;
        }

        setInspectedPixelRecord(null);
        applyAreaSelection(null);
        setAreaMessage({
          tone: "error",
          text: result.error ?? "Area details could not be loaded.",
        });
        return;
      }

      markPerfEvent("area inspect done", pixelKey);
      setInspectedPixelRecord(result.inspection.pixel);

      const inspectedArea = result.inspection.area === null
        ? null
        : cacheClaimAreaSummary(result.inspection.area);

      applyAreaSelection(inspectedArea);
    });
  }

  function handleViewportContextMenu(event: React.MouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    const targetPixel = getMouseEventPixel(event);

    if (!isPixelInsideActiveWorld(targetPixel)) {
      return;
    }

    if (buildPanelOpenRef.current && activeBuildModeRef.current === "paint") {
      removePendingPaintAtPixel(targetPixel, { quiet: true });
    }
  }

  function handleViewportAuxClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.button === 1 && buildPanelOpenRef.current && activeBuildModeRef.current === "paint") {
      event.preventDefault();
    }
  }

  function handleCloseAreaPanel(): void {
    areaInspectionAbortRef.current?.abort();
    areaInspectionAbortRef.current = null;
    areaDetailsAbortRef.current?.abort();
    areaDetailsAbortRef.current = null;
    setInspectedPixel(null);
    setInspectedPixelRecord(null);
    applyAreaSelection(null);
    setAreaPanelBusy(false);
    setAreaDetailsBusy(false);
    setAreaMessage(null);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button === 1 && buildPanelOpenRef.current && activeBuildModeRef.current === "paint") {
      updatePointer(event);
      const targetPixel = getEventPixel(event);

      if (isPixelInsideActiveWorld(targetPixel)) {
        pickPaintColorAtPixel(targetPixel, { activateBrush: true });
      }

      event.preventDefault();
      return;
    }

    if (event.button === 2 && buildPanelOpenRef.current && activeBuildModeRef.current === "paint") {
      updatePointer(event);
      const targetPixel = getEventPixel(event);

      if (!isPixelInsideActiveWorld(targetPixel)) {
        event.preventDefault();
        return;
      }

      rightEraseStrokeRef.current = {
        pointerId: event.pointerId,
        visitedKeys: new Set(),
        lastPixel: null,
      };
      stageRightEraseStroke(targetPixel);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    if (event.button !== 0) {
      return;
    }

    updatePointer(event);
    const targetPixel = getEventPixel(event);

    if (spaceToolActiveRef.current) {
      stageSpaceStroke(targetPixel);
      return;
    }

    const originCamera = pendingCameraUpdateRef.current ?? cameraRef.current;
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: originCamera.x,
      originY: originCamera.y,
      mode: "pan",
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    updatePointer(event);
    const targetPixel = getEventPixel(event);

    const rightEraseStroke = rightEraseStrokeRef.current;

    if (rightEraseStroke?.pointerId === event.pointerId) {
      stageRightEraseStroke(targetPixel);
      return;
    }

    if (spaceToolActiveRef.current) {
      stageSpaceStroke(targetPixel);
      return;
    }

    const drag = dragState.current;

    if (drag?.pointerId !== event.pointerId) {
      return;
    }

    if (drag.mode === "pan") {
      const currentCamera = pendingCameraUpdateRef.current ?? cameraRef.current;
      scheduleCameraUpdate(clampCamera({
        ...currentCamera,
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      }));
      return;
    }
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const rightEraseStroke = rightEraseStrokeRef.current;

    if (rightEraseStroke?.pointerId === event.pointerId) {
      rightEraseStrokeRef.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      return;
    }

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

      if (!isPixelInsideActiveWorld(clickedPixel)) {
        return;
      }

      setSelectedPixel(clickedPixel);
      setPlacementMessage(null);

      if (buildPanelOpen && activeBuildModeRef.current === "paint") {
        if (paintToolRef.current === "eraser") {
          removePendingPaintAtPixel(clickedPixel);
          return;
        }

        if (paintToolRef.current === "picker") {
          pickPaintColorAtPixel(clickedPixel, { activateBrush: true });
          return;
        }

        stageActiveToolPixel(clickedPixel);
        return;
      }

      if (
        buildPanelOpen &&
        activeBuildModeRef.current === "claim" &&
        claimToolRef.current === "rectangle"
      ) {
        const anchor = rectangleAnchorRef.current;

        if (rectanglePlacementBusyRef.current) {
          emitDebugEvent("action", "Rectangle claim validation ignored", "busy");
          setPlacementMessage({
            tone: "info",
            text: "Still checking nearby claims for the current rectangle. Please wait a moment.",
          });
          return;
        }

        if (anchor === null) {
          setRectangleAnchor(clickedPixel);
          setPlacementMessage({
            tone: "info",
            text: "Rectangle start set. Click the opposite corner to stage the claim.",
          });
          void prefetchRectangleAnchorWindow(clickedPixel);
          return;
        }

        const rectangleKey = `${anchor.x}:${anchor.y} -> ${clickedPixel.x}:${clickedPixel.y}`;
        const validationStartedAt = performance.now();
        setRectanglePlacementBusyState(true);
        setPlacementMessage({
          tone: "info",
          text: "Checking nearby claims for this rectangle. This can take a moment while local claim data finishes loading.",
        });
        emitDebugEvent("action", "Rectangle claim validation start", rectangleKey);
        void (async () => {
          let outcome = "blocked";

          try {
            const staged = await stageClaimRectangle(anchor, clickedPixel);
            outcome = staged ? "staged" : "blocked";
          } catch (error) {
            outcome = "error";
            emitDebugEvent(
              "warning",
              "Rectangle claim validation failed",
              error instanceof Error ? error.message : "Unknown error",
            );
            setPlacementMessage({
              tone: "error",
              text: "Rectangle validation failed. Please try again.",
            });
          } finally {
            setRectangleAnchor(null);
            setRectanglePlacementBusyState(false);
            emitDebugEvent(
              "action",
              "Rectangle claim validation done",
              `${rectangleKey}; ${outcome}`,
              performance.now() - validationStartedAt,
            );
          }
        })();
        return;
      }

      if (buildPanelOpenRef.current || buildPanelMinimizedRef.current) {
        return;
      }

      inspectAreaAtPixel(clickedPixel);
    }
  }

  function handlePointerLeave(): void {
    pointerRef.current = {
      ...pointerRef.current,
      inside: false,
    };
    setHoveredPixel(null);
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

  function getCenteredOverlayTransform(sourceWidth: number, sourceHeight: number): ClaimOverlayTransform {
    const maxInitialCells = Math.min(CLAIM_OVERLAY_TEMPLATE_PIXEL_LIMIT, CLAIM_BATCH_PIXEL_LIMIT);
    const sourceCells = sourceWidth * sourceHeight;
    const scale = sourceCells > maxInitialCells
      ? Math.sqrt(maxInitialCells / sourceCells)
      : 1;
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const centerX = viewportSize.width > 0
      ? (viewportSize.width / 2 - cameraRef.current.x) / cameraRef.current.zoom
      : activeWorldBounds.centerX;
    const centerY = viewportSize.height > 0
      ? (cameraRef.current.y - viewportSize.height / 2) / cameraRef.current.zoom
      : activeWorldBounds.centerY;

    return normalizeOverlayTransform(
      {
        originX: Math.round(centerX - width / 2),
        originY: Math.round(centerY + height / 2),
        width,
        height,
      },
      activeWorldBounds,
    );
  }

  function setPendingOverlayTransform(nextTransform: ClaimOverlayTransform, options?: { snap?: boolean }): void {
    const bounds = activeWorldBoundsRef.current;

    if (bounds === null) {
      return;
    }

    const normalized = normalizeOverlayTransform(nextTransform, bounds);
    const snapped = options?.snap === false
      ? normalized
      : normalizeOverlayTransform(
          snapOverlayTransformToClaims(normalized, claimContextPixelIndexRef.current.values()),
          bounds,
        );

    setPendingOverlayDraft((current) => current === null
      ? current
      : {
          ...current,
          transform: snapped,
        });
  }

  function updatePendingOverlayDraft(
    updater: (current: ClaimOverlayDraft) => ClaimOverlayDraft,
  ): void {
    setPendingOverlayDraft((current) => current === null ? current : updater(current));
  }

  function handleOverlayUploadClick(): void {
    overlayFileInputRef.current?.click();
  }

  async function loadOverlayFile(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      setPlacementMessage({
        tone: "error",
        text: "Overlay upload expects an image file.",
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image could not be loaded."));
        image.src = objectUrl;
      });
    } catch (error) {
      setPlacementMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Overlay image could not be loaded.",
      });
      URL.revokeObjectURL(objectUrl);
      return;
    }

    URL.revokeObjectURL(objectUrl);

    if (image.naturalWidth > CLAIM_OVERLAY_MAX_SIDE || image.naturalHeight > CLAIM_OVERLAY_MAX_SIDE) {
      setPlacementMessage({
        tone: "error",
        text: `Overlay source images are limited to ${formatCount(CLAIM_OVERLAY_MAX_SIDE)} pixels per side.`,
      });
      return;
    }

    const sourceVersion = Date.now();
    overlaySourceRef.current = {
      image,
      imageName: file.name || "overlay",
      width: image.naturalWidth,
      height: image.naturalHeight,
      version: sourceVersion,
    };
    setPendingOverlayDraft({
      sourceVersion,
      imageName: file.name || "overlay",
      sourceWidth: image.naturalWidth,
      sourceHeight: image.naturalHeight,
      transform: getCenteredOverlayTransform(image.naturalWidth, image.naturalHeight),
      colorMode: "perceptual",
      colorPalette: "all",
      dithering: false,
      flipX: false,
      flipY: false,
      enabledColorIds: CLAIM_OVERLAY_DEFAULT_COLOR_IDS,
      templatePixels: [],
      previewDataUrl: null,
      renderMessage: "Preparing overlay template...",
    });
    setClaimTool("overlay");
    setPlacementMessage({
      tone: "info",
      text: "Overlay loaded. Drag it on the canvas, resize it, then submit the generated claim.",
    });
  }

  async function handleOverlayFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0] ?? null;

    if (file !== null) {
      await loadOverlayFile(file);
    }

    event.target.value = "";
  }

  function handleOverlayDragOver(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
  }

  function handleOverlayDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0] ?? null;

    if (file !== null) {
      void loadOverlayFile(file);
    }
  }

  function handleOverlayCenter(): void {
    const draft = pendingOverlayDraftRef.current;

    if (draft === null) {
      return;
    }

    setPendingOverlayTransform(getCenteredOverlayTransform(draft.transform.width, draft.transform.height), {
      snap: false,
    });
  }

  function handleOverlayRestoreRatio(): void {
    const draft = pendingOverlayDraftRef.current;

    if (draft === null) {
      return;
    }

    const aspectRatio = draft.sourceWidth / draft.sourceHeight;
    const width = Math.max(1, Math.round(draft.transform.width));
    const height = Math.max(1, Math.round(width / aspectRatio));

    setPendingOverlayTransform({
      ...draft.transform,
      width,
      height,
    }, { snap: false });
  }

  function handleOverlayPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    const draft = pendingOverlayDraftRef.current;

    if (draft === null || event.button !== 0) {
      return;
    }

    overlayPointerDragRef.current = {
      pointerId: event.pointerId,
      mode: "move",
      handle: null,
      startX: event.clientX,
      startY: event.clientY,
      startTransform: draft.transform,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  function handleOverlayHandlePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    handle: OverlayResizeHandle,
  ): void {
    const draft = pendingOverlayDraftRef.current;

    if (draft === null || event.button !== 0) {
      return;
    }

    overlayPointerDragRef.current = {
      pointerId: event.pointerId,
      mode: "resize",
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startTransform: draft.transform,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  function getResizedOverlayTransform(
    drag: OverlayPointerDragState,
    deltaWorldX: number,
    deltaWorldY: number,
  ): ClaimOverlayTransform {
    if (drag.mode === "move") {
      return {
        ...drag.startTransform,
        originX: drag.startTransform.originX + deltaWorldX,
        originY: drag.startTransform.originY + deltaWorldY,
      };
    }

    const handle = drag.handle;
    let { originX, originY, width, height } = drag.startTransform;

    if (handle?.includes("east")) {
      width += deltaWorldX;
    }

    if (handle?.includes("west")) {
      originX += deltaWorldX;
      width -= deltaWorldX;
    }

    if (handle?.includes("north")) {
      originY += deltaWorldY;
      height += deltaWorldY;
    }

    if (handle?.includes("south")) {
      height -= deltaWorldY;
    }

    return {
      originX,
      originY,
      width,
      height,
    };
  }

  function handleOverlayPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = overlayPointerDragRef.current;

    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaWorldX = Math.round((event.clientX - drag.startX) / Math.max(cameraRef.current.zoom, ABSOLUTE_MIN_ZOOM));
    const deltaWorldY = Math.round((drag.startY - event.clientY) / Math.max(cameraRef.current.zoom, ABSOLUTE_MIN_ZOOM));
    setPendingOverlayTransform(getResizedOverlayTransform(drag, deltaWorldX, deltaWorldY));
    event.stopPropagation();
    event.preventDefault();
  }

  function handleOverlayPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = overlayPointerDragRef.current;

    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }

    overlayPointerDragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    event.stopPropagation();
  }

  const applySavedPaints = useCallback((savedPaints: PendingPaint[], nextUser: AuthUser): void => {
    const nextPixels = [...visiblePixelsRef.current];
    const pixelIndex = new Map(nextPixels.map((pixel, index) => [getPixelKey(pixel), index]));
    const now = new Date().toISOString();
    let selectedAreaPaintDelta = 0;

    for (const paint of savedPaints) {
      const pixelKey = getPixelKey(paint);
      const pixelIndexValue = pixelIndex.get(pixelKey);

      if (pixelIndexValue === undefined) {
        continue;
      }

      const previousPixel = nextPixels[pixelIndexValue];
      const nextColorId = paint.colorId === TRANSPARENT_COLOR_ID ? null : paint.colorId;

      if (previousPixel.color_id === nextColorId) {
        continue;
      }

      nextPixels[pixelIndexValue] = {
        ...previousPixel,
        color_id: nextColorId,
        updated_at: now,
      };

      if (selectedArea !== null && previousPixel.area_id === selectedArea.id) {
        selectedAreaPaintDelta += Number(nextColorId !== null) - Number(previousPixel.color_id !== null);
      }
    }

    visiblePixelsRef.current = nextPixels;
    pixelIndexRef.current = new Map(nextPixels.map((pixel) => [getPixelKey(pixel), pixel]));
    claimContextPixelIndexRef.current = mergeClaimContextPixels(
      claimContextPixelIndexRef.current,
      nextPixels.map((pixel) => toClaimContextPixelRecord(pixel)),
    );
    syncSelectedPlacementState(selectedPixelSnapshotRef.current);
    syncInspectedPixelRecord();
    currentUserRef.current = nextUser;
    setAuthStatus((current) => ({
      ...current,
      user: nextUser,
    }));

    if (selectedAreaPaintDelta !== 0) {
      setSelectedArea((currentArea) => {
        if (currentArea === null) {
          return currentArea;
        }

        return {
          ...currentArea,
          painted_pixels_count: Math.max(0, currentArea.painted_pixels_count + selectedAreaPaintDelta),
        };
      });
    }
  }, [selectedArea, syncInspectedPixelRecord, syncSelectedPlacementState]);

  async function handlePlacementAction(): Promise<void> {
    if (currentUser === null || placementBusy || activePendingCount === 0) {
      return;
    }

    emitDebugEvent(
      "action",
      "Placement submit requested",
      `${activeBuildMode} with ${activePendingCount} pending item${activePendingCount === 1 ? "" : "s"}`,
    );
    setPlacementBusy(true);
    setPlacementMessage(null);

    if (activeBuildMode === "claim") {
      if (claimToolRef.current === "overlay") {
        const draft = pendingOverlayDraftRef.current;
        const saved = await submitPendingOverlayClaim(draft);

        if (saved) {
          setPendingOverlayDraft(null);
          overlaySourceRef.current = null;
          setOverlayPaletteOpen(false);
          setPlacementMessage({
            tone: "success",
            text: "Overlay Claim Area saved. The private template is now attached to this area.",
          });
        }

        setPlacementBusy(false);
        return;
      }

      const pendingClaimCountToSubmit = getPendingClaimCount(
        pendingClaimPixelsRef.current,
        pendingClaimRectanglesRef.current,
      );
      const claimModeAtSubmit = claimAreaModeRef.current;
      const claimTargetAreaNameAtSubmit = activeClaimTargetAreaName;
      const failedIndex = await submitPendingClaims(
        pendingClaimPixelsRef.current,
        pendingClaimRectanglesRef.current,
      );

      if (failedIndex === -1) {
        syncPendingClaims([], []);
        setRectangleAnchor(null);
        setPlacementMessage({
          tone: "success",
          text: claimModeAtSubmit === "expand"
            ? `${pendingClaimCountToSubmit} Claim Area cell${pendingClaimCountToSubmit === 1 ? "" : "s"} saved to ${claimTargetAreaNameAtSubmit}.`
            : `${pendingClaimCountToSubmit} Claim Area cell${pendingClaimCountToSubmit === 1 ? "" : "s"} saved. Your new active area is ready. Extend it later from Area Info.`,
        });
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

  async function submitPendingOverlayClaim(draft: ClaimOverlayDraft | null): Promise<boolean> {
    const source = overlaySourceRef.current;
    const overlayUser = currentUserRef.current;

    if (overlayUser === null) {
      setPlacementMessage({ tone: "error", text: "Login required to create an overlay claim." });
      return false;
    }

    if (!canStartNewAreaRef.current) {
      setPlacementMessage({
        tone: "error",
        text: newAreaBlockedReasonRef.current ?? "Finish or extend your current active area before starting an overlay claim.",
      });
      return false;
    }

    if (draft === null || source === null || source.version !== draft.sourceVersion) {
      setPlacementMessage({
        tone: "error",
        text: "Upload an overlay image before submitting.",
      });
      return false;
    }

    const normalizedTransform = normalizeOverlayTransform(draft.transform, activeWorldBoundsRef.current ?? activeWorldBounds);
    const normalizedDraft = {
      ...draft,
      transform: normalizedTransform,
    };
    let render: ClaimOverlayRenderResult;

    try {
      render = buildClaimOverlayRender(source, normalizedDraft);
    } catch (error) {
      setPlacementMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Overlay template generation failed.",
      });
      return false;
    }

    if (render.templatePixels.length === 0) {
      setPlacementMessage({
        tone: "error",
        text: "The overlay has no visible template pixels.",
      });
      return false;
    }

    if (render.templatePixels.length > getCurrentDisplayedHolders(overlayUser)) {
      setPlacementMessage({
        tone: "error",
        text: `This overlay needs ${formatCount(render.templatePixels.length)} Holders.`,
      });
      return false;
    }

    const startedAt = performance.now();
    emitDebugEvent(
      "network",
      "Overlay claim submit start",
      `${render.templatePixels.length} template pixel${render.templatePixels.length === 1 ? "" : "s"}`,
    );

    const result = await claimWorldPixels({
      pixels: render.templatePixels.map((pixel) => ({ x: pixel.x, y: pixel.y })),
      claimMode: "new",
      targetAreaId: null,
      overlay: {
        image_name: draft.imageName,
        image_width: draft.sourceWidth,
        image_height: draft.sourceHeight,
        origin_x: normalizedTransform.originX,
        origin_y: normalizedTransform.originY,
        width: normalizedTransform.width,
        height: normalizedTransform.height,
        color_mode: draft.colorMode,
        color_palette: draft.colorPalette,
        dithering: draft.dithering,
        flip_x: draft.flipX,
        flip_y: draft.flipY,
        template_pixels: render.templatePixels.map((pixel) => ({
          x: pixel.x,
          y: pixel.y,
          color_id: pixel.colorId,
        })),
      },
    });

    if (!result.ok || result.user === null || result.area === null) {
      setPlacementMessage({
        tone: "error",
        text: result.error ?? "Overlay claim submission failed. The template stayed local.",
      });
      emitDebugEvent(
        "warning",
        "Overlay claim submit failed",
        result.error ?? "Unknown overlay claim submit failure",
        performance.now() - startedAt,
      );
      return false;
    }

    setAuthStatus((current) => ({
      ...current,
      user: result.user,
    }));
    markWorldTilesDirty(result.claim_tiles);
    applyAreaSelection(cacheClaimAreaSummary(result.area));

    void (async () => {
      const refreshStartedAt = performance.now();
      emitDebugEvent("network", "Overlay follow-up refresh start", "pixels, outline, areas, overview");
      const overviewRefresh = async (): Promise<void> => {
        setWorld(await fetchWorldOverview());
      };
      const results = await Promise.allSettled([
        refreshVisiblePixelWindow({ force: true }),
        refreshClaimOutlineNow({ force: true }),
        refreshOwnedAreas(),
        overviewRefresh(),
      ]);
      const failedCount = results.filter((refreshResult) => refreshResult.status === "rejected").length;

      emitDebugEvent(
        failedCount > 0 ? "warning" : "network",
        failedCount > 0 ? "Overlay follow-up refresh partially failed" : "Overlay follow-up refresh done",
        `${failedCount} failed refresh${failedCount === 1 ? "" : "es"}`,
        performance.now() - refreshStartedAt,
      );
    })();

    emitDebugEvent(
      "network",
      "Overlay claim submit done",
      `area ${result.area.id} with ${result.claim_tiles.length} claim tile${result.claim_tiles.length === 1 ? "" : "s"}; refresh queued`,
      performance.now() - startedAt,
    );
    return true;
  }

  async function submitPendingClaims(
    claimPixelsToSubmit: PixelCoordinate[],
    claimRectanglesToSubmit: PendingClaimRectangle[],
  ): Promise<number> {
    const startedAt = performance.now();
    const pendingClaimCount = getPendingClaimCount(claimPixelsToSubmit, claimRectanglesToSubmit);
    const claimMode = claimAreaModeRef.current;
    const targetAreaId = claimTargetAreaIdRef.current;
    emitDebugEvent(
      "network",
      "Claim submit start",
      `${pendingClaimCount} claim pixel${pendingClaimCount === 1 ? "" : "s"}`,
    );
    const result = await claimWorldPixels({
      pixels: claimPixelsToSubmit,
      rectangles: claimRectanglesToSubmit.map((rectangle) => ({
        minX: rectangle.minX,
        maxX: rectangle.maxX,
        minY: rectangle.minY,
        maxY: rectangle.maxY,
      })),
      claimMode,
      targetAreaId,
    });

    if (!result.ok || result.user === null || result.area === null) {
      setPlacementMessage({
        tone: "error",
        text: result.error ?? "Claim submission failed. Pending claims stayed local.",
      });
      emitDebugEvent(
        "warning",
        "Claim submit failed",
        result.error ?? "Unknown claim submit failure",
        performance.now() - startedAt,
      );
      return 0;
    }

    setAuthStatus((current) => ({
      ...current,
      user: result.user,
    }));
    markWorldTilesDirty(result.claim_tiles);
    applyAreaSelection(cacheClaimAreaSummary(result.area));

    void (async () => {
      const refreshStartedAt = performance.now();
      emitDebugEvent("network", "Claim follow-up refresh start", "pixels, outline, areas, overview");
      const overviewRefresh = async (): Promise<void> => {
        emitDebugEvent("network", "World overview refresh start", "after claim submit");
        setWorld(await fetchWorldOverview());
        emitDebugEvent("network", "World overview refresh done", "after claim submit");
      };
      const results = await Promise.allSettled([
        refreshVisiblePixelWindow({ force: true }),
        refreshClaimOutlineNow({ force: true }),
        refreshOwnedAreas(),
        overviewRefresh(),
      ]);
      const failedCount = results.filter((refreshResult) => refreshResult.status === "rejected").length;

      emitDebugEvent(
        failedCount > 0 ? "warning" : "network",
        failedCount > 0 ? "Claim follow-up refresh partially failed" : "Claim follow-up refresh done",
        `${failedCount} failed refresh${failedCount === 1 ? "" : "es"}`,
        performance.now() - refreshStartedAt,
      );
    })();

    emitDebugEvent(
      "network",
      "Claim submit done",
      `area ${result.area.id} with ${result.claim_tiles.length} claim tile${result.claim_tiles.length === 1 ? "" : "s"}; refresh queued`,
      performance.now() - startedAt,
    );
    return -1;
  }

  async function submitPendingPaints(paintsToSubmit: PendingPaint[]): Promise<number> {
    const startedAt = performance.now();
    emitDebugEvent(
      "network",
      "Paint submit start",
      `${paintsToSubmit.length} pixel${paintsToSubmit.length === 1 ? "" : "s"}`,
    );
    const result = await paintWorldPixels(buildPaintTilePayload(paintsToSubmit));

    if (!result.ok || result.user === null) {
      setPlacementMessage({
        tone: "error",
        text: result.error ?? "Pixel submission failed. Pending pixels stayed local.",
      });
      emitDebugEvent(
        "warning",
        "Paint submit failed",
        result.error ?? "Unknown paint submit failure",
        performance.now() - startedAt,
      );
      return 0;
    }

    setAuthStatus((current) => ({
      ...current,
      user: result.user,
    }));
    markWorldTilesDirty(result.paint_tiles);
    applySavedPaints(paintsToSubmit, result.user);
    emitDebugEvent(
      "network",
      "Paint submit saved",
      `${result.paint_tiles.length} paint tiles, ${result.claim_tiles.length} claim tiles`,
      performance.now() - startedAt,
    );

    void (async () => {
      const refreshStartedAt = performance.now();
      emitDebugEvent("network", "Paint follow-up refresh start", "outline, areas, overview");
      const overviewRefresh = async (): Promise<void> => {
        setWorld(await fetchWorldOverview());
      };
      const results = await Promise.allSettled([
        refreshClaimOutlineNow({ force: true }),
        refreshOwnedAreas(),
        overviewRefresh(),
      ]);
      const failedCount = results.filter((refreshResult) => refreshResult.status === "rejected").length;

      emitDebugEvent(
        failedCount > 0 ? "warning" : "network",
        failedCount > 0 ? "Paint follow-up refresh partially failed" : "Paint follow-up refresh done",
        `${failedCount} failed refresh${failedCount === 1 ? "" : "es"}`,
        performance.now() - refreshStartedAt,
      );
    })();

    return -1;
  }

  async function handleAreaSave(): Promise<void> {
    if (selectedArea === null || areaPanelBusy) {
      return;
    }

    if (areaDraftName.length > AREA_NAME_MAX_LENGTH) {
      setAreaMessage({
        tone: "error",
        text: `Name is limited to ${AREA_NAME_MAX_LENGTH} characters.`,
      });
      return;
    }

    if (areaDraftDescription.length > AREA_DESCRIPTION_MAX_LENGTH) {
      setAreaMessage({
        tone: "error",
        text: `Description is limited to ${AREA_DESCRIPTION_MAX_LENGTH} characters.`,
      });
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

    applyAreaSelection(cacheClaimAreaSummary(result.area));
    await refreshOwnedAreas();
    setAreaEditorOpen(false);
    setAreaMessage({
      tone: "success",
      text: "Area info saved.",
    });
    setAreaPanelBusy(false);
  }

  async function handleAreaFinish(): Promise<void> {
    if (selectedArea === null || areaPanelBusy) {
      return;
    }

    if (areaDraftName.length > AREA_NAME_MAX_LENGTH || areaDraftDescription.length > AREA_DESCRIPTION_MAX_LENGTH) {
      setAreaMessage({
        tone: "error",
        text: "Area name or description is above the character limit.",
      });
      return;
    }

    const releasedPixelCount = Math.max(0, selectedArea.claimed_pixels_count - selectedArea.painted_pixels_count);
    const confirmed = window.confirm(
      [
        "Finish this Area permanently?",
        "",
        "This action cannot be undone.",
        `${formatCount(releasedPixelCount)} unpainted claimed pixel${releasedPixelCount === 1 ? "" : "s"} will be released for other players.`,
      ].join("\n"),
    );

    if (!confirmed) {
      setAreaMessage({
        tone: "info",
        text: "Area finish cancelled.",
      });
      return;
    }

    setAreaPanelBusy(true);
    setAreaMessage(null);
    const startedAt = performance.now();
    emitDebugEvent(
      "network",
      "Area finish start",
      `${selectedArea.id}; ${selectedArea.claimed_pixels_count} claimed / ${selectedArea.painted_pixels_count} painted`,
    );

    const result = await updateClaimArea(
      selectedArea.id,
      areaDraftName,
      areaDraftDescription,
      "finished",
    );

    if (!result.ok || result.area === null) {
      setAreaMessage({
        tone: "error",
        text: result.error ?? "Area finish failed.",
      });
      emitDebugEvent(
        "warning",
        "Area finish failed",
        result.error ?? "Unknown area finish failure",
        performance.now() - startedAt,
      );
      setAreaPanelBusy(false);
      return;
    }

    const finishedArea = cacheClaimAreaSummary(result.area);
    markWorldTilesDirty(result.claim_tiles);
    clearClaimOutlinesImmediately();
    syncOwnedAreaSummary(finishedArea);
    applyAreaSelection(finishedArea);
    if (claimTargetAreaIdRef.current === result.area.id) {
      setClaimAreaMode("new");
      setClaimTargetAreaId(null);
    }

    void (async () => {
      const refreshStartedAt = performance.now();
      emitDebugEvent(
        "network",
        "Area finish follow-up refresh start",
        `${result.claim_tiles.length} dirty claim tile${result.claim_tiles.length === 1 ? "" : "s"}`,
      );
      const overviewRefresh = async (): Promise<void> => {
        setWorld(await fetchWorldOverview());
      };
      const refreshResults = await Promise.allSettled([
        refreshVisiblePixelWindow({ force: true }),
        refreshClaimOutlineNow({ force: true }),
        refreshOwnedAreas({ showLoading: false }),
        refreshAuthStatus(false),
        overviewRefresh(),
      ]);
      const failedRefreshCount = refreshResults
        .filter((refreshResult) => refreshResult.status === "rejected")
        .length;
      emitDebugEvent(
        failedRefreshCount > 0 ? "warning" : "network",
        failedRefreshCount > 0
          ? "Area finish follow-up refresh partially failed"
          : "Area finish follow-up refresh done",
        `${failedRefreshCount} failed refresh${failedRefreshCount === 1 ? "" : "es"}; ${result.claim_tiles.length} dirty claim tile${result.claim_tiles.length === 1 ? "" : "s"}`,
        performance.now() - refreshStartedAt,
      );
    })();

    emitDebugEvent(
      "network",
      "Area finish done",
      `${result.area.id}; ${result.claim_tiles.length} dirty claim tile${result.claim_tiles.length === 1 ? "" : "s"}; refresh queued`,
      performance.now() - startedAt,
    );
    setAreaMessage({
      tone: "success",
      text: "Area finished. You can start another new area if you still have a free slot.",
    });
    setAreaPanelBusy(false);
  }

  function openClaimBuildPanel(
    nextClaimAreaMode: ClaimAreaClaimMode,
    nextTargetAreaId: string | null,
    nextTargetAreaName?: string,
  ): void {
    const nextPendingClaimCount = getPendingClaimCount(
      pendingClaimPixelsRef.current,
      pendingClaimRectanglesRef.current,
    );
    const claimContextChanged =
      claimAreaModeRef.current !== nextClaimAreaMode ||
      claimTargetAreaIdRef.current !== nextTargetAreaId;

    if (claimContextChanged && nextPendingClaimCount > 0) {
      syncPendingClaims([], []);
      setRectangleAnchor(null);
      setPlacementMessage({
        tone: "info",
        text: nextClaimAreaMode === "expand"
          ? `Pending Claim Area cells were cleared. Extend mode now targets ${nextTargetAreaName ?? "the selected area"}.`
          : "Pending Claim Area cells were cleared. Claim Area is ready to start a new area.",
      });
    } else {
      if (claimContextChanged) {
        setRectangleAnchor(null);
      }

      setPlacementMessage(
        nextClaimAreaMode === "new" && currentUser !== null && newAreaBlockedReason !== null
          ? {
              tone: "info",
              text: newAreaBlockedReason,
            }
          : null,
      );
    }

    setActiveBuildMode("claim");
    setClaimAreaMode(nextClaimAreaMode);
    setClaimTargetAreaId(nextTargetAreaId);
    setBuildPanelOpen(true);
    setBuildPanelMinimized(false);
    spaceStrokeRef.current = null;
  }

  function handleAreaExtend(): void {
    if (selectedArea === null || !selectedArea.viewer_can_edit) {
      return;
    }

    if (selectedArea.status !== "active") {
      setAreaMessage({
        tone: "error",
        text: "Finished areas cannot be extended.",
      });
      return;
    }

    setAreaMessage(null);
    openClaimBuildPanel("expand", selectedArea.id, selectedArea.name);
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

    applyAreaSelection(cacheClaimAreaSummary(result.area), { syncDrafts: false });
    setAreaInvitePublicId("");
    setAreaMessage({
      tone: "success",
      text: `Player #${publicId} can now pixel in this area.`,
    });
    setAreaPanelBusy(false);
  }

  async function handleAreaRemoveContributor(publicId: number, displayName: string): Promise<void> {
    if (selectedArea === null || areaPanelBusy) {
      return;
    }

    setAreaPanelBusy(true);
    setAreaMessage(null);
    setAreaPlayerOptionsMenu(null);

    const result = await removeAreaContributor(selectedArea.id, publicId);

    if (!result.ok || result.area === null) {
      setAreaMessage({
        tone: "error",
        text: result.error ?? "Contributor removal failed.",
      });
      setAreaPanelBusy(false);
      return;
    }

    applyAreaSelection(cacheClaimAreaSummary(result.area), { syncDrafts: false });
    await refreshOwnedAreas();
    setAreaMessage({
      tone: "success",
      text: `Player #${publicId} ${displayName} was removed from this area.`,
    });
    setAreaPanelBusy(false);
  }

  async function handleAreaPromoteContributor(publicId: number, displayName: string): Promise<void> {
    if (selectedArea === null || areaPanelBusy) {
      return;
    }

    setAreaPanelBusy(true);
    setAreaMessage(null);
    setAreaPlayerOptionsMenu(null);

    const result = await promoteAreaContributor(selectedArea.id, publicId);

    if (!result.ok || result.area === null) {
      setAreaMessage({
        tone: "error",
        text: result.error ?? "Contributor promote failed.",
      });
      setAreaPanelBusy(false);
      return;
    }

    applyAreaSelection(cacheClaimAreaSummary(result.area), { syncDrafts: false });
    await refreshOwnedAreas();
    setAreaMessage({
      tone: "success",
      text: `Player #${publicId} ${displayName} is now an admin for this area.`,
    });
    setAreaPanelBusy(false);
  }

  function handleBuildModeChange(nextMode: BuildMode): void {
    if (currentUser === null) {
      setActiveModal("login");
      return;
    }

    if (nextMode === "claim") {
      openClaimBuildPanel("new", null);
      return;
    }

    setActiveBuildMode(nextMode);
    setBuildPanelOpen(true);
    setBuildPanelMinimized(false);
    setPlacementMessage(null);
    spaceStrokeRef.current = null;
    setRectangleAnchor(null);
  }

  function handleClaimToolChange(nextTool: ClaimTool): void {
    setClaimTool(nextTool);
    setPlacementMessage(null);

    if (nextTool !== "rectangle") {
      setRectangleAnchor(null);
    }

    if (nextTool !== "overlay") {
      setOverlayPaletteOpen(false);
    }
  }

  function handlePaintToolChange(nextTool: PaintTool): void {
    setPaintTool(nextTool);
    setPlacementMessage(null);
  }

  function handleMinimizeBuildPanel(): void {
    setBuildPanelOpen(false);
    setBuildPanelMinimized(true);
    setPlacementMessage(null);
    setRectangleAnchor(null);
    buildPanelDragState.current = null;
  }

  function handleCloseBuildPanel(): void {
    setBuildPanelOpen(false);
    setBuildPanelMinimized(false);
    setBuildPanelPosition(null);
    setPlacementMessage(null);
    setRectangleAnchor(null);
    buildPanelDragState.current = null;

    if (pendingClaimCount === 0 && pendingOverlayDraftRef.current === null) {
      setClaimAreaMode("new");
      setClaimTargetAreaId(null);
    }
  }

  function handleRestoreBuildPanel(): void {
    setBuildPanelOpen(true);
    setBuildPanelMinimized(false);
    setPlacementMessage(null);
  }

  function handleClearActivePending(): void {
    if (activeBuildMode === "claim" && claimTool === "overlay") {
      setPendingOverlayDraft(null);
      overlaySourceRef.current = null;
      setOverlayPaletteOpen(false);
    } else if (activeBuildMode === "claim") {
      syncPendingClaims([], []);
      setRectangleAnchor(null);
    } else {
      syncPendingPaints([]);
    }

    setPlacementMessage({
      tone: "info",
      text: `${BUILD_MODE_LABEL[activeBuildMode]} pending changes cleared.`,
    });
  }

  function handleRemoveSelectedPending(): void {
    if (selectedPixel === null) {
      return;
    }

    if (activeBuildMode === "claim") {
      const selectedKey = getPixelKey(selectedPixel);

      if (pendingClaimPixelMapRef.current.has(selectedKey)) {
        const nextPendingClaimPixels = pendingClaimPixelsRef.current.filter(
          (pixel) => getPixelKey(pixel) !== selectedKey,
        );
        syncPendingClaims(nextPendingClaimPixels, pendingClaimRectanglesRef.current);
        setPlacementMessage({
          tone: "info",
          text: "Selected staged Claim Area cell removed.",
        });
        return;
      }

      const nextPendingClaimRectangles: PendingClaimRectangle[] = [];
      let removed = false;

      for (const rectangle of pendingClaimRectanglesRef.current) {
        if (!removed && isPixelInsidePendingClaimRectangle(selectedPixel, rectangle)) {
          nextPendingClaimRectangles.push(...splitPendingClaimRectangleAtPixel(rectangle, selectedPixel));
          removed = true;
          continue;
        }

        nextPendingClaimRectangles.push(rectangle);
      }

      if (!removed) {
        return;
      }

      syncPendingClaims(pendingClaimPixelsRef.current, nextPendingClaimRectangles);
      setPlacementMessage({
        tone: "info",
        text: "Selected staged Claim Area cell removed.",
      });
      return;
    }

    if (selectedPendingPaint === null) {
      return;
    }

    const selectedKey = getPixelKey(selectedPixel);
    const nextPendingPaints = pendingPaintsRef.current.filter((paint) => getPixelKey(paint) !== selectedKey);
    syncPendingPaints(nextPendingPaints);
    setPlacementMessage({
      tone: "info",
      text: "Selected pending pixel removed.",
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
  const claimPanelModeLabel = claimAreaMode === "expand" ? "Extend area" : "New area";
  const claimPanelModeHelp = claimAreaMode === "expand"
    ? activeClaimTargetArea === null
      ? "Open Area Info on one of your areas to choose which territory should grow."
      : `Extending ${activeClaimTargetAreaName}. Use Area Info to switch areas or finish this active area later.`
    : newAreaBlockedReason ?? "Claim Area starts a new active area. Extend existing areas only from Area Info.";
  const buildPanelModeLabel = activeBuildMode === "claim" ? claimPanelModeLabel : BUILD_MODE_LABEL.paint;
  const buildPanelModeHelp = activeBuildMode === "claim" ? claimPanelModeHelp : BUILD_MODE_HELP.paint;
  const newAreaButtonActive = buildPanelOpen && activeBuildMode === "claim" && claimAreaMode === "new";
  const newAreaButtonDisabled = currentUser !== null && newAreaBlockedReason !== null;
  const colorPixelProjection = useProjectedNormalPixelState(currentUser);
  const colorPixelButtonLabel = currentUser === null
    ? "Login required"
    : `${Math.max(0, colorPixelProjection.displayedPixels - pendingPaints.length)} / ${currentUser.normal_pixel_limit} Pixel`;
  const colorPixelButtonHelp = "Color Pixel: You can only pixel in areas you own or where you were added.";
  const areaSections = [
    {
      key: "owned-active",
      title: "Your active artworks",
      detail: currentUser
        ? `${ownedActiveAreas.length} / ${currentUser.claim_area_limit} active slot${currentUser.claim_area_limit === 1 ? "" : "s"} used`
        : `${ownedActiveAreas.length} active`,
      empty: "You do not have an active artwork right now.",
      areas: ownedActiveAreas,
    },
    {
      key: "contributed-active",
      title: "Active claims you joined",
      detail: `${contributedActiveAreas.length} active`,
      empty: "No active contributor claims found.",
      areas: contributedActiveAreas,
    },
    {
      key: "finished",
      title: "Finished artworks",
      detail: `${finishedVisibleAreas.length} finished`,
      empty: "No finished artworks found yet.",
      areas: finishedVisibleAreas,
    },
  ];
  const selectedAreaPaintPercent = selectedArea === null || selectedArea.claimed_pixels_count <= 0
    ? 0
    : Math.round((selectedArea.painted_pixels_count / selectedArea.claimed_pixels_count) * 100);
  const selectedAreaCanManage = selectedArea?.viewer_can_edit ?? false;
  const selectedAreaContributors = isClaimAreaSummary(selectedArea) ? selectedArea.contributors : [];
  const areaDraftNameLength = areaDraftName.length;
  const areaDraftDescriptionLength = areaDraftDescription.length;
  const areaDraftNameTooLong = areaDraftNameLength > AREA_NAME_MAX_LENGTH;
  const areaDraftDescriptionTooLong = areaDraftDescriptionLength > AREA_DESCRIPTION_MAX_LENGTH;
  const areaDraftInvalid = areaDraftNameTooLong || areaDraftDescriptionTooLong;

  return (
    <main className={`world-shell ${darkMode ? "theme-dark" : "theme-light"}`}>
      <PerfDebugOverlay getSnapshot={getDebugWorldSnapshot} />
      {process.env.NODE_ENV === "development" && devRecoveryNotice !== null ? (
        <div className="dev-recovery-notice" role="status">
          <span>{devRecoveryNotice}</span>
          <button
            aria-label="Dismiss development recovery notice"
            className="dev-recovery-dismiss"
            onClick={() => setDevRecoveryNotice(null)}
            title="Dismiss"
            type="button"
          >
            x
          </button>
        </div>
      ) : null}
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
          <>
            <button
              className="hud-login-button hud-areas-button"
              onClick={() => setActiveModal("areas")}
              type="button"
            >
              Areas
            </button>
            <button
              aria-label="Open shop"
              className="hud-icon-button hud-shop-button"
              onClick={() => setActiveModal("shop")}
              type="button"
            >
              <ShopIcon />
            </button>
          </>
        ) : null}
        <button className="hud-login-button" onClick={() => setActiveModal("login")} type="button">
          {accountButtonLabel}
        </button>
      </div>

      {inspectedPixel ? (
        <aside className="world-area-panel" aria-label="Selected area information">
          <div className="area-panel-header">
            <div className="area-panel-title">
              <span className="coordinate-label">Selected area</span>
              <strong>
                {areaPanelBusy && selectedArea === null
                  ? "Loading..."
                  : selectedArea?.name
                    ?? (inspectedPixelRecord?.is_starter
                      ? "Starter frontier"
                      : inspectedPixelRecord?.area_id
                        ? "Selected claim"
                        : "No claim area")}
              </strong>
            </div>
            <div className="area-panel-actions">
              {selectedArea ? (
                <button
                  aria-label="Open area options"
                  className="area-options-button"
                  onClick={(event) => (
                    openAreaOptionsMenu(event, selectedArea.public_id, "area", selectedAreaCanManage)
                  )}
                  title="More options"
                  type="button"
                >
                  ...
                </button>
              ) : null}
              <button
                aria-label="Close area info"
                className="pixel-panel-close area-panel-close"
                onClick={handleCloseAreaPanel}
                title="Close"
                type="button"
              >
                x
              </button>
            </div>
          </div>
          {selectedArea ? (
            <>
              <div className="area-summary-card">
                <dl className="area-summary-list">
                  <div>
                    <dt>Name</dt>
                    <dd className="area-summary-name-value">{selectedArea.name}</dd>
                  </div>
                  <div>
                    <dt>Description</dt>
                    <dd>{selectedArea.description || "No area info yet."}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{getClaimAreaStatusLabel(selectedArea.status)}</dd>
                  </div>
                  <div>
                    <dt>Painted</dt>
                    <dd>
                      {selectedArea.painted_pixels_count} / {selectedArea.claimed_pixels_count}
                    </dd>
                  </div>
                  <div>
                    <dt>Painted in %</dt>
                    <dd>{selectedAreaPaintPercent}%</dd>
                  </div>
                </dl>
              </div>
              {selectedAreaCanManage && areaEditorOpen ? (
                <div className="area-edit-card">
                  <div className="area-field-stack">
                    <label className="account-label" htmlFor="area-name-input">Name</label>
                    <input
                      aria-describedby="area-name-limit"
                      aria-invalid={areaDraftNameTooLong}
                      className="account-input area-input"
                      id="area-name-input"
                      onChange={(event) => setAreaDraftName(event.target.value)}
                      value={areaDraftName}
                    />
                    <span
                      className={`area-field-limit ${areaDraftNameTooLong ? "is-error" : ""}`}
                      id="area-name-limit"
                    >
                      {areaDraftNameLength} / {AREA_NAME_MAX_LENGTH}
                    </span>
                  </div>
                  <div className="area-field-stack">
                    <label className="account-label" htmlFor="area-description-input">Description</label>
                    <textarea
                      aria-describedby="area-description-limit"
                      aria-invalid={areaDraftDescriptionTooLong}
                      className="account-input area-textarea"
                      id="area-description-input"
                      onChange={(event) => setAreaDraftDescription(event.target.value)}
                      value={areaDraftDescription}
                    />
                    <span
                      className={`area-field-limit ${areaDraftDescriptionTooLong ? "is-error" : ""}`}
                      id="area-description-limit"
                    >
                      {areaDraftDescriptionLength} / {AREA_DESCRIPTION_MAX_LENGTH}
                    </span>
                  </div>
                  <div className="area-inline-actions">
                    <button
                      className="google-button area-action-button"
                      disabled={areaPanelBusy || areaDraftInvalid}
                      onClick={() => void handleAreaSave()}
                      type="button"
                    >
                      {areaPanelBusy ? "Saving..." : "Save"}
                    </button>
                    <button
                      className="pixel-clear-button"
                      disabled={areaPanelBusy}
                      onClick={() => setAreaEditorOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="area-access-card">
                <div className="area-access-header">
                  <div className="area-participant">
                    <AreaParticipantAvatar participant={selectedArea.owner} />
                    <div className="area-participant-name">
                      <span>Owner</span>
                      <strong>#{selectedArea.owner.public_id} {selectedArea.owner.display_name}</strong>
                    </div>
                    <span className="area-role-tag is-owner">Owner</span>
                  </div>
                </div>
                <div className="area-access-list">
                  <span>Invited</span>
                  {selectedAreaContributors.length > 0 ? (
                    selectedAreaContributors.map((contributor) => (
                      <div className="area-access-row" key={contributor.id}>
                        <div className="area-participant">
                          <AreaParticipantAvatar participant={contributor} />
                          <strong>#{contributor.public_id} {contributor.display_name}</strong>
                          {contributor.role === "admin" ? (
                            <span className="area-role-tag is-admin">Admin</span>
                          ) : null}
                        </div>
                        {selectedAreaCanManage ? (
                          <div className="area-player-actions">
                            <button
                              aria-label={`Open options for #${contributor.public_id} ${contributor.display_name}`}
                              className="area-player-options-button"
                              onClick={(event) => openAreaPlayerOptionsMenu(event, contributor)}
                              title="Player options"
                              type="button"
                            >
                              ...
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <small>No players invited.</small>
                  )}
                </div>
                {selectedAreaCanManage ? (
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
                      aria-label="Invite player"
                      className="area-add-player-button"
                      disabled={areaPanelBusy}
                      onClick={() => void handleAreaInvite()}
                      title="Invite player"
                      type="button"
                    >
                      +
                    </button>
                  </div>
                ) : null}
              </div>
              {selectedAreaCanManage ? (
                <div className="area-primary-actions">
                  {selectedArea.status === "active" ? (
                    <button
                      className="google-button area-action-button"
                      disabled={areaPanelBusy}
                      onClick={handleAreaExtend}
                      type="button"
                    >
                      Extend Area
                    </button>
                  ) : null}
                  {selectedArea.status === "active" ? (
                    <button
                      className="google-button area-action-button area-finish-button"
                      disabled={areaPanelBusy || pendingClaimCount > 0}
                      onClick={() => void handleAreaFinish()}
                      type="button"
                    >
                      {areaPanelBusy ? "Finishing..." : "Finish Area"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {selectedAreaCanManage && selectedArea.status === "active" && pendingClaimCount > 0 ? (
                <p className="area-description">
                  Submit your pending Claim Area cells before finishing this active area.
                </p>
              ) : null}
              {areaDetailsBusy ? (
                <p className="area-description">Loading contributor access...</p>
              ) : null}
            </>
          ) : areaPanelBusy ? (
            <p className="area-description">Loading area details...</p>
          ) : inspectedPixelRecord?.is_starter ? (
            <p className="area-description">
              Starter frontier cells are reserved and do not belong to a claim area.
            </p>
          ) : (
            <p className="area-description">No claim area exists at this cell yet.</p>
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
        {canShowGrid ? (
          <button
            aria-label="Toggle grid"
            aria-pressed={gridVisible}
            className={modalButtonClass(gridVisible)}
            onClick={() => setShowGrid((current) => !current)}
            type="button"
          >
            Grid
          </button>
        ) : null}
        <button
          aria-label="Toggle dark mode"
          className={modalButtonClass(darkMode)}
          onClick={() => setDarkMode((current) => !current)}
          type="button"
        >
          Dark
        </button>
      </div>

      {currentUser ? (
        <div className="world-hud world-hud-bottom-center">
          <div className="build-taskbar" aria-label="Build tools">
            <button
              className={`build-tool-button ${newAreaButtonActive ? "is-active" : ""}`}
              disabled={newAreaButtonDisabled}
              onClick={() => handleBuildModeChange("claim")}
              title={newAreaBlockedReason ?? "Start a new claim area"}
              type="button"
            >
              <span>{BUILD_MODE_LABEL.claim}</span>
              <small>{newAreaButtonDisabled ? "Unavailable" : "New area"}</small>
              {pendingClaimCount > 0 ? <strong>{pendingClaimCount}</strong> : null}
            </button>
            <button
              className={`build-tool-button ${buildPanelOpen && activeBuildMode === "paint" ? "is-active" : ""}`}
              onClick={() => handleBuildModeChange("paint")}
              title={colorPixelButtonHelp}
              type="button"
            >
              <span>{BUILD_MODE_LABEL.paint}</span>
              <small>{colorPixelButtonLabel}</small>
              {pendingPaints.length > 0 ? <strong>{pendingPaints.length}</strong> : null}
            </button>
          </div>
        </div>
      ) : null}

      {buildPanelOpen && currentUser ? (
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
                <span className="coordinate-label">{buildPanelModeLabel}</span>
                <strong className="pixel-placement-title">
                  {selectedPixel === null ? "No pixel selected" : `${selectedPixel.x} : ${selectedPixel.y}`}
                </strong>
                <span className="pixel-placement-mode-help">{buildPanelModeHelp}</span>
              </div>
              <div className="pixel-placement-header-actions">
                <span className="pixel-placement-owner">{selectedCellLabel}</span>
                <button
                  aria-label="Minimize build panel"
                  className="pixel-panel-close"
                  onClick={handleMinimizeBuildPanel}
                  onPointerDown={(event) => event.stopPropagation()}
                  title="Minimize"
                  type="button"
                >
                  -
                </button>
                <button
                  aria-label="Close build panel"
                  className="pixel-panel-close"
                  onClick={handleCloseBuildPanel}
                  onPointerDown={(event) => event.stopPropagation()}
                  title="Close"
                  type="button"
                >
                  x
                </button>
              </div>
            </div>
            {activeBuildMode === "claim" ? (
              <HolderPanelSummary pendingClaims={pendingClaimCount} user={currentUser} />
            ) : (
              <NormalPixelPanelSummary pendingPaints={pendingPaints.length} user={currentUser} />
            )}
            {activeBuildMode === "claim" ? (
              <p className="pixel-placement-help">
                {claimAreaMode === "expand"
                  ? activeClaimTargetArea === null
                    ? "Extend mode is waiting for a target area from Area Info."
                    : `Target area: ${activeClaimTargetArea.name} (${getClaimAreaStatusLabel(activeClaimTargetArea.status)}).`
                  : newAreaBlockedReason ?? "New areas start from Claim Area. Existing areas grow only from Area Info."}
              </p>
            ) : null}
            {activeBuildMode === "claim" ? (
              <div className="claim-tool-row" aria-label="Claim Area tools">
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
                <button
                  className={`claim-tool-button ${claimTool === "overlay" ? "is-active" : ""}`}
                  disabled={claimAreaMode !== "new"}
                  onClick={() => handleClaimToolChange("overlay")}
                  title={claimAreaMode !== "new" ? "Overlay creates a new Claim Area." : "Upload an image overlay"}
                  type="button"
                >
                  Overlay
                </button>
                {rectanglePlacementBusy ? (
                  <span>Checking...</span>
                ) : rectangleAnchor ? (
                  <span>{rectangleAnchor.x} : {rectangleAnchor.y}</span>
                ) : null}
              </div>
            ) : null}
            {activeBuildMode === "claim" && claimTool === "overlay" ? (
              <div className="claim-overlay-tool" onDragOver={handleOverlayDragOver} onDrop={handleOverlayDrop}>
                <input
                  accept="image/png,image/webp,image/jpeg,image/gif,image/*"
                  className="overlay-file-input"
                  onChange={(event) => void handleOverlayFileChange(event)}
                  ref={overlayFileInputRef}
                  type="file"
                />
                <button className="overlay-drop-zone" onClick={handleOverlayUploadClick} type="button">
                  <strong>{pendingOverlayDraft?.imageName ?? "Upload overlay image"}</strong>
                  <span>
                    {pendingOverlayDraft
                      ? `${pendingOverlayDraft.sourceWidth} x ${pendingOverlayDraft.sourceHeight} source`
                      : "Drop PNG, WEBP or another image here"}
                  </span>
                </button>
                <div className="overlay-control-grid">
                  <label className="overlay-control">
                    <span>Color Mode</span>
                    <select
                      disabled={pendingOverlayDraft === null}
                      onChange={(event) => updatePendingOverlayDraft((current) => ({
                        ...current,
                        colorMode: event.target.value as OverlayColorMode,
                      }))}
                      value={pendingOverlayDraft?.colorMode ?? "perceptual"}
                    >
                      <option value="perceptual">Perceptual</option>
                      <option value="rgb">RGB</option>
                    </select>
                  </label>
                  <label className="overlay-control">
                    <span>Color Palette</span>
                    <button
                      className="overlay-select-button"
                      disabled={pendingOverlayDraft === null}
                      onClick={() => setOverlayPaletteOpen((current) => !current)}
                      type="button"
                    >
                      {pendingOverlayDraft
                        ? `${pendingOverlayDraft.enabledColorIds.length} colors`
                        : "All colors"}
                    </button>
                  </label>
                </div>
                <label className="overlay-toggle">
                  <input
                    checked={pendingOverlayDraft?.dithering ?? false}
                    disabled={pendingOverlayDraft === null}
                    onChange={(event) => updatePendingOverlayDraft((current) => ({
                      ...current,
                      dithering: event.target.checked,
                    }))}
                    type="checkbox"
                  />
                  <span>Dithering</span>
                </label>
                <div className="overlay-action-row">
                  <button
                    className="pixel-clear-button"
                    disabled={pendingOverlayDraft === null}
                    onClick={() => updatePendingOverlayDraft((current) => ({ ...current, flipX: !current.flipX }))}
                    type="button"
                  >
                    Flip X
                  </button>
                  <button
                    className="pixel-clear-button"
                    disabled={pendingOverlayDraft === null}
                    onClick={() => updatePendingOverlayDraft((current) => ({ ...current, flipY: !current.flipY }))}
                    type="button"
                  >
                    Flip Y
                  </button>
                  <button
                    className="pixel-clear-button"
                    disabled={pendingOverlayDraft === null}
                    onClick={handleOverlayCenter}
                    type="button"
                  >
                    Center
                  </button>
                  <button
                    className="pixel-clear-button"
                    disabled={pendingOverlayDraft === null}
                    onClick={handleOverlayRestoreRatio}
                    type="button"
                  >
                    Restore Ratio
                  </button>
                </div>
                {pendingOverlayDraft ? (
                  <div className="overlay-meta-row">
                    <span>{pendingOverlayDraft.transform.width} x {pendingOverlayDraft.transform.height}</span>
                    <strong>{formatCount(pendingOverlayPixelCount)} pixels</strong>
                  </div>
                ) : null}
              </div>
            ) : null}
            {activeBuildMode === "claim" && claimTool === "overlay" && overlayPaletteOpen && pendingOverlayDraft ? (
              <div className="overlay-palette-window">
                <div className="overlay-palette-header">
                  <strong>Color Plate</strong>
                  <div>
                    <button
                      className="pixel-clear-button"
                      onClick={() => updatePendingOverlayDraft((current) => ({
                        ...current,
                        enabledColorIds: CLAIM_OVERLAY_DEFAULT_COLOR_IDS,
                      }))}
                      type="button"
                    >
                      All
                    </button>
                    <button
                      className="pixel-clear-button"
                      onClick={() => updatePendingOverlayDraft((current) => ({
                        ...current,
                        enabledColorIds: [],
                      }))}
                      type="button"
                    >
                      None
                    </button>
                    <button
                      className="pixel-clear-button"
                      onClick={() => setOverlayPaletteOpen(false)}
                      type="button"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="overlay-palette-colors">
                  {CLAIM_OVERLAY_VISIBLE_PALETTE.map((color) => {
                    const enabled = pendingOverlayDraft.enabledColorIds.includes(color.id);

                    return (
                      <label className="overlay-color-toggle" key={color.id} title={color.name}>
                        <input
                          checked={enabled}
                          onChange={(event) => updatePendingOverlayDraft((current) => {
                            const colorIds = new Set(current.enabledColorIds);

                            if (event.target.checked) {
                              colorIds.add(color.id);
                            } else {
                              colorIds.delete(color.id);
                            }

                            return {
                              ...current,
                              enabledColorIds: CLAIM_OVERLAY_DEFAULT_COLOR_IDS.filter((colorId) => colorIds.has(colorId)),
                            };
                          })}
                          type="checkbox"
                        />
                        <span style={{ backgroundColor: color.hex }} />
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {activeBuildMode === "paint" ? (
              <div className="pixel-palette-grid">
                <div className="paint-tool-row" aria-label="Color Pixel tools">
                  <button
                    className={`claim-tool-button paint-tool-button ${paintTool === "brush" ? "is-active" : ""}`}
                    onClick={() => handlePaintToolChange("brush")}
                    type="button"
                  >
                    Brush
                  </button>
                  <button
                    className={`claim-tool-button paint-tool-button ${paintTool === "eraser" ? "is-active" : ""}`}
                    onClick={() => handlePaintToolChange("eraser")}
                    title="Only removes locally staged Color Pixels. It does not submit transparent pixels."
                    type="button"
                  >
                    Eraser
                  </button>
                  <button
                    className={`claim-tool-button paint-tool-button ${paintTool === "picker" ? "is-active" : ""}`}
                    onClick={() => handlePaintToolChange("picker")}
                    title="Pick the exact color from the canvas or overlay. Middle-click triggers the picker too."
                    type="button"
                  >
                    <svg aria-hidden="true" className="paint-tool-button-icon" viewBox="0 0 24 24">
                      <path
                        d="M4 20l4.5-1 8.2-8.2-3.5-3.5L5 15.5 4 20z"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M12 5.5l3.5 3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                    <span>Pick</span>
                  </button>
                </div>
                {PIXEL_PALETTE_DISPLAY_ROWS.map((row, rowIndex) => (
                  <div className="pixel-palette-row" key={`palette-row-${rowIndex}`}>
                    {row.map((color) => (
                      <button
                        aria-label={`Select ${color.name}`}
                        className={`pixel-color-button ${color.id === TRANSPARENT_COLOR_ID ? "is-transparent" : ""} ${selectedColorId === color.id ? "is-active" : ""}`}
                        key={color.id}
                        onClick={() => {
                          setSelectedColorId(color.id);
                          emitDebugEvent("action", "Brush color selected from palette", `#${color.id} ${color.name}`);
                          setPaintTool("brush");
                        }}
                        style={color.hex === "transparent" ? undefined : { backgroundColor: color.hex }}
                        title={color.name}
                        type="button"
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="pixel-placement-footer">
              <div className="pixel-pending-row">
                <span>{activePendingLabel}</span>
                <div className="pixel-pending-actions">
                  <button
                    className="pixel-clear-button"
                    disabled={placementBusy || !canRemoveSelectedPending}
                    onClick={handleRemoveSelectedPending}
                    type="button"
                  >
                    Remove selected
                  </button>
                  <button
                    className="pixel-clear-button"
                    disabled={placementBusy || activePendingCount === 0}
                    onClick={handleClearActivePending}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
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

      {buildPanelMinimized && !buildPanelOpen && currentUser ? (
        <button
          aria-label="Open build panel"
          className="build-panel-launcher"
          onClick={handleRestoreBuildPanel}
          type="button"
        >
          <span>{buildPanelModeLabel}</span>
          <strong>{activePendingCount > 0 ? `${activePendingCount} pending` : "Open panel"}</strong>
        </button>
      ) : null}

      <div
        className={`world-viewport immersive ${gridVisible ? "grid-visible" : "grid-hidden"} ${paintTool === "picker" ? "is-color-picking" : ""}`}
        onAuxClick={handleViewportAuxClick}
        onContextMenu={handleViewportContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        ref={viewportRef}
      >
            <WorldViewportCanvas
              activeChunkBoundaryRects={activeChunkBoundaryRects}
              activeChunkViewportRects={activeChunkViewportRects}
              bulkPendingClaimOverlay={bulkPendingClaimOverlay}
              camera={camera}
              claimOutlinePaths={claimOutlinePaths}
              crosshairHorizontalRef={crosshairHorizontalRef}
              crosshairVerticalRef={crosshairVerticalRef}
          getVisualTileFallback={getVisualTileFallback}
          getVisualTileSrc={getVisualTileSrc}
          gridLines={gridLines}
          onTileDebugSignal={handleTileDebugSignal}
              onTileLoaded={handleTileLoaded}
              outsideArtPatternImages={outsideArtPatternImages}
              pendingPaintTiles={pendingPaintTiles}
              pendingClaimOutlinePath={pendingClaimOutlinePath}
              renderedPendingClaims={renderedPendingClaims}
              renderedWorldTiles={renderedWorldTiles}
          retainedVisualTileSrcs={retainedTileSrcRef.current.visual}
          hoverPixelOverlay={hoverPixelOverlay}
          paintCursorOverlay={paintCursorOverlay}
          selectedPixelOverlay={selectedPixelOverlay}
          viewportSize={viewportSize}
          worldOutsideMaskId={worldOutsideMaskId}
          worldOutsidePatternId={worldOutsidePatternId}
        />
        {selectedAreaOverlay && selectedAreaOverlayTransform && selectedAreaOverlayPreviewDataUrl ? (
          <ClaimOverlaySurface
            camera={camera}
            editable={false}
            imageName={selectedAreaOverlay.image_name}
            previewDataUrl={selectedAreaOverlayPreviewDataUrl}
            templatePixelCount={selectedAreaOverlay.template_pixels.length}
            transform={selectedAreaOverlayTransform}
          />
        ) : null}
        {pendingOverlayDraft ? (
          <ClaimOverlaySurface
            camera={camera}
            editable={activeBuildMode === "claim" && claimTool === "overlay"}
            imageName={pendingOverlayDraft.imageName}
            onHandlePointerDown={handleOverlayHandlePointerDown}
            onMovePointerDown={handleOverlayPointerDown}
            onPointerCancel={handleOverlayPointerUp}
            onPointerMove={handleOverlayPointerMove}
            onPointerUp={handleOverlayPointerUp}
            previewDataUrl={pendingOverlayDraft.previewDataUrl}
            templatePixelCount={pendingOverlayPixelCount}
            transform={pendingOverlayDraft.transform}
          />
        ) : null}
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
                    Use the bottom taskbar to switch between Claim Area and Color Pixel painting.
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
                      <div className="changelog-sections">
                        {entry.sections.map((section) => (
                          <section className="changelog-section" key={`${entry.version}-${section.title}`}>
                            <h3 className="changelog-section-title">{section.title}</h3>
                            <ul>
                              {section.items.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </section>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
            <p className="modal-version">Version {APP_VERSION}</p>
          </section>
        </div>
      ) : null}

      {activeModal === "areas" ? (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} role="presentation">
          <section
            aria-labelledby="areas-title"
            className="modal-window login-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Claims</p>
                <h2 id="areas-title">My areas</h2>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} type="button">
                Close
              </button>
            </div>
            <div className="modal-scroll-area">
              <div className="modal-card owned-area-card">
                <div className="owned-area-toolbar">
                  <span>
                    {ownedAreasLoading
                      ? "Loading..."
                      : currentUser
                        ? `${ownedActiveAreas.length} / ${currentUser.claim_area_limit} active area slot${currentUser.claim_area_limit === 1 ? "" : "s"} used`
                        : `${ownedAreas.length} area${ownedAreas.length === 1 ? "" : "s"}`}
                  </span>
                  <button
                    className="pixel-clear-button"
                    disabled={ownedAreasLoading}
                    onClick={() => void refreshOwnedAreas()}
                    type="button"
                  >
                    Refresh
                  </button>
                </div>
                {ownedAreasMessage ? (
                  <p className={`account-feedback is-${ownedAreasMessage.tone}`}>{ownedAreasMessage.text}</p>
                ) : null}
                {!ownedAreasLoading && ownedAreas.length === 0 ? (
                  <p className="account-helper">No claim areas found.</p>
                ) : null}
                <div className="owned-area-sections">
                  {areaSections.map((section) => (
                    <section className="owned-area-section" key={section.key}>
                      <div className="owned-area-section-header">
                        <strong>{section.title}</strong>
                        <span>{section.detail}</span>
                      </div>
                      {!ownedAreasLoading && section.areas.length === 0 ? (
                        <p className="account-helper">{section.empty}</p>
                      ) : null}
                      <div className="owned-area-list">
                        {section.areas.map((area) => {
                          const paintedRatio = area.claimed_pixels_count === 0
                            ? 0
                            : Math.round((area.painted_pixels_count / area.claimed_pixels_count) * 100);
                          const areaRole = area.viewer_can_edit
                            ? "Owner"
                            : `Contributor to #${area.owner.public_id}`;

                          return (
                            <article className="owned-area-item" key={`${section.key}-${area.id}`}>
                              <div className="owned-area-main">
                                <strong>{area.name}</strong>
                                <span>
                                  {formatCount(area.claimed_pixels_count)} claims - {paintedRatio}% painted
                                </span>
                                <small>{getClaimAreaStatusLabel(area.status)} - {areaRole}</small>
                                <small>
                                  {area.bounds.min_x}:{area.bounds.min_y} to {area.bounds.max_x}:{area.bounds.max_y}
                                </small>
                              </div>
                              <div className="owned-area-meta">
                                <small>{area.bounds.width} x {area.bounds.height}</small>
                                <small>{formatDateTime(area.last_activity_at)}</small>
                                <button
                                  className="area-options-button owned-area-options-button"
                                  onClick={(event) => openAreaOptionsMenu(event, area.public_id, "areas-list")}
                                  type="button"
                                >
                                  Options
                                </button>
                              </div>
                              <button
                                className="google-button owned-area-jump"
                                onClick={() => focusClaimArea(area)}
                                type="button"
                              >
                                Jump
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
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
                      <small>{currentUser.claimed_pixels_count} claimed pixels</small>
                    </article>
                    <article className="account-stat-card">
                      <span className="account-stat-label">Color Pixels</span>
                      <NormalPixelAccountCount user={currentUser} />
                      <NormalPixelAccountStatus user={currentUser} />
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
                    disabled={
                      authLoading ||
                      authBusy ||
                      authStatus.request_failed === true ||
                      !authStatus.google_oauth_configured
                    }
                    onClick={handleGoogleLogin}
                    type="button"
                  >
                    {authLoading
                      ? "Checking auth..."
                      : authStatus.request_failed === true
                        ? "Auth service unavailable"
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

      {areaOptionsMenu ? (
        <div
          className="area-context-menu-layer"
          onClick={() => setAreaOptionsMenu(null)}
          role="presentation"
        >
          <div
            className="area-context-menu"
            onClick={(event) => event.stopPropagation()}
            role="menu"
            style={{
              left: `${areaOptionsMenu.left}px`,
              top: `${areaOptionsMenu.top}px`,
            }}
          >
            <div className="area-context-menu-header">
              <span>Area options</span>
              <strong>{formatClaimAreaId(areaOptionsMenu.publicId)}</strong>
            </div>
            {areaOptionsMenu.canEdit ? (
              <button
                className="area-context-menu-item"
                onClick={() => {
                  setAreaEditorOpen(true);
                  setAreaOptionsMenu(null);
                }}
                role="menuitem"
                type="button"
              >
                Edit name / description
              </button>
            ) : null}
            <button
              className="area-context-menu-item"
              onClick={() => void copyClaimAreaId(areaOptionsMenu.publicId, areaOptionsMenu.messageTarget)}
              role="menuitem"
              type="button"
            >
              Copy Area ID
            </button>
            <button
              className="area-context-menu-item"
              disabled
              role="menuitem"
              title="Coming later"
              type="button"
            >
              Report Area
            </button>
          </div>
        </div>
      ) : null}

      {areaPlayerOptionsMenu ? (
        <div
          className="area-context-menu-layer"
          onClick={() => setAreaPlayerOptionsMenu(null)}
          role="presentation"
        >
          <div
            className="area-context-menu area-player-context-menu"
            onClick={(event) => event.stopPropagation()}
            role="menu"
            style={{
              left: `${areaPlayerOptionsMenu.left}px`,
              top: `${areaPlayerOptionsMenu.top}px`,
            }}
          >
            <div className="area-context-menu-header">
              <span>Player options</span>
              <strong>#{areaPlayerOptionsMenu.publicId} {areaPlayerOptionsMenu.displayName}</strong>
            </div>
            <button
              className="area-context-menu-item"
              disabled={areaPanelBusy || areaPlayerOptionsMenu.role === "admin"}
              onClick={() => void handleAreaPromoteContributor(
                areaPlayerOptionsMenu.publicId,
                areaPlayerOptionsMenu.displayName,
              )}
              role="menuitem"
              title={areaPlayerOptionsMenu.role === "admin" ? "Already an admin" : undefined}
              type="button"
            >
              Promote to Admin
            </button>
            <button
              className="area-context-menu-item"
              disabled={areaPanelBusy}
              onClick={() => void handleAreaRemoveContributor(
                areaPlayerOptionsMenu.publicId,
                areaPlayerOptionsMenu.displayName,
              )}
              role="menuitem"
              type="button"
            >
              Remove player
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
