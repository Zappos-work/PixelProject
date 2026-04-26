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
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  claimWorldPixels,
  deleteAccount,
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
  purchaseShopItem,
  removeAreaContributor,
  updateClaimArea,
  updateClaimAreaReaction,
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
  type ClaimAreaReactionValue,
  type ClaimAreaSummary,
  type ClaimAreaListItem,
  type ClaimAreaStatus,
  type ClaimOutlineSegment,
  type PaintTileInput,
  type ShopItemId,
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

type ActiveModal = "info" | "changelog" | "login" | "shop" | "areas";

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

type SharedViewport = {
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

type PendingClaimCutoutRectangle = PendingClaimRectangle & {
  stagedPixelKeys: string[];
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

type AppNotification = {
  id: string;
  tone: "info" | "success" | "warning";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
};

type AppToast = {
  id: string;
  tone: ProfileMessage["tone"] | "warning";
  title: string;
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
  coveredClaimedPixelCount: number;
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

type ClaimOutlineDebugStats = {
  pathCount: number;
  pathChars: number;
  pendingPathChars: number;
  fetchBounds: string | null;
  fetchCells: number | null;
  lastFetchMs: number | null;
  lastFetchSegments: number;
  lastFetchTruncated: boolean;
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
  claimOutlinePaths: number;
  claimOutlinePathChars: number;
  pendingClaimOutlinePathChars: number;
  claimOutlineFetchBounds: string | null;
  claimOutlineFetchCells: number | null;
  claimOutlineLastFetchMs: number | null;
  claimOutlineLastFetchSegments: number;
  claimOutlineLastFetchTruncated: boolean;
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
  shadowCoreD: string;
  shadowSoftD: string;
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

type AreaPreviewTile = {
  key: string;
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type AreaPreviewOutlinePath = {
  d: string;
  key: string;
};

type AreaListFilter = "all" | "owned" | "joined" | "finished";

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
  pendingClaimOutlinePaths: ClaimOutlinePath[];
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
const CLAIM_OUTLINE_FETCH_DEBOUNCE_MS = 70;
const CLAIM_OUTLINE_FETCH_REPEAT_CACHE_MS = 1000;
const CLAIM_OUTLINE_FETCH_MARGIN = 2;
const CLAIM_OUTLINE_FETCH_OVERSCAN_VIEWPORT_FACTOR = 0.2;
const CLAIM_OUTLINE_MAX_FREE_FETCH_CELLS = 200_000;
const CLAIM_OUTLINE_MAX_FOCUSED_FETCH_CELLS = 5_000;
const CLAIM_OUTLINE_STROKE_WIDTH = 2.35;
const CLAIM_OUTLINE_SHADOW_CORE_WIDTH = 10;
const CLAIM_OUTLINE_SHADOW_SOFT_WIDTH = 22;
const CLAIM_OUTLINE_SHADOW_CORE_COLOR = "rgba(4, 8, 14, 0.38)";
const CLAIM_OUTLINE_SHADOW_SOFT_COLOR = "rgba(4, 8, 14, 0.2)";
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
const PIXEL_PLACE_SOUND_SRC = "/sounds/pixel-place.wav";
const PIXEL_PLACE_SOUND_THROTTLE_MS = 70;
const SOUND_MUTED_STORAGE_KEY = "pixelproject:sound-muted";
const NOTIFICATION_STORAGE_PREFIX = "pixelproject:notifications:";
const NOTIFICATION_LIMIT = 30;
const TOAST_LIMIT = 4;
const TOAST_DISMISS_MS = 4200;
const AREA_PREVIEW_ASPECT_RATIO = 1.48;
const AREA_PREVIEW_MAX_TILES = 9;
const AREA_PREVIEW_MIN_WORLD_SIZE = 18;
const PIXEL_PALETTE_NAME_BY_ID = new Map<number, string>(PIXEL_PALETTE.map((color) => [color.id, color.name]));
const PIXEL_PALETTE_COLOR_BY_ID = new Map<number, string>(PIXEL_PALETTE.map((color) => [color.id, color.hex]));
const CLAIM_OVERLAY_VISIBLE_PALETTE = PIXEL_PALETTE.filter((color) => color.id !== TRANSPARENT_COLOR_ID);
const CLAIM_OVERLAY_DEFAULT_COLOR_IDS = CLAIM_OVERLAY_VISIBLE_PALETTE.map((color) => color.id);
const BUILD_MODE_LABEL: Record<BuildMode, string> = {
  claim: "Claim Area",
  paint: "Place Pixels",
};
const BUILD_MODE_HELP: Record<BuildMode, string> = {
  claim: "",
  paint: "",
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

function formatShareNumber(value: number, fractionDigits: number): string {
  const fixedValue = value.toFixed(fractionDigits);
  return fractionDigits === 0 ? fixedValue : fixedValue.replace(/\.?0+$/, "");
}

function parseSharedViewportSearch(search: string): SharedViewport | null {
  try {
    const params = new URLSearchParams(search);
    const x = Number.parseFloat(params.get("x") ?? "");
    const y = Number.parseFloat(params.get("y") ?? "");
    const zoom = Number.parseFloat(params.get("zoom") ?? "");

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) {
      return null;
    }

    return { x, y, zoom };
  } catch {
    return null;
  }
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

function formatPlayerNameWithId(displayName: string, publicId: number): string {
  return `${displayName}#${publicId}`;
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
    area.reactions?.like_count ?? 0,
    area.reactions?.dislike_count ?? 0,
    area.reactions?.viewer_reaction ?? "",
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
  let coveredClaimedPixelCount = 0;
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
          coveredClaimedPixelCount,
          overlapsPendingClaim,
          touchesClaimRoute,
        };
      }

      const pixelKey = getPixelKey(pixel);
      if (hasPendingClaimAtPixel(pixel, pendingClaimPixelMap, pendingClaimRectangles)) {
        overlapsPendingClaim = true;
        continue;
      }

      if (pixelMap.has(pixelKey)) {
        coveredClaimedPixelCount += 1;
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
    coveredClaimedPixelCount,
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

function addPendingClaimRowInterval(
  rows: Map<number, PendingClaimRowInterval[]>,
  y: number,
  start: number,
  end: number,
): void {
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
}

function mergePendingClaimRowIntervals(
  rows: Map<number, PendingClaimRowInterval[]>,
): Array<[number, PendingClaimRowInterval[]]> {
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

function buildMergedPendingClaimRowIntervals(
  pendingClaimPixels: PixelCoordinate[],
): Array<[number, PendingClaimRowInterval[]]> {
  const rows = new Map<number, PendingClaimRowInterval[]>();

  for (const pixel of pendingClaimPixels) {
    addPendingClaimRowInterval(rows, pixel.y, pixel.x, pixel.x);
  }

  return mergePendingClaimRowIntervals(rows);
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

function subtractPendingClaimIntervals(
  interval: PendingClaimRowInterval,
  blockers: PendingClaimRowInterval[],
): PendingClaimRowInterval[] {
  const visibleIntervals: PendingClaimRowInterval[] = [];
  let start = interval.start;

  for (const blocker of blockers) {
    if (blocker.end < start) {
      continue;
    }

    if (blocker.start > interval.end) {
      break;
    }

    if (blocker.start > start) {
      visibleIntervals.push({
        start,
        end: Math.min(interval.end, blocker.start - 1),
      });
    }

    start = Math.max(start, blocker.end + 1);

    if (start > interval.end) {
      break;
    }
  }

  if (start <= interval.end) {
    visibleIntervals.push({ start, end: interval.end });
  }

  return visibleIntervals;
}

function addClaimOutlineEdge(
  target: Map<number, PendingClaimRowInterval[]>,
  line: number,
  start: number,
  end: number,
): void {
  if (start >= end) {
    return;
  }

  const edges = target.get(line);
  const edge = { start, end };
  if (edges) {
    edges.push(edge);
  } else {
    target.set(line, [edge]);
  }
}

function buildClaimOutlineSegmentsFromEdges(
  orientation: "horizontal" | "vertical",
  side: NonNullable<ClaimOutlineSegment["side"]>,
  edgesByLine: Map<number, PendingClaimRowInterval[]>,
): ClaimOutlineSegment[] {
  const segments: ClaimOutlineSegment[] = [];

  for (const [line, edges] of [...edgesByLine.entries()].sort((left, right) => left[0] - right[0])) {
    const mergedEdges = mergePendingClaimRowIntervals(new Map([[line, edges]]))[0]?.[1] ?? [];

    for (const edge of mergedEdges) {
      segments.push({
        orientation,
        line,
        start: edge.start,
        end: edge.end,
        status: "owner",
        side,
      });
    }
  }

  return segments;
}

function buildPendingClaimOutlineSegments(
  pendingClaimPixels: PixelCoordinate[],
  pendingClaimRectangles: PendingClaimRectangle[],
): ClaimOutlineSegment[] {
  if (pendingClaimPixels.length === 0 && pendingClaimRectangles.length === 0) {
    return [];
  }

  const rows = new Map<number, PendingClaimRowInterval[]>();

  for (const pixel of pendingClaimPixels) {
    addPendingClaimRowInterval(rows, pixel.y, pixel.x, pixel.x);
  }

  for (const rectangle of pendingClaimRectangles) {
    for (let y = rectangle.minY; y <= rectangle.maxY; y += 1) {
      addPendingClaimRowInterval(rows, y, rectangle.minX, rectangle.maxX);
    }
  }

  const mergedRows = mergePendingClaimRowIntervals(rows);
  const rowMap = new Map(mergedRows);
  const northEdges = new Map<number, PendingClaimRowInterval[]>();
  const southEdges = new Map<number, PendingClaimRowInterval[]>();
  const eastEdges = new Map<number, PendingClaimRowInterval[]>();
  const westEdges = new Map<number, PendingClaimRowInterval[]>();

  for (const [y, intervals] of mergedRows) {
    const northBlockers = rowMap.get(y + 1) ?? [];
    const southBlockers = rowMap.get(y - 1) ?? [];

    for (const interval of intervals) {
      for (const edge of subtractPendingClaimIntervals(interval, northBlockers)) {
        addClaimOutlineEdge(northEdges, y + 1, edge.start, edge.end + 1);
      }

      for (const edge of subtractPendingClaimIntervals(interval, southBlockers)) {
        addClaimOutlineEdge(southEdges, y, edge.start, edge.end + 1);
      }

      addClaimOutlineEdge(westEdges, interval.start, y, y + 1);
      addClaimOutlineEdge(eastEdges, interval.end + 1, y, y + 1);
    }
  }

  return [
    ...buildClaimOutlineSegmentsFromEdges("horizontal", "north", northEdges),
    ...buildClaimOutlineSegmentsFromEdges("horizontal", "south", southEdges),
    ...buildClaimOutlineSegmentsFromEdges("vertical", "west", westEdges),
    ...buildClaimOutlineSegmentsFromEdges("vertical", "east", eastEdges),
  ];
}

function snapSvgLine(value: number): number {
  return Math.round(value) + 0.5;
}

function appendClaimOutlineCommand(target: string[], segment: ClaimOutlineSegment, camera: CameraState): void {
  if (segment.orientation === "horizontal") {
    const y = snapSvgLine(worldBoundaryScreenY(segment.line, camera));
    const x1 = snapSvgLine(camera.x + segment.start * camera.zoom);
    const x2 = snapSvgLine(camera.x + segment.end * camera.zoom);
    target.push(`M${x1} ${y}H${x2}`);
    return;
  }

  const x = snapSvgLine(camera.x + segment.line * camera.zoom);
  const y1 = snapSvgLine(worldBoundaryScreenY(segment.start, camera));
  const y2 = snapSvgLine(worldBoundaryScreenY(segment.end, camera));
  target.push(`M${x} ${y1}V${y2}`);
}

function appendSvgRectCommand(
  target: string[],
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  const x1 = Math.min(left, right);
  const x2 = Math.max(left, right);
  const y1 = Math.min(top, bottom);
  const y2 = Math.max(top, bottom);

  if (x1 === x2 || y1 === y2) {
    return;
  }

  target.push(`M${x1} ${y1}H${x2}V${y2}H${x1}Z`);
}

function appendClaimOutlineShadowEdgeCommand(
  target: string[],
  segment: ClaimOutlineSegment,
  camera: CameraState,
  shadowWidth: number,
): void {
  const side = segment.side;
  if (!side) {
    return;
  }

  if (segment.orientation === "horizontal") {
    if (side !== "north" && side !== "south") {
      return;
    }

    const baseY = snapSvgLine(worldBoundaryScreenY(segment.line, camera));
    const x1 = snapSvgLine(camera.x + segment.start * camera.zoom);
    const x2 = snapSvgLine(camera.x + segment.end * camera.zoom);
    const top = side === "north" ? baseY - shadowWidth : baseY;
    const bottom = side === "north" ? baseY : baseY + shadowWidth;
    appendSvgRectCommand(target, x1, top, x2, bottom);
    return;
  }

  if (side !== "west" && side !== "east") {
    return;
  }

  const baseX = snapSvgLine(camera.x + segment.line * camera.zoom);
  const left = side === "west" ? baseX - shadowWidth : baseX;
  const right = side === "west" ? baseX : baseX + shadowWidth;
  const y1 = snapSvgLine(worldBoundaryScreenY(segment.start, camera));
  const y2 = snapSvgLine(worldBoundaryScreenY(segment.end, camera));
  appendSvgRectCommand(target, left, y1, right, y2);
}

function buildClaimOutlineShadowCommands(
  segments: ClaimOutlineSegment[],
  camera: CameraState,
  shadowWidth: number,
): string[] {
  const commands: string[] = [];
  const endpoints = new Map<string, {
    x: number;
    y: number;
    horizontalSides: Set<"north" | "south">;
    verticalSides: Set<"west" | "east">;
  }>();

  const addEndpoint = (x: number, y: number, side: NonNullable<ClaimOutlineSegment["side"]>): void => {
    const key = `${x}:${y}`;
    const endpoint = endpoints.get(key) ?? {
      x,
      y,
      horizontalSides: new Set<"north" | "south">(),
      verticalSides: new Set<"west" | "east">(),
    };

    if (side === "north" || side === "south") {
      endpoint.horizontalSides.add(side);
    } else if (side === "west" || side === "east") {
      endpoint.verticalSides.add(side);
    }

    endpoints.set(key, endpoint);
  };

  for (const segment of segments) {
    appendClaimOutlineShadowEdgeCommand(commands, segment, camera, shadowWidth);

    const side = segment.side;
    if (!side) {
      continue;
    }

    if (segment.orientation === "horizontal" && (side === "north" || side === "south")) {
      addEndpoint(segment.start, segment.line, side);
      addEndpoint(segment.end, segment.line, side);
    } else if (segment.orientation === "vertical" && (side === "west" || side === "east")) {
      addEndpoint(segment.line, segment.start, side);
      addEndpoint(segment.line, segment.end, side);
    }
  }

  for (const endpoint of endpoints.values()) {
    if (endpoint.horizontalSides.size === 0 || endpoint.verticalSides.size === 0) {
      continue;
    }

    const x = snapSvgLine(camera.x + endpoint.x * camera.zoom);
    const y = snapSvgLine(worldBoundaryScreenY(endpoint.y, camera));

    for (const horizontalSide of endpoint.horizontalSides) {
      const top = horizontalSide === "north" ? y - shadowWidth : y;
      const bottom = horizontalSide === "north" ? y : y + shadowWidth;

      for (const verticalSide of endpoint.verticalSides) {
        const left = verticalSide === "west" ? x - shadowWidth : x;
        const right = verticalSide === "west" ? x : x + shadowWidth;
        appendSvgRectCommand(commands, left, top, right, bottom);
      }
    }
  }

  return commands;
}

function buildClaimOutlinePaths(
  outlineSegments: ClaimOutlineSegment[],
  camera: CameraState,
): ClaimOutlinePath[] {
  const commandsByKey = new Map<string, {
    status: ClaimOverlayStatus;
    commands: string[];
    segments: ClaimOutlineSegment[];
  }>();

  for (const segment of outlineSegments) {
    const key = segment.status;
    const existing = commandsByKey.get(key) ?? {
      status: segment.status,
      commands: [],
      segments: [],
    };

    appendClaimOutlineCommand(existing.commands, segment, camera);
    existing.segments.push(segment);
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
      shadowCoreD: buildClaimOutlineShadowCommands(value.segments, camera, CLAIM_OUTLINE_SHADOW_CORE_WIDTH).join(""),
      shadowSoftD: buildClaimOutlineShadowCommands(value.segments, camera, CLAIM_OUTLINE_SHADOW_SOFT_WIDTH).join(""),
    }))
    .sort((left, right) => statusOrder[left.status] - statusOrder[right.status]);
}

function getClaimAreaOutlineStatus(area: ClaimAreaRecord): ClaimOverlayStatus {
  if (area.viewer_can_edit) {
    return "owner";
  }

  if (area.viewer_can_paint) {
    return "contributor";
  }

  return "blocked";
}

function buildClaimAreaBoundsOutlinePaths(area: ClaimAreaRecord | null, camera: CameraState): ClaimOutlinePath[] {
  if (!area?.bounds) {
    return [];
  }

  const bounds = area.bounds;
  const status = getClaimAreaOutlineStatus(area);
  const segments: ClaimOutlineSegment[] = [
    {
      orientation: "horizontal",
      line: bounds.max_y + 1,
      start: bounds.min_x,
      end: bounds.max_x + 1,
      status,
      side: "north",
    },
    {
      orientation: "horizontal",
      line: bounds.min_y,
      start: bounds.min_x,
      end: bounds.max_x + 1,
      status,
      side: "south",
    },
    {
      orientation: "vertical",
      line: bounds.min_x,
      start: bounds.min_y,
      end: bounds.max_y + 1,
      status,
      side: "west",
    },
    {
      orientation: "vertical",
      line: bounds.max_x + 1,
      start: bounds.min_y,
      end: bounds.max_y + 1,
      status,
      side: "east",
    },
  ];

  return buildClaimOutlinePaths(segments, camera).map((path) => ({
    ...path,
    key: `bounds-${area.id}-${path.key}`,
  }));
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

function formatNotificationTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function getUnreadNotificationLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

function isStoredNotification(value: unknown): value is AppNotification {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<AppNotification>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.body === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.read === "boolean" &&
    (candidate.tone === "info" || candidate.tone === "success" || candidate.tone === "warning")
  );
}

function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 || value === 0 ? 1 : 2)}%`;
}

function formatDurationShort(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function getLevelProgressPercent(user: AuthUser | null): number {
  if (user === null || user.level_progress_target <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (user.level_progress_current / user.level_progress_target) * 100));
}

function getNormalPixelFullRefillText(user: AuthUser | null, nowMs = Date.now()): string {
  if (user === null) {
    return "";
  }

  if (user.normal_pixels >= user.normal_pixel_limit) {
    return "Full";
  }

  const intervalMs = Math.max(1000, user.normal_pixel_regeneration_interval_seconds * 1000);
  const lastUpdatedMs = new Date(user.normal_pixels_last_updated_at).getTime();
  const elapsedMs = Math.max(0, nowMs - lastUpdatedMs);
  const regenerated = Math.floor(elapsedMs / intervalMs);
  const displayedPixels = Math.min(user.normal_pixel_limit, user.normal_pixels + regenerated);
  const missingPixels = user.normal_pixel_limit - displayedPixels;

  if (missingPixels <= 0) {
    return "Full";
  }

  const remainderMs = elapsedMs % intervalMs;
  const nextPixelMs = remainderMs === 0 ? intervalMs : intervalMs - remainderMs;
  const fullRefillMs = nextPixelMs + (missingPixels - 1) * intervalMs;

  return formatDurationShort(fullRefillMs / 1000);
}

function sanitizeQuantityInput(value: string): string {
  return value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 3);
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
  pendingClaimOutlinePaths,
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
              <g className={`world-claim-outline-shadow-stack is-${path.status}`} key={`${path.key}:shadow`}>
                <path
                  className="world-claim-outline-shadow is-soft"
                  d={path.shadowSoftD}
                  fill={CLAIM_OUTLINE_SHADOW_SOFT_COLOR}
                  shapeRendering="crispEdges"
                  stroke="none"
                />
                <path
                  className="world-claim-outline-shadow is-core"
                  d={path.shadowCoreD}
                  fill={CLAIM_OUTLINE_SHADOW_CORE_COLOR}
                  shapeRendering="crispEdges"
                  stroke="none"
                />
              </g>
            ))}
            {claimOutlinePaths.map((path) => (
              <path
                className={`world-claim-outline-path is-${path.status}`}
                d={path.d}
                fill="none"
                key={path.key}
                shapeRendering="crispEdges"
                stroke={CLAIM_OUTLINE_COLORS[path.status]}
                strokeWidth={CLAIM_OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        ) : null}
        {pendingClaimOutlinePaths.length > 0 ? (
          <svg
            aria-hidden="true"
            className="world-pending-claim-outline-layer"
            height={viewportSize.height}
            shapeRendering="crispEdges"
            width={viewportSize.width}
          >
            {pendingClaimOutlinePaths.map((path) => (
              <g className={`world-pending-claim-outline-shadow-stack is-${path.status}`} key={`${path.key}:shadow`}>
                <path
                  className="world-claim-outline-shadow world-pending-claim-outline-shadow is-soft"
                  d={path.shadowSoftD}
                  fill={CLAIM_OUTLINE_SHADOW_SOFT_COLOR}
                  shapeRendering="crispEdges"
                  stroke="none"
                />
                <path
                  className="world-claim-outline-shadow world-pending-claim-outline-shadow is-core"
                  d={path.shadowCoreD}
                  fill={CLAIM_OUTLINE_SHADOW_CORE_COLOR}
                  shapeRendering="crispEdges"
                  stroke="none"
                />
              </g>
            ))}
            {pendingClaimOutlinePaths.map((path) => (
              <path
                className={`world-claim-outline-path world-pending-claim-outline-path is-${path.status}`}
                d={path.d}
                fill="none"
                key={path.key}
                shapeRendering="crispEdges"
                stroke={CLAIM_OUTLINE_COLORS[path.status]}
                strokeWidth={CLAIM_OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
            ))}
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
        <span>Holders</span>
        <strong>--</strong>
      </div>
    );
  }

  if (projection.isUnlimited) {
    return (
      <div className="pixel-resource-summary">
        <span>Holders</span>
        <strong>∞</strong>
        {pendingClaims > 0 ? <small>{pendingClaims} staged</small> : null}
        {pendingClaims > 0 ? (
          <div className="claim-batch-progress">
            <div className="claim-batch-progress-header">
              <span>Batch</span>
              <strong>{formatCount(pendingClaims)} / {formatCount(CLAIM_BATCH_PIXEL_LIMIT)}</strong>
            </div>
            <div className="claim-batch-progress-bar" aria-hidden="true">
              <span style={{ width: `${batchFillRatio * 100}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const remainingHolders = Math.max(0, projection.displayedHolders - pendingClaims);
  const holderFillRatio = projection.displayedHolders <= 0
    ? 0
    : Math.min(1, remainingHolders / projection.displayedHolders);

  return (
    <div className="pixel-resource-summary">
      <span>Holders</span>
      <strong>{remainingHolders}</strong>
      {pendingClaims > 0 ? <small>{pendingClaims} staged</small> : null}
      <div className="resource-meter" aria-hidden="true">
        <span style={{ width: `${holderFillRatio * 100}%` }} />
      </div>
      {pendingClaims > 0 ? (
        <div className="claim-batch-progress">
          <div className="claim-batch-progress-header">
            <span>Batch</span>
            <strong>{formatCount(pendingClaims)} / {formatCount(CLAIM_BATCH_PIXEL_LIMIT)}</strong>
          </div>
          <div className="claim-batch-progress-bar" aria-hidden="true">
            <span style={{ width: `${batchFillRatio * 100}%` }} />
          </div>
        </div>
      ) : null}
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
        <span>Color Pixels</span>
        <strong>--</strong>
      </div>
    );
  }

  const remainingPixels = Math.max(0, projection.displayedPixels - pendingPaints);
  const pixelFillRatio = Math.min(1, remainingPixels / Math.max(1, user.normal_pixel_limit));

  return (
    <div className="pixel-resource-summary">
      <span>Color Pixels</span>
      <strong>{remainingPixels}</strong>
      {pendingPaints > 0 ? <small>{pendingPaints} staged</small> : null}
      <div className="resource-meter" aria-hidden="true">
        <span style={{ width: `${pixelFillRatio * 100}%` }} />
      </div>
    </div>
  );
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
    const outlineFetchDetail = snapshot.claimOutlineFetchBounds === null
      ? "outline fetch off"
      : `outline fetch ${snapshot.claimOutlineFetchBounds} (${formatCount(snapshot.claimOutlineFetchCells ?? 0)} cells, ${snapshot.claimOutlineLastFetchMs === null ? "pending" : formatPerfTime(snapshot.claimOutlineLastFetchMs)})`;

    const detailParts = [
      `${formatGrowthStageLabel(snapshot.growth)}, filled ${formatCount(snapshot.growth.painted_pixels)} / ${formatCount(snapshot.growth.capacity_pixels)} px (${formatPercent(snapshot.growth.filled_percent)})`,
      `cam ${Math.round(snapshot.cameraX)}:${Math.round(snapshot.cameraY)} @ ${snapshot.zoom.toFixed(2)}x`,
      `layer ${formatDebugLayerLabel(snapshot)}`,
      ...layers,
      `pixels ${snapshot.visiblePixels}, outlines ${snapshot.claimOutlineSegments} seg/${snapshot.claimOutlinePaths} paths/${formatCount(snapshot.claimOutlinePathChars)} chars, pending ${snapshot.pendingClaims}/${snapshot.pendingPaints}`,
      outlineFetchDetail,
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
            Pixels {latestSnapshot.visiblePixels}, outline {latestSnapshot.claimOutlineSegments} seg / {latestSnapshot.claimOutlinePaths} paths / {formatCount(latestSnapshot.claimOutlinePathChars)} chars, pending outline {formatCount(latestSnapshot.pendingClaimOutlinePathChars)} chars
          </span>
          <span>
            Outline fetch {latestSnapshot.claimOutlineFetchBounds ?? "--"} | {latestSnapshot.claimOutlineFetchCells === null ? "--" : `${formatCount(latestSnapshot.claimOutlineFetchCells)} cells`} | last {latestSnapshot.claimOutlineLastFetchMs === null ? "--" : formatPerfTime(latestSnapshot.claimOutlineLastFetchMs)} / {latestSnapshot.claimOutlineLastFetchSegments} seg{latestSnapshot.claimOutlineLastFetchTruncated ? " / truncated" : ""}
          </span>
          <span>
            Pending {latestSnapshot.pendingClaims}/{latestSnapshot.pendingPaints}
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
      <path d="M5.5 9.2h13v10.3h-13V9.2Zm2 2v6.3h3.5v-6.3H7.5Zm5.5 0v6.3h3.5v-6.3H13Z" fill="currentColor" />
      <path d="M4 4.5h16l1 4.2c-.45.78-1.25 1.3-2.15 1.3-.8 0-1.5-.4-1.96-1.02A2.45 2.45 0 0 1 14.93 10c-.8 0-1.5-.4-1.96-1.02A2.45 2.45 0 0 1 11 10c-.8 0-1.5-.4-1.96-1.02A2.45 2.45 0 0 1 7.08 10c-.9 0-1.7-.52-2.15-1.3L4 4.5Z" fill="currentColor" opacity="0.82" />
      <path d="M6 3h12v2H6V3Zm-1 16h14v2H5v-2Z" fill="currentColor" />
    </svg>
  );
}

function BellIcon({ className = "hud-button-icon" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path d="M12 3.25a5.5 5.5 0 0 0-5.5 5.5v2.8c0 1.18-.43 2.32-1.22 3.2L4 16.2v1.55h16V16.2l-1.28-1.45a4.85 4.85 0 0 1-1.22-3.2v-2.8A5.5 5.5 0 0 0 12 3.25Zm-2.8 16.1a2.9 2.9 0 0 0 5.6 0H9.2Z" fill="currentColor" />
    </svg>
  );
}

function VolumeOnIcon({ className = "hud-button-icon" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path d="M4.5 9.2h3.6l4.4-4v13.6l-4.4-4H4.5V9.2Z" fill="currentColor" />
      <path d="M15.2 8.1a5.4 5.4 0 0 1 0 7.8M17.8 5.6a9 9 0 0 1 0 12.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function VolumeMutedIcon({ className = "hud-button-icon" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path d="M4.5 9.2h3.6l4.4-4v13.6l-4.4-4H4.5V9.2Z" fill="currentColor" />
      <path d="m16 9 4 4m0-4-4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function ThumbUpIcon() {
  return (
    <svg aria-hidden="true" className="area-reaction-icon" viewBox="0 0 24 24">
      <path d="M9.2 20H5.8a1.8 1.8 0 0 1-1.8-1.8v-6.4A1.8 1.8 0 0 1 5.8 10h3.4v10Zm1.8-9.9 2.6-5.6a1.7 1.7 0 0 1 3.25.68V10h2.05a2.1 2.1 0 0 1 2.02 2.67l-1.4 5a3.2 3.2 0 0 1-3.08 2.33H11v-9.9Z" fill="currentColor" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg aria-hidden="true" className="area-reaction-icon" viewBox="0 0 24 24">
      <path d="M14.8 4h3.4A1.8 1.8 0 0 1 20 5.8v6.4a1.8 1.8 0 0 1-1.8 1.8h-3.4V4Zm-1.8 9.9-2.6 5.6a1.7 1.7 0 0 1-3.25-.68V14H5.1a2.1 2.1 0 0 1-2.02-2.67l1.4-5A3.2 3.2 0 0 1 7.56 4H13v9.9Z" fill="currentColor" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" className="area-share-icon" viewBox="0 0 24 24">
      <path d="M12 4v11M8 8l4-4 4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      <path d="M6 12v6h12v-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
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

function SaveIcon() {
  return (
    <svg aria-hidden="true" className="hud-button-icon" viewBox="0 0 24 24">
      <path d="M5.5 3.5h10.2l2.8 2.8v14.2h-13V3.5Zm2 2v5h8v-3.7l-1.3-1.3H7.5Zm0 13h9v-5h-9v5Z" fill="currentColor" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="hud-button-icon" viewBox="0 0 24 24">
      <path d="M9 3.5h6l.8 2h3.2v2H5v-2h3.2l.8-2Zm-1.9 6h9.8l-.7 10.2a1.9 1.9 0 0 1-1.9 1.8H9.7a1.9 1.9 0 0 1-1.9-1.8L7.1 9.5Zm3.4 2.5v6h1.5v-6h-1.5Zm3.5 0v6h1.5v-6H14Z" fill="currentColor" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" className="hud-button-icon" viewBox="0 0 24 24">
      <path d="M4.5 4.5h8v2h-6v11h6v2h-8v-15Zm10.4 3.2 4.8 4.8-4.8 4.8-1.4-1.4 2.4-2.4H10v-2h5.9l-2.4-2.4 1.4-1.4Z" fill="currentColor" />
    </svg>
  );
}

function MoreHorizontalIcon({ className = "options-dot-icon" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <circle cx="6.5" cy="12" fill="currentColor" r="1.8" />
      <circle cx="12" cy="12" fill="currentColor" r="1.8" />
      <circle cx="17.5" cy="12" fill="currentColor" r="1.8" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg aria-hidden="true" className="account-mini-icon" viewBox="0 0 24 24">
      <path d="M12 3.5c4.42 0 8 1.79 8 4s-3.58 4-8 4-8-1.79-8-4 3.58-4 8-4Zm-8 6.15c1.45 1.4 4.36 2.35 8 2.35s6.55-.95 8-2.35V12c0 2.21-3.58 4-8 4s-8-1.79-8-4V9.65Zm0 4.5c1.45 1.4 4.36 2.35 8 2.35s6.55-.95 8-2.35V16.5c0 2.21-3.58 4-8 4s-8-1.79-8-4v-2.35Z" fill="currentColor" />
    </svg>
  );
}

function PixelIcon() {
  return (
    <svg aria-hidden="true" className="account-mini-icon" viewBox="0 0 24 24">
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" fill="currentColor" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg aria-hidden="true" className="account-mini-icon" viewBox="0 0 24 24">
      <path d="M9 2.75h6v2H9v-2Zm3 3.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm1 3.5h-2v4.55l3.35 2 1-1.72L13 13.18V9.75Z" fill="currentColor" />
    </svg>
  );
}

function LevelIcon() {
  return (
    <svg aria-hidden="true" className="account-mini-icon" viewBox="0 0 24 24">
      <path d="M12 3.25 14.65 8.6l5.9.86-4.27 4.16 1.01 5.88L12 16.72 6.71 19.5l1.01-5.88L3.45 9.46l5.9-.86L12 3.25Z" fill="currentColor" />
    </svg>
  );
}

function AreaIcon({ className = "account-mini-icon" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path d="M5 5h6v6H5V5Zm8 0h6v6h-6V5ZM5 13h6v6H5v-6Zm8 0h6v6h-6v-6Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M3.5 3.5h17v17h-17v-17Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function BrushToolIcon({ className = "tool-mini-icon" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path d="M14.8 4.8 19.2 9.2 9.4 19H5v-4.4l9.8-9.8Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M13.4 6.2 17.8 10.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function RectangleToolIcon({ className = "tool-mini-icon" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <rect fill="none" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="6" />
      <path d="M8 10h8M8 14h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function OverlayToolIcon({ className = "tool-mini-icon" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <rect fill="none" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="6" />
      <path d="m7 15 3.2-3.2 2.3 2.3 1.6-1.6L18 16H6l1-1Z" fill="currentColor" />
      <circle cx="15.8" cy="9.2" fill="currentColor" r="1.3" />
    </svg>
  );
}

function EraserToolIcon({ className = "tool-mini-icon" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path d="m4.5 14.5 7.2-7.2a3 3 0 0 1 4.2 0l2.8 2.8a3 3 0 0 1 0 4.2L14 19H8.8l-4.3-4.5Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M10 19h9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function PickerToolIcon({ className = "tool-mini-icon" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path d="M4 20l4.5-1 8.2-8.2-3.5-3.5L5 15.5 4 20Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 5.5 15.5 9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

type ShopArtworkVariant = number;
const SHOP_COLOR_PIXEL_ARTWORK_VARIANT: ShopArtworkVariant = 8;
const SHOP_MAX_PIXEL_ARTWORK_VARIANT: ShopArtworkVariant = 6;

function ShopArtworkFrame({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <svg aria-hidden="true" className={`shop-item-art ${className}`} viewBox="0 0 96 96">
      <rect className="shop-art-bg" height="88" rx="16" width="88" x="4" y="4" />
      {children}
    </svg>
  );
}

function ShopChargeBase({ y = 72, width = 36 }: { y?: number; width?: number }) {
  const left = 48 - width / 2;

  return (
    <rect fill="currentColor" height="7" rx="1.5" width={width} x={left} y={y} />
  );
}

function ShopDroplet({
  x,
  y,
  scale = 1,
}: {
  x: number;
  y: number;
  scale?: number;
}) {
  return (
    <path
      d="M0-10C5-4 8 1 8 6a8 8 0 0 1-16 0c0-5 3-10 8-16Z"
      fill="currentColor"
      transform={`translate(${x} ${y}) scale(${scale})`}
    />
  );
}

function ShopSpark({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x} ${y - 8}v16M${x - 8} ${y}h16`}
      opacity="0.46"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="3.4"
    />
  );
}

function ShopTinyPlus({ x = 70, y = 28 }: { x?: number; y?: number }) {
  return (
    <path
      d={`M${x} ${y - 7}v14M${x - 7} ${y}h14`}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="4.4"
    />
  );
}

function ShopUpArrow({
  x = 48,
  y = 26,
  height = 35,
}: {
  x?: number;
  y?: number;
  height?: number;
}) {
  const tipY = y;
  const stemTop = y + 11;
  const stemBottom = y + height;

  return (
    <>
      <path
        d={`M${x} ${stemBottom}V${stemTop}M${x - 15} ${stemTop + 4}l15-15 15 15`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="7"
      />
      <path d={`M${x - 2.5} ${tipY + 3}h5v7h-5z`} fill="currentColor" opacity="0.01" />
    </>
  );
}

function renderPaintChargeArtwork(variant: ShopArtworkVariant): ReactNode {
  const coreVariant = ((variant - 1) % 16) + 1;
  const alternate = variant > 16;
  const accent = alternate ? (
    <>
      <ShopTinyPlus x={70} y={28} />
      <path d="M25 27h12" opacity="0.28" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
    </>
  ) : null;

  switch (coreVariant) {
    case 1:
      return (
        <>
          <path d="M40 25 64 49 51 62 27 38l13-13Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <path d="M43 28 61 46" stroke="currentColor" strokeLinecap="square" strokeWidth="6" />
          <ShopDroplet x={68} y={59} scale={0.68} />
          <ShopChargeBase width={42} />
          {accent}
        </>
      );
    case 2:
      return (
        <>
          <path d="M35 28h28l10 10-22 22-26-26 10-6Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <path d="M35 37h26" stroke="currentColor" strokeLinecap="square" strokeWidth="6" />
          <ShopDroplet x={66} y={60} scale={0.58} />
          <ShopDroplet x={55} y={66} scale={0.36} />
          <ShopChargeBase width={44} />
          {accent}
        </>
      );
    case 3:
      return (
        <>
          <path d="M31 31h30l8 8-20 21H31V31Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <path d="M61 31v11h10M39 43h17" stroke="currentColor" strokeLinecap="square" strokeLinejoin="round" strokeWidth="5.5" />
          <ShopDroplet x={65} y={60} scale={0.56} />
          <ShopChargeBase width={40} />
          {accent}
        </>
      );
    case 4:
      return (
        <>
          <ShopDroplet x={48} y={45} scale={1.48} />
          <path d="M33 60h30" opacity="0.34" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
          <ShopChargeBase width={48} />
          {accent}
        </>
      );
    case 5:
      return (
        <>
          <path d="M30 37h36v28H30V37Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <path d="M38 48h20" stroke="currentColor" strokeLinecap="square" strokeWidth="6" />
          <ShopDroplet x={48} y={61} scale={0.5} />
          <ShopDroplet x={70} y={46} scale={0.58} />
          <ShopChargeBase width={38} />
          {accent}
        </>
      );
    case 6:
      return (
        <>
          <path d="M30 56c8-19 14-28 18-28s10 9 18 28H30Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <ShopDroplet x={45} y={54} scale={0.42} />
          <ShopDroplet x={58} y={57} scale={0.36} />
          <ShopChargeBase width={46} />
          {accent}
        </>
      );
    case 7:
      return (
        <>
          <path d="M31 41 50 24l19 17-19 19-19-19Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <path d="M39 41h23" stroke="currentColor" strokeLinecap="square" strokeWidth="5.5" />
          <ShopDroplet x={65} y={60} scale={0.64} />
          <ShopChargeBase width={42} />
          {accent}
        </>
      );
    case 8:
      return (
        <>
          <ShopDroplet x={38} y={44} scale={0.82} />
          <ShopDroplet x={52} y={39} scale={0.72} />
          <ShopDroplet x={61} y={57} scale={0.86} />
          <ShopChargeBase width={46} />
          {accent}
        </>
      );
    case 9:
      return (
        <>
          <path d="M30 35h31l8 8v25H30V35Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <path d="M61 35v10h8M38 48h17" stroke="currentColor" strokeLinecap="square" strokeLinejoin="round" strokeWidth="5.5" />
          <ShopDroplet x={50} y={61} scale={0.54} />
          <ShopChargeBase width={40} />
          {accent}
        </>
      );
    case 10:
      return (
        <>
          <path d="M31 62 58 35" fill="none" stroke="currentColor" strokeLinecap="square" strokeWidth="7" />
          <path d="m56 25 15 15-11 11-15-15 11-11Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <ShopDroplet x={34} y={63} scale={0.42} />
          <ShopChargeBase width={38} />
          {accent}
        </>
      );
    case 11:
      return (
        <>
          <path d="M31 55a19 19 0 0 1 34 0" fill="none" stroke="currentColor" strokeLinecap="square" strokeWidth="6" />
          <path d="M48 55 62 39" stroke="currentColor" strokeLinecap="square" strokeWidth="6" />
          <ShopDroplet x={35} y={45} scale={0.48} />
          <ShopChargeBase width={42} />
          {accent}
        </>
      );
    case 12:
      return (
        <>
          <path d="M28 45h37M43 28v34M58 28v34" stroke="currentColor" strokeLinecap="square" strokeWidth="6" />
          <ShopDroplet x={70} y={55} scale={0.62} />
          <ShopChargeBase width={42} />
          {accent}
        </>
      );
    case 13:
      return (
        <>
          <path d="M31 37h34v24H31V37Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <path d="M39 37V27h18v10M39 49h18" stroke="currentColor" strokeLinecap="square" strokeLinejoin="round" strokeWidth="5.5" />
          <ShopDroplet x={68} y={58} scale={0.56} />
          <ShopChargeBase width={40} />
          {accent}
        </>
      );
    case 14:
      return (
        <>
          <path d="M27 51c8-11 14-16 21-16s13 5 21 16c-8 11-14 16-21 16s-13-5-21-16Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <ShopDroplet x={48} y={52} scale={0.52} />
          <ShopChargeBase width={40} />
          {accent}
        </>
      );
    case 15:
      return (
        <>
          <path d="M28 58h40l-5 10H33l-5-10Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <path d="M34 31h28v27H34V31Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <ShopDroplet x={48} y={49} scale={0.58} />
          <ShopChargeBase width={36} y={73} />
          {accent}
        </>
      );
    case 16:
      return (
        <>
          <path d="M48 25c12 9 20 17 20 29a20 20 0 0 1-40 0c0-12 8-20 20-29Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <path d="M38 54h20" stroke="currentColor" strokeLinecap="square" strokeWidth="5.5" />
          <ShopChargeBase width={42} />
          {accent}
        </>
      );
      default:
        return null;
  }
}

function renderMaxChargeArtwork(variant: ShopArtworkVariant): ReactNode {
  const coreVariant = ((variant - 1) % 16) + 1;
  const alternate = variant > 16;
  const accent = alternate ? (
    <>
      <ShopTinyPlus x={70} y={28} />
      <path d="M24 29h13" opacity="0.28" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
    </>
  ) : null;

  switch (coreVariant) {
    case 1:
      return (
        <>
          <ShopUpArrow />
          <ShopChargeBase width={43} />
          {accent}
        </>
      );
    case 2:
      return (
        <>
          <path d="M29 45 48 26l19 19M36 58l12-12 12 12" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="7" />
          <ShopChargeBase width={43} />
          {accent}
        </>
      );
    case 3:
      return (
        <>
          <path d="M28 38V27h13M68 38V27H55" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="6" />
          <ShopUpArrow y={32} height={27} />
          <ShopChargeBase width={40} />
          {accent}
        </>
      );
    case 4:
      return (
        <>
          <path d="M30 60h36M48 58V29M34 43l14-14 14 14" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="7" />
          <ShopChargeBase width={44} />
          {accent}
        </>
      );
    case 5:
      return (
        <>
          <path d="M34 66V31h28v35H34Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <path d="M48 58V38M39 46l9-9 9 9" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="6" />
          <ShopChargeBase width={36} />
          {accent}
        </>
      );
    case 6:
      return (
        <>
          <path d="M34 52 48 38l14 14M34 38l14-14 14 14" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="7" />
          <ShopChargeBase width={42} />
          {accent}
        </>
      );
    case 7:
      return (
        <>
          <ShopUpArrow x={42} y={29} height={31} />
          <ShopTinyPlus x={66} y={48} />
          <ShopChargeBase width={43} />
          {alternate ? <ShopSpark x={27} y={29} /> : null}
        </>
      );
    case 8:
      return (
        <>
          <path d="M29 62h38M35 50h26M41 38h14" stroke="currentColor" strokeLinecap="square" strokeWidth="7" />
          <path d="M48 58V26M38 36l10-10 10 10" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="6" />
          <ShopChargeBase width={42} y={73} />
          {accent}
        </>
      );
    case 9:
      return (
        <>
          <circle cx="48" cy="47" fill="none" r="22" stroke="currentColor" strokeWidth="6" />
          <path d="M48 59V35M39 44l9-9 9 9" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="6" />
          <ShopChargeBase width={40} />
          {accent}
        </>
      );
    case 10:
      return (
        <>
          <path d="M48 61V29M37 40l11-11 11 11M30 54l-8-8M66 54l8-8" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="6" />
          <ShopChargeBase width={40} />
          {accent}
        </>
      );
    case 11:
      return (
        <>
          <path d="M27 57a21 21 0 0 1 42 0" fill="none" stroke="currentColor" strokeLinecap="square" strokeWidth="6" />
          <path d="M48 56 62 39M36 57h24" stroke="currentColor" strokeLinecap="square" strokeWidth="6" />
          <ShopChargeBase width={42} />
          {accent}
        </>
      );
    case 12:
      return (
        <>
          <path d="M28 42h40v24H28V42Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="6" />
          <path d="M68 49h5v10h-5M48 62V30M38 40l10-10 10 10" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="5.5" />
          <ShopChargeBase width={34} />
          {accent}
        </>
      );
    case 13:
      return (
        <>
          <path d="M30 62h14V50h13V38h11" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="7" />
          <path d="M58 30h10v10" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="7" />
          <ShopChargeBase width={40} />
          {accent}
        </>
      );
    case 14:
      return (
        <>
          <path d="M31 64h34M37 64V38h22v26M48 57V26M38 36l10-10 10 10" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="6" />
          <ShopChargeBase width={42} y={73} />
          {accent}
        </>
      );
    case 15:
      return (
        <>
          <path d="M25 61h46M48 59V26M34 40l14-14 14 14M33 48h30" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="6.5" />
          <ShopChargeBase width={44} />
          {accent}
        </>
      );
    case 16:
      return (
        <>
          <path d="M48 25 68 45 48 65 28 45 48 25Z" fill="none" stroke="currentColor" strokeLinejoin="miter" strokeWidth="6" />
          <path d="M48 57V36M39 45l9-9 9 9" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="5.8" />
          <ShopChargeBase width={38} />
          {accent}
        </>
      );
      default:
        return null;
  }
}

function ShopPixelPackArtwork({ variant }: { variant: ShopArtworkVariant }) {
  if (variant >= 1) {
    return (
      <ShopArtworkFrame className="is-paint-charge">
        {renderPaintChargeArtwork(variant)}
      </ShopArtworkFrame>
    );
  }

  const content = (() => {
    switch (variant) {
      case 1:
        return (
          <>
            <rect fill="none" height="34" rx="7" stroke="currentColor" strokeWidth="4" width="34" x="21" y="31" />
            <path d="M31 41h14M31 51h9M59 58h14M66 51v14" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 2:
        return (
          <>
            <path d="M28 32h28l12 12v20H28V32Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M56 32v13h12M37 47h18M37 57h12" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
          </>
        );
      case 3:
        return (
          <>
            <path d="M25 34h44v31H25V34Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M35 44h8v8h-8v-8ZM53 44h8v8h-8v-8ZM35 56h8v8h-8v-8Z" fill="currentColor" opacity="0.72" />
            <path d="M58 60h13M64.5 53.5v13" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 4:
        return (
          <>
            <path d="M27 31h37v10H27V31Zm5 10h37v25H32V41Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M41 51h18M41 60h10" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M62 28v12" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
          </>
        );
      case 5:
        return (
          <>
            <rect fill="none" height="38" rx="9" stroke="currentColor" strokeWidth="4" width="42" x="22" y="31" />
            <path d="M32 41h7v7h-7v-7ZM47 41h7v7h-7v-7ZM32 56h7v7h-7v-7Z" fill="currentColor" opacity="0.76" />
            <path d="M62 57h12M68 51v12" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 6:
        return (
          <>
            <path d="M36 22h24v9l-6 7v25a12 12 0 0 1-24 0V38l6-7v-9Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M33 51h30M38 61h6v6h-6v-6ZM49 56h7v7h-7v-7Z" fill="currentColor" opacity="0.72" />
            <path d="M63 56h10M68 51v10" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 7:
        return (
          <>
            <path d="M24 61h48l-5 11H29l-5-11Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M30 30h36v31H30V30Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M39 39h7v7h-7v-7ZM51 39h7v7h-7v-7ZM39 51h7v7h-7v-7Z" fill="currentColor" opacity="0.68" />
            <path d="M66 25v12M60 31h12" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 8:
        return (
          <>
            <path d="M28 66c11-28 18-38 21-38s10 10 21 38H28Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M40 52h7v7h-7v-7ZM51 44h7v7h-7v-7ZM55 57h7v7h-7v-7Z" fill="currentColor" opacity="0.7" />
            <path d="M27 28c5 2 8 5 9 10M67 28c-5 2-8 5-9 10" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
          </>
        );
      case 9:
        return (
          <>
            <path d="M27 33h42v29H27V33Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M32 27h32M32 68h32" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M36 42h8v8h-8v-8ZM49 42h8v8h-8v-8ZM36 54h8v8h-8v-8Z" fill="currentColor" opacity="0.72" />
            <path d="M63 54h12M69 48v12" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 10:
        return (
          <>
            <path d="M29 28h31l8 8v32H29V28Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M60 28v10h8M37 40h7v7h-7v-7ZM50 40h7v7h-7v-7ZM37 53h7v7h-7v-7Z" fill="currentColor" opacity="0.72" />
            <path d="M23 45h9M23 55h9" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
          </>
        );
      case 11:
        return (
          <>
            <path d="M48 23c9 11 18 20 18 32a18 18 0 0 1-36 0c0-12 9-21 18-32Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M41 53h6v6h-6v-6ZM50 43h7v7h-7v-7ZM53 59h6v6h-6v-6Z" fill="currentColor" opacity="0.72" />
            <path d="M65 31h11M70.5 25.5v11" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 12:
        return (
          <>
            <path d="M25 44c6-8 12-12 20-12 11 0 16 9 26 8-3 15-11 24-25 24-10 0-17-7-21-20Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M38 43h7v7h-7v-7ZM50 38h7v7h-7v-7ZM50 52h7v7h-7v-7Z" fill="currentColor" opacity="0.72" />
            <path d="M30 29c4 2 7 5 8 10" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
          </>
        );
      case 13:
        return (
          <>
            <path d="m48 23 7 16 17 2-13 11 4 17-15-9-15 9 4-17-13-11 17-2 7-16Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M43 45h6v6h-6v-6ZM51 51h6v6h-6v-6Z" fill="currentColor" opacity="0.74" />
            <path d="M70 27v10M65 32h10" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 14:
        return (
          <>
            <path d="M28 66 57 37M49 29l18 18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
            <path d="m57 25 5 10 10 5-10 5-5 10-5-10-10-5 10-5 5-10Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M27 36h6M35 27v6M65 63h7M72 56v7" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
          </>
        );
      case 15:
        return (
          <>
            <path d="M29 30h28l10 10v26H29V30Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M57 30v12h10M37 43h8v8h-8v-8ZM49 43h8v8h-8v-8ZM37 55h8v8h-8v-8Z" fill="currentColor" opacity="0.72" />
            <path d="M70 57h10M75 52v10" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 16:
        return (
          <>
            <path d="M27 54c8-20 15-30 21-30s13 10 21 30" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
            <path d="M25 54h46v15H25V54Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M35 60h7v7h-7v-7ZM48 60h7v7h-7v-7ZM61 60h7v7h-7v-7Z" fill="currentColor" opacity="0.72" />
          </>
        );
      case 17:
        return (
          <>
            <path d="M31 31h28l10 10v27H31V31Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M59 31v12h10M38 47h24M38 57h15" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M23 28h8M27 24v8M68 62h10M73 57v10" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 18:
        return (
          <>
            <path d="M27 58 48 28l21 30H27Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M37 58v10h22V58M44 45h8v8h-8v-8Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M65 29h10M70 24v10" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 19:
        return (
          <>
            <path d="M30 34h36v28H30V34Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M25 62h46l-5 10H30l-5-10Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M38 42h8v8h-8v-8ZM51 42h8v8h-8v-8ZM44 54h8v8h-8v-8Z" fill="currentColor" opacity="0.72" />
          </>
        );
      case 20:
        return (
          <>
            <circle cx="48" cy="48" fill="none" r="24" stroke="currentColor" strokeWidth="4" />
            <path d="M48 24v48M24 48h48M31 31l34 34M65 31 31 65" stroke="currentColor" strokeLinecap="round" strokeWidth="3.5" />
            <path d="M67 24v11M61.5 29.5h11" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
    }
  })();

  return (
    <svg aria-hidden="true" className="shop-item-art" viewBox="0 0 96 96">
      <rect className="shop-art-bg" height="88" rx="16" width="88" x="4" y="4" />
      {content}
      <path d="M30 22h36M30 74h22" opacity="0.28" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
    </svg>
  );
}

function ShopCapacityArtwork({ variant }: { variant: ShopArtworkVariant }) {
  if (variant >= 1) {
    return (
      <ShopArtworkFrame className="is-max-charge">
        {renderMaxChargeArtwork(variant)}
      </ShopArtworkFrame>
    );
  }

  const content = (() => {
    switch (variant) {
      case 1:
        return (
          <>
            <rect fill="none" height="34" rx="7" stroke="currentColor" strokeWidth="4" width="34" x="31" y="31" />
            <path d="M39 39h6v6h-6v-6ZM51 39h6v6h-6v-6ZM39 51h6v6h-6v-6ZM51 51h6v6h-6v-6Z" fill="currentColor" opacity="0.72" />
            <path d="M25 35V24h11M71 35V24H60M25 61v11h11M71 61v11H60" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
          </>
        );
      case 2:
        return (
          <>
            <path d="M28 48h40M48 28v40" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <rect fill="none" height="44" rx="9" stroke="currentColor" strokeWidth="4" width="44" x="26" y="26" />
            <path d="M36 36h7v7h-7v-7ZM53 36h7v7h-7v-7ZM36 53h7v7h-7v-7ZM53 53h7v7h-7v-7Z" fill="currentColor" opacity="0.62" />
          </>
        );
      case 3:
        return (
          <>
            <path d="M24 56h48M40 24v48M56 24v48" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M27 35h42v30H27V35Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M66 26v13M59.5 32.5h13" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
          </>
        );
      case 4:
        return (
          <>
            <path d="M30 30h36v36H30V30Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M38 38h20v20H38V38Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" opacity="0.64" />
            <path d="M24 48h12M60 48h12M48 24v12M48 60v12" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
          </>
        );
      case 5:
        return (
          <>
            <path d="M28 60V36h24v24H28Zm16-16h24v24H44V44Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M58 27v13M51.5 33.5h13" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M36 44h8v8h-8v-8ZM52 52h8v8h-8v-8Z" fill="currentColor" opacity="0.7" />
          </>
        );
      case 6:
        return (
          <>
            <rect fill="none" height="34" rx="8" stroke="currentColor" strokeWidth="4" width="34" x="31" y="31" />
            <path d="M48 21v13M48 62v13M21 48h13M62 48h13" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="m28 28-7-7M68 28l7-7M28 68l-7 7M68 68l7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
          </>
        );
      case 7:
        return (
          <>
            <path d="M29 31h31l7 8v26H29V31Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M60 31v10h7M37 45h22M37 55h14" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M66 53h11M71.5 47.5v11" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 8:
        return (
          <>
            <path d="M24 35h36v28H24V35Zm10-9h36v28H34V26Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M43 35h17M43 44h10" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M66 56h12M72 50v12" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 9:
        return (
          <>
            <path d="M24 59a24 24 0 0 1 48 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="m48 56 13-16" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M36 59h24M30 68h36" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M69 27v12M63 33h12" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 10:
        return (
          <>
            <path d="M27 34h42v30H27V34Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M36 43h8v8h-8v-8ZM52 43h8v8h-8v-8Z" fill="currentColor" opacity="0.7" />
            <path d="M20 40h8M20 58h8M68 40h8M68 58h8M35 28v7M61 28v7M35 63v7M61 63v7" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
          </>
        );
      case 11:
        return (
          <>
            <path d="M28 37h36a8 8 0 0 1 0 16H28V37Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M28 53h32a8 8 0 0 1 0 16H28V53Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M69 29v12M63 35h12" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 12:
        return (
          <>
            <path d="M31 33h28l7 7v28H31V33Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M59 33v9h7M39 45h18M39 55h18" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M24 40v-9h9M72 56v9h-9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
          </>
        );
      case 13:
        return (
          <>
            <path d="M27 65h42M33 54h30M39 43h18M45 32h6" stroke="currentColor" strokeLinecap="round" strokeWidth="7" />
            <path d="M69 25v12M63 31h12" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 14:
        return (
          <>
            <path d="M26 58a22 22 0 0 1 44 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M35 58h26M48 58l16-18" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M31 68h34" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M70 27v11M64.5 32.5h11" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 15:
        return (
          <>
            <path d="M31 38h34v31H31V38Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M38 38V28h20v10M39 48h18M39 58h12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
            <path d="M67 48h10M72 43v10" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 16:
        return (
          <>
            <path d="M27 34h42v31H27V34Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M35 42h8v8h-8v-8ZM53 42h8v8h-8v-8ZM35 54h26" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
            <path d="M48 25v12M42 31h12M48 62v10" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 17:
        return (
          <>
            <path d="M36 27h24v11l-6 5v21a12 12 0 0 1-24 0V43l6-5V27Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M35 54h26M39 63h18" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M66 45h11M71.5 39.5v11" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 18:
        return (
          <>
            <path d="M26 44h44v27H26V44Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M32 44V31h32v13M38 54h20M38 63h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
            <path d="M69 28v11M63.5 33.5h11" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 19:
        return (
          <>
            <path d="M27 48c8-12 14-18 21-18s13 6 21 18c-8 12-14 18-21 18s-13-6-21-18Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M39 48c4-5 6-7 9-7s5 2 9 7c-4 5-6 7-9 7s-5-2-9-7Z" fill="currentColor" opacity="0.72" />
            <path d="M68 27v11M62.5 32.5h11" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
      case 20:
        return (
          <>
            <path d="M30 36h36v33H30V36Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
            <path d="M36 36c0-9 24-9 24 0M40 48h16M40 58h16" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
            <path d="M48 22v12M42 28h12" stroke="currentColor" strokeLinecap="round" strokeWidth="4.5" />
          </>
        );
    }
  })();

  return (
    <svg aria-hidden="true" className="shop-item-art" viewBox="0 0 96 96">
      <rect className="shop-art-bg" height="88" rx="16" width="88" x="4" y="4" />
      {content}
    </svg>
  );
}

function formatAreaPreviewPathNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toFixed(3).replace(/\.?0+$/, "");
}

function buildAreaPreviewOutlinePaths(
  outlineSegments: ClaimOutlineSegment[] | undefined,
  viewMinX: number,
  viewMaxY: number,
  viewWidth: number,
  viewHeight: number,
): AreaPreviewOutlinePath[] {
  if (!outlineSegments || outlineSegments.length === 0) {
    return [];
  }

  const commands: string[] = [];

  for (const segment of outlineSegments) {
    if (segment.orientation === "horizontal") {
      const y = ((viewMaxY - segment.line) / viewHeight) * 100;
      const x1 = ((segment.start - viewMinX) / viewWidth) * 100;
      const x2 = ((segment.end - viewMinX) / viewWidth) * 100;
      commands.push(
        `M${formatAreaPreviewPathNumber(x1)} ${formatAreaPreviewPathNumber(y)}H${formatAreaPreviewPathNumber(x2)}`,
      );
    } else {
      const x = ((segment.line - viewMinX) / viewWidth) * 100;
      const y1 = ((viewMaxY - segment.start) / viewHeight) * 100;
      const y2 = ((viewMaxY - segment.end) / viewHeight) * 100;
      commands.push(
        `M${formatAreaPreviewPathNumber(x)} ${formatAreaPreviewPathNumber(y1)}V${formatAreaPreviewPathNumber(y2)}`,
      );
    }
  }

  return [{ d: commands.join(""), key: "area-shape" }];
}

function buildAreaPreview(
  area: ClaimAreaListItem,
  visualTileRevisions: Record<string, number>,
): { tiles: AreaPreviewTile[]; outlinePaths: AreaPreviewOutlinePath[]; outlineStyle: CSSProperties; isCapped: boolean } {
  const bounds = area.bounds;
  const centerX = bounds.center_x;
  const centerY = bounds.center_y;
  const paddedWidth = Math.max(
    AREA_PREVIEW_MIN_WORLD_SIZE,
    bounds.width + Math.max(6, Math.ceil(bounds.width * 0.28)),
  );
  const paddedHeight = Math.max(
    AREA_PREVIEW_MIN_WORLD_SIZE,
    bounds.height + Math.max(6, Math.ceil(bounds.height * 0.28)),
  );
  let viewWidth = paddedWidth;
  let viewHeight = paddedHeight;

  if (viewWidth / viewHeight > AREA_PREVIEW_ASPECT_RATIO) {
    viewHeight = viewWidth / AREA_PREVIEW_ASPECT_RATIO;
  } else {
    viewWidth = viewHeight * AREA_PREVIEW_ASPECT_RATIO;
  }

  const viewMinX = centerX - viewWidth / 2;
  const viewMaxX = centerX + viewWidth / 2;
  const viewMinY = centerY - viewHeight / 2;
  const viewMaxY = centerY + viewHeight / 2;
  const tileWorldSize = WORLD_LOW_TILE_SIZE;
  const minTileX = Math.floor(viewMinX / tileWorldSize);
  const maxTileX = Math.floor((viewMaxX - 1) / tileWorldSize);
  const minTileY = Math.floor(viewMinY / tileWorldSize);
  const maxTileY = Math.floor((viewMaxY - 1) / tileWorldSize);
  const centerTileX = Math.floor(centerX / tileWorldSize);
  const centerTileY = Math.floor(centerY / tileWorldSize);
  const tileCoordinates: Array<{ tileX: number; tileY: number }> = [];

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      tileCoordinates.push({ tileX, tileY });
    }
  }

  const cappedCoordinates = tileCoordinates.length > AREA_PREVIEW_MAX_TILES
    ? tileCoordinates
        .sort((left, right) => {
          const leftDistance = (left.tileX - centerTileX) ** 2 + (left.tileY - centerTileY) ** 2;
          const rightDistance = (right.tileX - centerTileX) ** 2 + (right.tileY - centerTileY) ** 2;

          return leftDistance - rightDistance || left.tileY - right.tileY || left.tileX - right.tileX;
        })
        .slice(0, AREA_PREVIEW_MAX_TILES)
    : tileCoordinates;

  const tiles = cappedCoordinates.map(({ tileX, tileY }) => {
    const tileKey = getWorldTileKey(tileX, tileY, WORLD_LOW_TILE_DETAIL_SCALE);
    const tileOriginX = tileX * tileWorldSize;
    const tileOriginY = tileY * tileWorldSize;

    return {
      key: tileKey,
      src: getWorldTileUrl("visual-low", tileX, tileY, visualTileRevisions[tileKey] ?? 0),
      left: ((tileOriginX - viewMinX) / viewWidth) * 100,
      top: ((viewMaxY - (tileOriginY + tileWorldSize)) / viewHeight) * 100,
      width: (tileWorldSize / viewWidth) * 100,
      height: (tileWorldSize / viewHeight) * 100,
    };
  });

  return {
    tiles,
    outlinePaths: buildAreaPreviewOutlinePaths(
      area.outline_segments,
      viewMinX,
      viewMaxY,
      viewWidth,
      viewHeight,
    ),
    outlineStyle: {
      left: `${((bounds.min_x - viewMinX) / viewWidth) * 100}%`,
      top: `${((viewMaxY - (bounds.max_y + 1)) / viewHeight) * 100}%`,
      width: `${(bounds.width / viewWidth) * 100}%`,
      height: `${(bounds.height / viewHeight) * 100}%`,
    },
    isCapped: tileCoordinates.length > AREA_PREVIEW_MAX_TILES,
  };
}

function ClaimAreaMiniPreview({
  area,
  visualTileRevisions,
}: {
  area: ClaimAreaListItem;
  visualTileRevisions: Record<string, number>;
}) {
  const preview = useMemo(
    () => buildAreaPreview(area, visualTileRevisions),
    [area, visualTileRevisions],
  );
  const paintedRatio = area.claimed_pixels_count === 0
    ? 0
    : Math.round((area.painted_pixels_count / area.claimed_pixels_count) * 100);

  return (
    <div className={`owned-area-preview ${preview.isCapped ? "is-capped" : ""}`} aria-hidden="true">
      <div className="owned-area-preview-tiles">
        {preview.tiles.map((tile) => (
          <span
            className="owned-area-preview-tile"
            key={tile.key}
            style={{
              height: `${tile.height}%`,
              left: `${tile.left}%`,
              top: `${tile.top}%`,
              width: `${tile.width}%`,
            }}
          >
            <Image
              alt=""
              fill
              loading="lazy"
              sizes="154px"
              src={tile.src}
              style={{ imageRendering: "pixelated", objectFit: "fill" }}
              unoptimized
            />
          </span>
        ))}
      </div>
      {preview.outlinePaths.length > 0 ? (
        <svg
          aria-hidden="true"
          className="owned-area-preview-outline-layer"
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
          viewBox="0 0 100 100"
        >
          {preview.outlinePaths.map((path) => (
            <path
              className="owned-area-preview-outline-path"
              d={path.d}
              fill="none"
              key={path.key}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      ) : (
        <span className="owned-area-preview-outline" style={preview.outlineStyle} />
      )}
      <span className="owned-area-preview-progress" style={{ width: `${Math.min(100, Math.max(0, paintedRatio))}%` }} />
    </div>
  );
}

export function WorldStage({ outsideArtAssets, world: initialWorld }: WorldStageProps) {
  const worldRenderCountRef = useRef(0);
  const outsidePatternIdBase = useId().replace(/:/g, "");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const buildPanelRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
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
  const pendingClaimCutoutRectanglesRef = useRef<PendingClaimCutoutRectangle[]>([]);
  const pendingPaintsRef = useRef<PendingPaint[]>([]);
  const pendingPaintMapRef = useRef<Map<string, PendingPaint>>(new Map());
  const pendingOverlayColorMapRef = useRef<Map<string, number>>(new Map());
  const selectedAreaOverlayColorMapRef = useRef<Map<string, number>>(new Map());
  const claimOutlineSegmentsRef = useRef<ClaimOutlineSegment[]>([]);
  const claimOutlineDebugStatsRef = useRef<ClaimOutlineDebugStats>({
    pathCount: 0,
    pathChars: 0,
    pendingPathChars: 0,
    fetchBounds: null,
    fetchCells: null,
    lastFetchMs: null,
    lastFetchSegments: 0,
    lastFetchTruncated: false,
  });
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
  const initialSharedViewportRef = useRef<SharedViewport | null>(
    typeof window === "undefined" ? null : parseSharedViewportSearch(window.location.search),
  );
  const sharedViewportInspectionQueuedRef = useRef(false);
  const pointerRef = useRef<PointerPosition>({ x: 0, y: 0, inside: false });
  const activeModalRef = useRef<ActiveModal | null>(null);
  const accountMenuOpenRef = useRef(false);
  const namePromptShownRef = useRef(false);
  const pixelPlaceAudioRef = useRef<HTMLAudioElement | null>(null);
  const soundMutedRef = useRef(false);
  const lastPixelPlaceSoundAtRef = useRef(0);
  const notificationsRef = useRef<AppNotification[]>([]);
  const toastSequenceRef = useRef(0);
  const errorToastSignaturesRef = useRef<Map<string, string>>(new Map());
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthSessionStatus>(FALLBACK_AUTH_STATUS);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<ProfileMessage | null>(null);
  const [soundMuted, setSoundMuted] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toastMessages, setToastMessages] = useState<AppToast[]>([]);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<ProfileMessage | null>(null);
  const [shopBusyItem, setShopBusyItem] = useState<ShopItemId | null>(null);
  const [shopQuantities, setShopQuantities] = useState<Record<ShopItemId, string>>({
    pixel_pack_50: "1",
    max_pixels_5: "1",
  });
  const [shopMessage, setShopMessage] = useState<ProfileMessage | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<ProfileMessage | null>(null);
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
  const rectanglePlacementBusy = false;
  const [buildPanelOpen, setBuildPanelOpen] = useState(false);
  const [buildPanelMinimized, setBuildPanelMinimized] = useState(false);
  const [buildPanelPosition, setBuildPanelPosition] = useState<BuildPanelPosition | null>(null);
  const [pendingClaimPixels, setPendingClaimPixels] = useState<PixelCoordinate[]>([]);
  const [pendingClaimRectangles, setPendingClaimRectangles] = useState<PendingClaimRectangle[]>([]);
  const [pendingClaimCutoutRectangles, setPendingClaimCutoutRectangles] = useState<PendingClaimCutoutRectangle[]>([]);
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
  const [areaReactionBusy, setAreaReactionBusy] = useState(false);
  const [areaDraftName, setAreaDraftName] = useState("");
  const [areaDraftDescription, setAreaDraftDescription] = useState("");
  const [areaInvitePublicId, setAreaInvitePublicId] = useState("");
  const [areaEditorOpen, setAreaEditorOpen] = useState(false);
  const [areaMessage, setAreaMessage] = useState<ProfileMessage | null>(null);
  const [areaShareMessage, setAreaShareMessage] = useState<ProfileMessage | null>(null);
  const [areaOptionsMenu, setAreaOptionsMenu] = useState<AreaOptionsMenuState | null>(null);
  const [areaPlayerOptionsMenu, setAreaPlayerOptionsMenu] = useState<AreaPlayerOptionsMenuState | null>(null);
  const [ownedAreas, setOwnedAreas] = useState<ClaimAreaListItem[]>([]);
  const [ownedAreasLoaded, setOwnedAreasLoaded] = useState(false);
  const [ownedAreasLoading, setOwnedAreasLoading] = useState(false);
  const [ownedAreasMessage, setOwnedAreasMessage] = useState<ProfileMessage | null>(null);
  const [ownedAreaSearch, setOwnedAreaSearch] = useState("");
  const [ownedAreaFilter, setOwnedAreaFilter] = useState<AreaListFilter>("all");
  const [ownedAreaEditId, setOwnedAreaEditId] = useState<string | null>(null);
  const [ownedAreaEditName, setOwnedAreaEditName] = useState("");
  const [ownedAreaEditDescription, setOwnedAreaEditDescription] = useState("");
  const [ownedAreaInviteId, setOwnedAreaInviteId] = useState<string | null>(null);
  const [ownedAreaInvitePublicId, setOwnedAreaInvitePublicId] = useState("");
  const [ownedAreaActionBusy, setOwnedAreaActionBusy] = useState<string | null>(null);

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

  useEffect(() => {
    setAreaShareMessage(null);
  }, [selectedArea?.id]);

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
          reactions: summary.reactions,
          viewer_can_edit: summary.viewer_can_edit,
          viewer_can_paint: summary.viewer_can_paint,
          bounds: summary.bounds ?? area.bounds,
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

  const handleAreaShare = useCallback(async (): Promise<void> => {
    if (selectedAreaSnapshotRef.current === null || inspectedPixelSnapshotRef.current === null) {
      return;
    }

    setAreaShareMessage(null);

    try {
      if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("Clipboard API is not available.");
      }

      const targetPixel = inspectedPixelSnapshotRef.current;
      const currentCamera = pendingCameraUpdateRef.current ?? cameraRef.current;
      const shareUrl = new URL(window.location.href);
      shareUrl.search = "";
      shareUrl.hash = "";
      shareUrl.searchParams.set("x", formatShareNumber(targetPixel.x, 0));
      shareUrl.searchParams.set("y", formatShareNumber(targetPixel.y, 0));
      shareUrl.searchParams.set("zoom", formatShareNumber(currentCamera.zoom, 4));

      await navigator.clipboard.writeText(shareUrl.toString());
      setAreaShareMessage({
        tone: "success",
        text: "Share link copied.",
      });
    } catch {
      setAreaShareMessage({
        tone: "error",
        text: "Share link could not be copied automatically.",
      });
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
    if (!accountMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      const menu = accountMenuRef.current;

      if (menu !== null && event.target instanceof Node && !menu.contains(event.target)) {
        setAccountMenuOpen(false);
        setDeleteConfirmOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setDeleteConfirmOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

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
      setPendingClaimCutoutRectangles([]);
      setPendingPaints([]);
      pendingClaimPixelsRef.current = [];
      pendingClaimPixelMapRef.current = new Set();
      pendingClaimRectanglesRef.current = [];
      pendingClaimCutoutRectanglesRef.current = [];
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
    setDeleteMessage(null);
    setDeleteConfirmOpen(false);
  }, [authStatus.user?.display_name]);

  useEffect(() => {
    if (authStatus.user?.needs_display_name_setup && !namePromptShownRef.current) {
      setActiveModal(null);
      setAccountMenuOpen(true);
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
  const ownedAreaCount = useMemo(() => {
    return ownedAreas.filter((area) => area.viewer_can_edit).length;
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
  accountMenuOpenRef.current = accountMenuOpen;
  soundMutedRef.current = soundMuted;
  notificationsRef.current = notifications;
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

  const unreadNotificationCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );
  const notificationBadgeLabel = unreadNotificationCount > 0
    ? getUnreadNotificationLabel(unreadNotificationCount)
    : "";
  const currentUserPublicId = currentUser?.public_id ?? null;

  const pushNotification = useCallback((notification: Omit<AppNotification, "createdAt" | "read">): void => {
    setNotifications((current) => {
      if (current.some((existing) => existing.id === notification.id)) {
        return current;
      }

      return [
        {
          ...notification,
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...current,
      ].slice(0, NOTIFICATION_LIMIT);
    });
  }, []);

  const pushToast = useCallback((toast: Omit<AppToast, "id">): void => {
    const id = `toast-${Date.now()}-${toastSequenceRef.current}`;
    toastSequenceRef.current += 1;

    setToastMessages((current) => [
      {
        ...toast,
        id,
      },
      ...current,
    ].slice(0, TOAST_LIMIT));

    window.setTimeout(() => {
      setToastMessages((current) => current.filter((message) => message.id !== id));
    }, TOAST_DISMISS_MS);
  }, []);

  const dismissToast = useCallback((id: string): void => {
    setToastMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  const markNotificationsRead = useCallback((): void => {
    setNotifications((current) => {
      if (current.every((notification) => notification.read)) {
        return current;
      }

      return current.map((notification) => ({
        ...notification,
        read: true,
      }));
    });
  }, []);

  const playPixelPlaceSound = useCallback((): void => {
    if (soundMutedRef.current || typeof window === "undefined") {
      return;
    }

    const now = performance.now();

    if (now - lastPixelPlaceSoundAtRef.current < PIXEL_PLACE_SOUND_THROTTLE_MS) {
      return;
    }

    lastPixelPlaceSoundAtRef.current = now;
    const audio = pixelPlaceAudioRef.current ?? new Audio(PIXEL_PLACE_SOUND_SRC);
    pixelPlaceAudioRef.current = audio;
    audio.volume = 0.42;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, []);

  function handleNotificationsToggle(): void {
    setNotificationsOpen((open) => {
      const nextOpen = !open;

      if (nextOpen) {
        markNotificationsRead();
      }

      return nextOpen;
    });
  }

  function handleSoundMuteToggle(): void {
    setSoundMuted((muted) => !muted);
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSoundMuted(window.localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SOUND_MUTED_STORAGE_KEY, soundMuted ? "1" : "0");
  }, [soundMuted]);

  useEffect(() => {
    if (typeof window === "undefined" || currentUserPublicId === null) {
      setNotifications([]);
      setNotificationsOpen(false);
      return;
    }

    try {
      const stored = window.localStorage.getItem(`${NOTIFICATION_STORAGE_PREFIX}${currentUserPublicId}`);
      const parsed = stored ? JSON.parse(stored) : [];
      setNotifications(Array.isArray(parsed) ? parsed.filter(isStoredNotification).slice(0, NOTIFICATION_LIMIT) : []);
    } catch {
      setNotifications([]);
    }

    setNotificationsOpen(false);
  }, [currentUserPublicId]);

  useEffect(() => {
    if (typeof window === "undefined" || currentUserPublicId === null) {
      return;
    }

    window.localStorage.setItem(
      `${NOTIFICATION_STORAGE_PREFIX}${currentUserPublicId}`,
      JSON.stringify(notifications.slice(0, NOTIFICATION_LIMIT)),
    );
  }, [currentUserPublicId, notifications]);

  useEffect(() => {
    const sources: Array<[string, string, ProfileMessage | null]> = [
      ["profile", "Profile error", profileMessage],
      ["avatar", "Avatar error", avatarMessage],
      ["shop", "Shop error", shopMessage],
      ["delete", "Account error", deleteMessage],
      ["area", "Area error", areaMessage],
      ["areas-list", "My Areas error", ownedAreasMessage],
      ["placement", "Placement error", placementMessage],
    ];

    for (const [source, title, message] of sources) {
      if (message?.tone !== "error") {
        errorToastSignaturesRef.current.delete(source);
        continue;
      }

      const signature = message.text;
      if (errorToastSignaturesRef.current.get(source) === signature) {
        continue;
      }

      errorToastSignaturesRef.current.set(source, signature);
      pushToast({
        tone: "error",
        title,
        text: signature,
      });
    }
  }, [
    areaMessage,
    avatarMessage,
    deleteMessage,
    ownedAreasMessage,
    placementMessage,
    profileMessage,
    pushToast,
    shopMessage,
  ]);

  useEffect(() => {
    if (currentUserPublicId === null || !currentUser?.needs_display_name_setup) {
      return;
    }

    pushNotification({
      id: `profile-setup-${currentUserPublicId}`,
      tone: "warning",
      title: "Profile setup",
      body: "Choose your display name so other players can recognize you on PixelProject.",
    });
  }, [currentUser?.needs_display_name_setup, currentUserPublicId, pushNotification]);

  useEffect(() => {
    if (currentUserPublicId === null || !ownedAreasLoaded) {
      return;
    }

    const joinedAreas = ownedAreas.filter((area) => !area.viewer_can_edit && area.viewer_can_paint);

    if (joinedAreas.length === 0) {
      return;
    }

    pushNotification({
      id: `joined-areas-${currentUserPublicId}-${joinedAreas.map((area) => area.id).sort().join("-")}`,
      tone: "info",
      title: "Area access",
      body: `You can now paint in ${joinedAreas.length} shared area${joinedAreas.length === 1 ? "" : "s"}.`,
    });
  }, [currentUserPublicId, ownedAreas, ownedAreasLoaded, pushNotification]);

  useEffect(() => {
    if (isCentered || viewportSize.width === 0 || viewportSize.height === 0) {
      return;
    }

    const sharedViewport = initialSharedViewportRef.current;
    const initialZoom = sharedViewport
      ? clampZoom(sharedViewport.zoom, minZoom)
      : clampZoom(Math.min(DEFAULT_ZOOM, fitZoom), minZoom);
    const centerX = sharedViewport?.x ?? activeWorldBounds.centerX;
    const centerY = sharedViewport?.y ?? activeWorldBounds.centerY;

    setCamera(
      clampCamera({
        x: viewportSize.width / 2 - centerX * initialZoom,
        y: viewportSize.height / 2 + centerY * initialZoom,
        zoom: initialZoom,
      }),
    );

    if (sharedViewport !== null) {
      const targetPixel = {
        x: Math.floor(sharedViewport.x),
        y: Math.floor(sharedViewport.y),
      };
      setSelectedPixel(targetPixel);
      setInspectedPixel(targetPixel);
      setInspectedPixelRecord(null);
      sharedViewportInspectionQueuedRef.current = true;
    }

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

    if (focusedClaimOutlineAreaId !== null) {
      if (focusedClaimOutlineAreaBounds === null) {
        return null;
      }

      const focusedAreaBounds = {
        minX: Math.max(viewportBounds.minX, focusedClaimOutlineAreaBounds.min_x - 1),
        maxX: Math.min(viewportBounds.maxX, focusedClaimOutlineAreaBounds.max_x + 1),
        minY: Math.max(viewportBounds.minY, focusedClaimOutlineAreaBounds.min_y - 1),
        maxY: Math.min(viewportBounds.maxY, focusedClaimOutlineAreaBounds.max_y + 1),
      };

      if (
        focusedAreaBounds.minX > focusedAreaBounds.maxX ||
        focusedAreaBounds.minY > focusedAreaBounds.maxY
      ) {
        return null;
      }

      if (getWorldWindowCellCount(focusedAreaBounds) > CLAIM_OUTLINE_MAX_FOCUSED_FETCH_CELLS) {
        return null;
      }

      return focusedAreaBounds;
    }

    if (!semanticZoomMode || fetchWorldTileDetailScale !== 1) {
      return null;
    }

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
      claimOutlineDebugStatsRef.current = {
        ...claimOutlineDebugStatsRef.current,
        fetchBounds: null,
        fetchCells: null,
        lastFetchMs: null,
        lastFetchSegments: 0,
        lastFetchTruncated: false,
      };
      clearClaimOutlinesImmediately();
      return;
    }

    const bounds = claimOutlineFetchBounds;
    const boundsKey = getFetchBoundsKey(bounds);
    const fetchCellCount = getWorldWindowCellCount(bounds);
    const requestKey = `${boundsKey}:${focusedClaimOutlineAreaPublicId ?? "active"}:${currentUser?.id ?? "guest"}`;
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
    claimOutlineDebugStatsRef.current = {
      ...claimOutlineDebugStatsRef.current,
      fetchBounds: boundsKey,
      fetchCells: fetchCellCount,
      lastFetchMs: null,
      lastFetchSegments: 0,
      lastFetchTruncated: false,
    };
    markPerfEvent("claim outline fetch start", `${boundsKey}; ${formatCount(fetchCellCount)} cells`);
    emitDebugEvent(
      "network",
      "Claim outline fetch start",
      `${boundsKey}; ${formatCount(fetchCellCount)} cells; ${focusedClaimOutlineAreaPublicId === null ? "active outlines" : `focus #${focusedClaimOutlineAreaPublicId}`}`,
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
    const fetchDuration = performance.now() - startedAt;
    claimOutlineDebugStatsRef.current = {
      ...claimOutlineDebugStatsRef.current,
      fetchBounds: boundsKey,
      fetchCells: fetchCellCount,
      lastFetchMs: fetchDuration,
      lastFetchSegments: result.segments.length,
      lastFetchTruncated: result.truncated,
    };
    markPerfEvent("claim outline fetch done", `${result.segments.length} segments${result.truncated ? " (truncated)" : ""}; ${formatPerfTime(fetchDuration)}`);
    emitDebugEvent(
      "network",
      "Claim outline fetch done",
      `${result.segments.length} segments${result.truncated ? " (truncated)" : ""}; ${boundsKey}; ${formatCount(fetchCellCount)} cells`,
      fetchDuration,
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
      claimOutlineDebugStatsRef.current = {
        ...claimOutlineDebugStatsRef.current,
        fetchBounds: null,
        fetchCells: null,
        lastFetchMs: null,
        lastFetchSegments: 0,
        lastFetchTruncated: false,
      };
      claimOutlineSegmentsRef.current = [];
      setClaimOutlineSegments((current) => current.length === 0 ? current : []);
      return;
    }

    let cancelled = false;
    const fetchGeneration = cameraFetchGenerationRef.current;
    const fetchBoundsKey = getFetchBoundsKey(claimOutlineFetchBounds);
    const fetchCellCount = getWorldWindowCellCount(claimOutlineFetchBounds);
    markPerfEvent(
      "claim outline fetch scheduled",
      `${fetchBoundsKey}; ${formatCount(fetchCellCount)} cells`,
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
  pendingClaimCutoutRectanglesRef.current = pendingClaimCutoutRectangles;
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

  const syncPendingClaimCutoutRectangles = useCallback((nextRectangles: PendingClaimCutoutRectangle[]): void => {
    pendingClaimCutoutRectanglesRef.current = nextRectangles;
    setPendingClaimCutoutRectangles(nextRectangles);
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

  useEffect(() => {
    if (!isCentered || !sharedViewportInspectionQueuedRef.current || inspectedPixel === null) {
      return;
    }

    sharedViewportInspectionQueuedRef.current = false;
    const targetPixel = inspectedPixel;
    const pixelKey = getPixelKey(targetPixel);
    const abortController = new AbortController();
    areaInspectionAbortRef.current?.abort();
    areaInspectionAbortRef.current = abortController;
    setAreaPanelBusy(true);
    setAreaMessage(null);
    markPerfEvent("area share inspect start", pixelKey);

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
          text: result.error ?? "Shared area details could not be loaded.",
        });
        return;
      }

      markPerfEvent("area share inspect done", pixelKey);
      setInspectedPixelRecord(result.inspection.pixel);
      applyAreaSelection(
        result.inspection.area === null ? null : cacheClaimAreaSummary(result.inspection.area),
      );
    });

    return () => {
      abortController.abort();
    };
  }, [applyAreaSelection, cacheClaimAreaSummary, inspectedPixel, isCentered]);

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
    const outlineDebug = claimOutlineDebugStatsRef.current;

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
      claimOutlinePaths: outlineDebug.pathCount,
      claimOutlinePathChars: outlineDebug.pathChars,
      pendingClaimOutlinePathChars: outlineDebug.pendingPathChars,
      claimOutlineFetchBounds: outlineDebug.fetchBounds,
      claimOutlineFetchCells: outlineDebug.fetchCells,
      claimOutlineLastFetchMs: outlineDebug.lastFetchMs,
      claimOutlineLastFetchSegments: outlineDebug.lastFetchSegments,
      claimOutlineLastFetchTruncated: outlineDebug.lastFetchTruncated,
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

        if (!payload.world_dirty && dirtyTiles.length === 0) {
          if (payload.actor_user_id !== null && payload.actor_user_id === currentUserRef.current?.id) {
            void refreshAuthStatusRef.current(false);
          }
          return;
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

  const pendingClaimOutlinePaths = useMemo(() => {
    return measureDebugWork(
      "Compute pending claim outline",
      () => buildClaimOutlinePaths(
        buildPendingClaimOutlineSegments(pendingClaimPixels, pendingClaimRectangles),
        camera,
      ),
      (paths) => `${paths.length} paths, ${formatCount(paths.reduce((total, path) => total + path.d.length, 0))} path characters`,
    );
  }, [camera, pendingClaimPixels, pendingClaimRectangles]);

  const exactClaimOutlinePaths = useMemo(() => {
    return measureDebugWork(
      "Compute claim outline paths",
      () => buildClaimOutlinePaths(
        claimOutlineSegments,
        camera,
      ),
      (paths) => `${paths.length} paths, ${formatCount(paths.reduce((total, path) => total + path.d.length, 0))} chars from ${claimOutlineSegments.length} segments`,
    );
  }, [camera, claimOutlineSegments]);

  const coarseClaimOutlinePaths = useMemo(() => {
    return measureDebugWork(
      "Compute coarse claim outline",
      () => buildClaimAreaBoundsOutlinePaths(focusedClaimOutlineArea, camera),
      (paths) => `${paths.length} bounds paths`,
    );
  }, [camera, focusedClaimOutlineArea]);

  const claimOutlinePaths = exactClaimOutlinePaths.length > 0 ? exactClaimOutlinePaths : coarseClaimOutlinePaths;

  useEffect(() => {
    claimOutlineDebugStatsRef.current = {
      ...claimOutlineDebugStatsRef.current,
      pathCount: claimOutlinePaths.length,
      pathChars: claimOutlinePaths.reduce((total, path) => total + path.d.length, 0),
      pendingPathChars: pendingClaimOutlinePaths.reduce((total, path) => total + path.d.length, 0),
    };
  }, [claimOutlinePaths, pendingClaimOutlinePaths]);

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

    if (selectedPixelRecord.owner_public_id !== null) {
      return `Claimed by ${formatPlayerNameWithId(
        selectedPixelRecord.owner_display_name ?? "Player",
        selectedPixelRecord.owner_public_id,
      )}`;
    }

    return selectedPixelRecord.owner_display_name
      ? `Claimed by ${selectedPixelRecord.owner_display_name}`
      : "Claimed territory";
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
    options?: { activateBrush?: boolean; quiet?: boolean; updateSelection?: boolean },
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

    if (options?.updateSelection !== false) {
      setSelectedPixel((current) => (
        current !== null && current.x === targetPixel.x && current.y === targetPixel.y
          ? current
          : targetPixel
      ));
    }

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
      playPixelPlaceSound();
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
  }, [getPlacementState, playPixelPlaceSound, syncPendingPaints]);

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

  const stageClaimRectangle = useCallback((start: PixelCoordinate, end: PixelCoordinate): boolean => {
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
    const pendingClaimPixels = pendingClaimPixelsRef.current;
    const pendingClaimPixelMap = pendingClaimPixelMapRef.current;
    const pendingClaimRectangles = pendingClaimRectanglesRef.current;
    const currentPendingClaimCount = getPendingClaimCount(pendingClaimPixels, pendingClaimRectangles);

    const displayedHolders = getCurrentDisplayedHolders(nextUser);

    if (bounds === null) {
      setPlacementMessage({ tone: "error", text: "The active world is not ready yet." });
      return false;
    }

    const placementEvaluation = evaluateClaimRectanglePlacement({
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

    if (placementEvaluation.blockedReason === "outside-world") {
      setPlacementMessage({ tone: "error", text: "The rectangle leaves the active world." });
      return false;
    }

    if (placementEvaluation.newPixelCount === 0) {
      setPlacementMessage({ tone: "info", text: "This rectangle is already staged." });
      return false;
    }

    if (!placementEvaluation.touchesClaimRoute && placementEvaluation.unresolvedNeighborCount === 0) {
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

    if (!placementEvaluation.overlapsPendingClaim && placementEvaluation.coveredClaimedPixelCount === 0) {
      syncPendingClaims(pendingClaimPixels, [...pendingClaimRectangles, rectangle]);
    } else {
      const newPixels: PixelCoordinate[] = [];
      const stagedPixelKeys: string[] = [];

      for (let y = rectangle.minY; y <= rectangle.maxY; y += 1) {
        for (let x = rectangle.minX; x <= rectangle.maxX; x += 1) {
          const pixel = { x, y };
          const pixelKey = getPixelKey(pixel);

          if (
            !hasPendingClaimAtPixel(pixel, pendingClaimPixelMap, pendingClaimRectangles) &&
            !pixelMap.has(pixelKey)
          ) {
            newPixels.push(pixel);
            stagedPixelKeys.push(pixelKey);
          }
        }
      }

      syncPendingClaims([...pendingClaimPixels, ...newPixels], pendingClaimRectangles);

      if (placementEvaluation.coveredClaimedPixelCount > 0 && stagedPixelKeys.length > 0) {
        syncPendingClaimCutoutRectangles([
          ...pendingClaimCutoutRectanglesRef.current,
          {
            ...rectangle,
            stagedPixelKeys,
          },
        ]);
      }
    }

    setPlacementMessage({
      tone: "info",
      text: `${placementEvaluation.newPixelCount} rectangle claim${placementEvaluation.newPixelCount === 1 ? "" : "s"} staged locally.`,
    });
    return true;
  }, [isPixelInsideActiveWorld, syncPendingClaimCutoutRectangles, syncPendingClaims]);

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
        activeModalRef.current !== null ||
        accountMenuOpenRef.current
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
        pickPaintColorAtPixel(targetPixel, { activateBrush: true, updateSelection: false });
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

        if (anchor === null) {
          setRectangleAnchor(clickedPixel);
          setPlacementMessage(null);
          void prefetchRectangleAnchorWindow(clickedPixel);
          return;
        }

        const rectangleKey = `${anchor.x}:${anchor.y} -> ${clickedPixel.x}:${clickedPixel.y}`;
        emitDebugEvent("action", "Rectangle claim validation start", rectangleKey);
        const staged = stageClaimRectangle(anchor, clickedPixel);
        setRectangleAnchor(null);
        emitDebugEvent(
          "action",
          "Rectangle claim validation done",
          `${rectangleKey}; ${staged ? "staged" : "blocked"}`,
        );
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
    setAccountMenuOpen(false);
    setActiveModal(null);
  }

  async function handleDeleteAccount(): Promise<void> {
    if (!currentUser || deleteBusy) {
      return;
    }

    setDeleteBusy(true);
    setDeleteMessage(null);

    const result = await deleteAccount();

    if (!result.ok) {
      setDeleteMessage({
        tone: "error",
        text: result.error ?? "Account deletion failed.",
      });
      setDeleteBusy(false);
      return;
    }

    setAuthStatus(FALLBACK_AUTH_STATUS);
    currentUserRef.current = null;
    setDeleteBusy(false);
    setDeleteConfirmOpen(false);
    setAccountMenuOpen(false);
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

  function handleShopQuantityChange(itemId: ShopItemId, rawValue: string): void {
    setShopQuantities((current) => ({
      ...current,
      [itemId]: sanitizeQuantityInput(rawValue),
    }));
  }

  function handleShopQuantityBlur(itemId: ShopItemId): void {
    setShopQuantities((current) => ({
      ...current,
      [itemId]: current[itemId] === "" ? "1" : current[itemId],
    }));
  }

  function getShopQuantity(itemId: ShopItemId): number {
    const rawQuantity = shopQuantities[itemId];

    if (!/^\d+$/.test(rawQuantity)) {
      return 0;
    }

    return Math.max(1, Math.min(999, Number.parseInt(rawQuantity, 10)));
  }

  async function handleShopPurchase(itemId: ShopItemId): Promise<void> {
    if (!currentUser || shopBusyItem !== null) {
      return;
    }

    const quantity = getShopQuantity(itemId);

    if (quantity < 1) {
      setShopMessage({
        tone: "error",
        text: "Enter a whole quantity.",
      });
      return;
    }

    setShopBusyItem(itemId);
    setShopMessage(null);

    const result = await purchaseShopItem(itemId, quantity);

    if (!result.ok || result.user === null) {
      setShopMessage({
        tone: "error",
        text: result.error ?? "Shop purchase failed.",
      });
      setShopBusyItem(null);
      return;
    }

    setAuthStatus((current) => ({
      ...current,
      user: result.user,
    }));
    currentUserRef.current = result.user;
    setShopMessage({
      tone: "success",
      text: itemId === "pixel_pack_50"
        ? `${formatCount(50 * quantity)} Color Pixels added.`
        : `Maximum Color Pixels increased by ${formatCount(5 * quantity)}.`,
    });
    pushNotification({
      id: `shop-${itemId}-${Date.now()}`,
      tone: "success",
      title: "Shop purchase",
      body: itemId === "pixel_pack_50"
        ? `${formatCount(50 * quantity)} Color Pixels were added to your account.`
        : `Your Max Pixels capacity increased by ${formatCount(5 * quantity)}.`,
    });
    setShopBusyItem(null);
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
        pushNotification({
          id: `overlay-claim-${Date.now()}`,
          tone: "success",
          title: "Overlay saved",
          body: "Your overlay Claim Area was saved and is ready for invited painters.",
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
        syncPendingClaimCutoutRectangles([]);
        setRectangleAnchor(null);
        setPlacementMessage({
          tone: "success",
          text: claimModeAtSubmit === "expand"
            ? `${pendingClaimCountToSubmit} Claim Area cell${pendingClaimCountToSubmit === 1 ? "" : "s"} saved to ${claimTargetAreaNameAtSubmit}.`
            : `${pendingClaimCountToSubmit} Claim Area cell${pendingClaimCountToSubmit === 1 ? "" : "s"} saved. Your new active area is ready. Extend it later from Area Info.`,
        });
        pushNotification({
          id: `claim-${Date.now()}`,
          tone: "success",
          title: claimModeAtSubmit === "expand" ? "Area extended" : "Area created",
          body: claimModeAtSubmit === "expand"
            ? `${pendingClaimCountToSubmit} Claim Area cell${pendingClaimCountToSubmit === 1 ? "" : "s"} were added to ${claimTargetAreaNameAtSubmit}.`
            : "Your new active area was created and can now be painted.",
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
      pushNotification({
        id: `paint-${Date.now()}`,
        tone: "success",
        title: "Pixels placed",
        body: `${paintsToSubmit.length} Color Pixel${paintsToSubmit.length === 1 ? "" : "s"} were saved to the world.`,
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
    const cutoutRectanglesToSubmit = pendingClaimCutoutRectanglesRef.current;
    const explicitPixelsToSubmit = cutoutRectanglesToSubmit.length === 0
      ? claimPixelsToSubmit
      : claimPixelsToSubmit.filter((pixel) => (
        !cutoutRectanglesToSubmit.some((rectangle) => isPixelInsidePendingClaimRectangle(pixel, rectangle))
      ));
    const rectanglesToSubmit = [
      ...claimRectanglesToSubmit,
      ...cutoutRectanglesToSubmit,
    ];
    emitDebugEvent(
      "network",
      "Claim submit start",
      `${pendingClaimCount} claim pixel${pendingClaimCount === 1 ? "" : "s"}`,
    );
    const result = await claimWorldPixels({
      pixels: explicitPixelsToSubmit,
      rectangles: rectanglesToSubmit.map((rectangle) => ({
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

  async function handleAreaReaction(reaction: ClaimAreaReactionValue): Promise<void> {
    if (selectedArea === null || currentUser === null || areaReactionBusy) {
      return;
    }

    const nextReaction = selectedArea.reactions?.viewer_reaction === reaction ? null : reaction;
    setAreaReactionBusy(true);
    setAreaMessage(null);

    const result = await updateClaimAreaReaction(selectedArea.id, nextReaction);

    if (!result.ok || result.area === null) {
      setAreaMessage({
        tone: "error",
        text: result.error ?? "Area reaction failed.",
      });
      setAreaReactionBusy(false);
      return;
    }

    const reactedArea = cacheClaimAreaSummary(result.area);
    syncOwnedAreaSummary(reactedArea);
    applyAreaSelection(reactedArea, { syncDrafts: false });
    setAreaReactionBusy(false);
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
      syncPendingClaimCutoutRectangles([]);
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
    pushNotification({
      id: `area-invite-${selectedArea.id}-${publicId}-${Date.now()}`,
      tone: "success",
      title: "Player added",
      body: `Player #${publicId} can now paint in ${selectedArea.name}.`,
    });
    setAreaPanelBusy(false);
  }

  function startOwnedAreaEdit(area: ClaimAreaListItem): void {
    if (!area.viewer_can_edit) {
      setOwnedAreasMessage({
        tone: "error",
        text: "Only the owner or an area admin can edit this area.",
      });
      return;
    }

    setOwnedAreaEditId(area.id);
    setOwnedAreaEditName(area.name);
    setOwnedAreaEditDescription(area.description);
    setOwnedAreaInviteId(null);
    setOwnedAreasMessage(null);
  }

  function startOwnedAreaInvite(area: ClaimAreaListItem): void {
    if (!area.viewer_can_edit) {
      setOwnedAreasMessage({
        tone: "error",
        text: "Only the owner or an area admin can add players.",
      });
      return;
    }

    setOwnedAreaInviteId(area.id);
    setOwnedAreaInvitePublicId("");
    setOwnedAreaEditId(null);
    setOwnedAreasMessage(null);
  }

  function closeOwnedAreaInlineTools(): void {
    setOwnedAreaEditId(null);
    setOwnedAreaEditName("");
    setOwnedAreaEditDescription("");
    setOwnedAreaInviteId(null);
    setOwnedAreaInvitePublicId("");
    setOwnedAreaActionBusy(null);
  }

  async function handleOwnedAreaSave(area: ClaimAreaListItem): Promise<void> {
    if (ownedAreaActionBusy !== null) {
      return;
    }

    if (ownedAreaEditName.length > AREA_NAME_MAX_LENGTH) {
      setOwnedAreasMessage({
        tone: "error",
        text: `Name is limited to ${AREA_NAME_MAX_LENGTH} characters.`,
      });
      return;
    }

    if (ownedAreaEditDescription.length > AREA_DESCRIPTION_MAX_LENGTH) {
      setOwnedAreasMessage({
        tone: "error",
        text: `Description is limited to ${AREA_DESCRIPTION_MAX_LENGTH} characters.`,
      });
      return;
    }

    setOwnedAreaActionBusy(`edit:${area.id}`);
    setOwnedAreasMessage(null);

    const result = await updateClaimArea(area.id, ownedAreaEditName, ownedAreaEditDescription);

    if (!result.ok || result.area === null) {
      setOwnedAreasMessage({
        tone: "error",
        text: result.error ?? "Area update failed.",
      });
      setOwnedAreaActionBusy(null);
      return;
    }

    const updatedArea = cacheClaimAreaSummary(result.area);
    syncOwnedAreaSummary(updatedArea);
    if (selectedAreaSnapshotRef.current?.id === updatedArea.id) {
      applyAreaSelection(updatedArea);
    }
    closeOwnedAreaInlineTools();
    setOwnedAreasMessage({
      tone: "success",
      text: "Area name and description saved.",
    });
    pushNotification({
      id: `area-edit-${area.id}-${Date.now()}`,
      tone: "success",
      title: "Area updated",
      body: `${updatedArea.name} was updated.`,
    });
  }

  async function handleOwnedAreaInvite(area: ClaimAreaListItem): Promise<void> {
    if (ownedAreaActionBusy !== null) {
      return;
    }

    const publicId = Number.parseInt(ownedAreaInvitePublicId.trim().replace(/^#/, ""), 10);

    if (!Number.isFinite(publicId)) {
      setOwnedAreasMessage({
        tone: "error",
        text: "Enter a valid public player number.",
      });
      return;
    }

    setOwnedAreaActionBusy(`invite:${area.id}`);
    setOwnedAreasMessage(null);

    const result = await inviteAreaContributor(area.id, publicId);

    if (!result.ok || result.area === null) {
      setOwnedAreasMessage({
        tone: "error",
        text: result.error ?? "Contributor invite failed.",
      });
      setOwnedAreaActionBusy(null);
      return;
    }

    const updatedArea = cacheClaimAreaSummary(result.area);
    syncOwnedAreaSummary(updatedArea);
    if (selectedAreaSnapshotRef.current?.id === updatedArea.id) {
      applyAreaSelection(updatedArea, { syncDrafts: false });
    }
    closeOwnedAreaInlineTools();
    setOwnedAreasMessage({
      tone: "success",
      text: `Player #${publicId} can now pixel in ${updatedArea.name}.`,
    });
    pushNotification({
      id: `area-list-invite-${area.id}-${publicId}-${Date.now()}`,
      tone: "success",
      title: "Player added",
      body: `Player #${publicId} can now paint in ${updatedArea.name}.`,
    });
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
      text: `Player ${formatPlayerNameWithId(displayName, publicId)} was removed from this area.`,
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
      text: `Player ${formatPlayerNameWithId(displayName, publicId)} is now an admin for this area.`,
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
      syncPendingClaimCutoutRectangles([]);
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
        const matchedCutoutRectangle = pendingClaimCutoutRectanglesRef.current.find((rectangle) => (
          rectangle.stagedPixelKeys.includes(selectedKey)
        ));

        if (matchedCutoutRectangle) {
          const removedKeys = new Set(matchedCutoutRectangle.stagedPixelKeys);
          const nextPendingClaimPixels = pendingClaimPixelsRef.current.filter(
            (pixel) => !removedKeys.has(getPixelKey(pixel)),
          );
          syncPendingClaims(nextPendingClaimPixels, pendingClaimRectanglesRef.current);
          syncPendingClaimCutoutRectangles(
            pendingClaimCutoutRectanglesRef.current.filter((rectangle) => rectangle !== matchedCutoutRectangle),
          );
          setPlacementMessage({
            tone: "info",
            text: "Selected rectangle cutout removed.",
          });
          return;
        }

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
      ? "Pick target"
      : `Target: ${activeClaimTargetAreaName}`
    : newAreaBlockedReason ?? "";
  const buildPanelModeLabel = activeBuildMode === "claim" ? claimPanelModeLabel : BUILD_MODE_LABEL.paint;
  const buildPanelModeHelp = activeBuildMode === "claim" ? claimPanelModeHelp : BUILD_MODE_HELP.paint;
  const claimPlacementStatus = claimAreaMode === "expand"
    ? activeClaimTargetArea === null
      ? "Pick target"
      : activeClaimTargetArea.name
    : newAreaBlockedReason;
  const newAreaButtonActive = buildPanelOpen && activeBuildMode === "claim" && claimAreaMode === "new";
  const newAreaButtonDisabled = currentUser !== null && newAreaBlockedReason !== null;
  const colorPixelProjection = useProjectedNormalPixelState(currentUser);
  const colorPixelButtonLabel = currentUser === null
    ? "Login required"
    : `${Math.max(0, colorPixelProjection.displayedPixels - pendingPaints.length)} px`;
  const colorPixelButtonHelp = "Color Pixel: You can only pixel in areas you own or where you were added.";
  const accountLevelProgressPercent = getLevelProgressPercent(currentUser);
  const accountLevelProgressLabel = `${Math.round(accountLevelProgressPercent)}%`;
  const accountProgressStyle = {
    "--account-level-progress": `${accountLevelProgressPercent}%`,
  } as CSSProperties;
  const normalPixelFullRefillText = getNormalPixelFullRefillText(currentUser);
  const shopItems: Array<{
    id: ShopItemId;
    title: string;
    detail: string;
    cost: number;
    artwork: ReactNode;
  }> = [
    {
      id: "pixel_pack_50",
      title: "50 Color Pixels",
      detail: `+${formatCount(50 * getShopQuantity("pixel_pack_50"))}`,
      cost: 500,
      artwork: <ShopPixelPackArtwork variant={SHOP_COLOR_PIXEL_ARTWORK_VARIANT} />,
    },
    {
      id: "max_pixels_5",
      title: "Max Pixels +5",
      detail: `${formatCount(currentUser?.normal_pixel_limit ?? 0)} max`,
      cost: 500,
      artwork: <ShopCapacityArtwork variant={SHOP_MAX_PIXEL_ARTWORK_VARIANT} />,
    },
  ];
  const searchedOwnedAreas = useMemo(() => {
    const search = ownedAreaSearch.trim().toLowerCase();

    if (search.length === 0) {
      return ownedAreas;
    }

    return ownedAreas.filter((area) => {
      const searchable = [
        area.name,
        area.description,
        String(area.public_id),
        formatClaimAreaId(area.public_id),
        area.owner.display_name,
        String(area.owner.public_id),
      ].join(" ").toLowerCase();

      return searchable.includes(search);
    });
  }, [ownedAreaSearch, ownedAreas]);
  const searchedOwnedActiveAreas = useMemo(
    () => searchedOwnedAreas.filter((area) => area.status === "active" && area.viewer_can_edit),
    [searchedOwnedAreas],
  );
  const searchedContributedActiveAreas = useMemo(
    () => searchedOwnedAreas.filter((area) => area.status === "active" && !area.viewer_can_edit && area.viewer_can_paint),
    [searchedOwnedAreas],
  );
  const searchedFinishedVisibleAreas = useMemo(
    () => searchedOwnedAreas.filter((area) => area.status === "finished"),
    [searchedOwnedAreas],
  );
  const areaSections = useMemo(() => {
    const sections = [
      {
        key: "owned-active" as const,
        filter: "owned" as const,
        title: "Your active artworks",
        detail: currentUser
          ? `${searchedOwnedActiveAreas.length} / ${currentUser.claim_area_limit} active slot${currentUser.claim_area_limit === 1 ? "" : "s"} used`
          : `${searchedOwnedActiveAreas.length} active`,
        empty: "You do not have an active artwork right now.",
        areas: searchedOwnedActiveAreas,
      },
      {
        key: "contributed-active" as const,
        filter: "joined" as const,
        title: "Active claims you joined",
        detail: `${searchedContributedActiveAreas.length} active`,
        empty: "No active contributor claims found.",
        areas: searchedContributedActiveAreas,
      },
      {
        key: "finished" as const,
        filter: "finished" as const,
        title: "Finished artworks",
        detail: `${searchedFinishedVisibleAreas.length} finished`,
        empty: "No finished artworks found yet.",
        areas: searchedFinishedVisibleAreas,
      },
    ];

    return ownedAreaFilter === "all"
      ? sections
      : sections.filter((section) => section.filter === ownedAreaFilter);
  }, [
    currentUser,
    ownedAreaFilter,
    searchedContributedActiveAreas,
    searchedFinishedVisibleAreas,
    searchedOwnedActiveAreas,
  ]);
  const visibleOwnedAreaCount = areaSections.reduce((sum, section) => sum + section.areas.length, 0);
  const ownedAreaFilterOptions: Array<{ value: AreaListFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "owned", label: "Mine" },
    { value: "joined", label: "Joined" },
    { value: "finished", label: "Done" },
  ];
  const selectedAreaPaintPercent = selectedArea === null || selectedArea.claimed_pixels_count <= 0
    ? 0
    : Math.round((selectedArea.painted_pixels_count / selectedArea.claimed_pixels_count) * 100);
  const selectedAreaCanManage = selectedArea?.viewer_can_edit ?? false;
  const selectedAreaReactions = selectedArea?.reactions ?? {
    like_count: 0,
    dislike_count: 0,
    viewer_reaction: null,
  };
  const selectedAreaLikeCount = selectedAreaReactions.like_count;
  const selectedAreaDislikeCount = selectedAreaReactions.dislike_count;
  const selectedAreaReactionTotal = selectedAreaLikeCount + selectedAreaDislikeCount;
  const selectedAreaLikeRatio = selectedAreaReactionTotal === 0
    ? 0
    : Math.round((selectedAreaLikeCount / selectedAreaReactionTotal) * 100);
  const selectedAreaReactionRatioLabel = selectedAreaReactionTotal === 0
    ? "No reactions yet"
    : `${selectedAreaLikeRatio}% like ratio`;
  const selectedAreaContributors = isClaimAreaSummary(selectedArea) ? selectedArea.contributors : [];
  const selectedAreaCanSeeDislikeCount = selectedArea !== null && currentUser !== null && (
    selectedArea.viewer_can_edit ||
    selectedArea.viewer_can_paint ||
    selectedArea.owner.id === currentUser.id ||
    selectedAreaContributors.some((contributor) => contributor.id === currentUser.id)
  );
  const areaDraftNameLength = areaDraftName.length;
  const areaDraftDescriptionLength = areaDraftDescription.length;
  const areaDraftNameTooLong = areaDraftNameLength > AREA_NAME_MAX_LENGTH;
  const areaDraftDescriptionTooLong = areaDraftDescriptionLength > AREA_DESCRIPTION_MAX_LENGTH;
  const areaDraftInvalid = areaDraftNameTooLong || areaDraftDescriptionTooLong;

  return (
    <main className={`world-shell ${darkMode ? "theme-dark" : "theme-light"}`}>
      <PerfDebugOverlay getSnapshot={getDebugWorldSnapshot} />
      {toastMessages.length > 0 ? (
        <div className="app-toast-stack" aria-live="assertive" aria-relevant="additions">
          {toastMessages.map((toast) => (
            <div className={`app-toast is-${toast.tone}`} key={toast.id} role="status">
              <strong>{toast.title}</strong>
              <span>{toast.text}</span>
              <button
                aria-label="Dismiss notification"
                className="app-toast-dismiss"
                onClick={() => dismissToast(toast.id)}
                title="Dismiss"
                type="button"
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}
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
        <div className="account-menu-shell" ref={accountMenuRef}>
          {currentUser ? (
            <>
              <button
                aria-expanded={accountMenuOpen}
                aria-label="Open profile menu"
                className="account-launcher"
                onClick={() => {
                  setActiveModal(null);
                  setAccountMenuOpen((open) => {
                    const nextOpen = !open;

                    if (!nextOpen) {
                      setNotificationsOpen(false);
                    }

                    return nextOpen;
                  });
                }}
                style={accountProgressStyle}
                type="button"
              >
                <span className="account-launcher-ring">
                  {currentUser.avatar_url ? (
                    <Image
                      alt=""
                      className="account-launcher-avatar"
                      height={44}
                      referrerPolicy="no-referrer"
                      src={currentUser.avatar_url}
                      width={44}
                    />
                  ) : (
                    <span className="account-launcher-avatar account-launcher-fallback" aria-hidden="true">
                      <DefaultAvatarIcon />
                    </span>
                  )}
                </span>
                <span className="account-level-chip">{currentUser.level}</span>
                {unreadNotificationCount > 0 ? (
                  <span className="account-notification-badge">{notificationBadgeLabel}</span>
                ) : null}
              </button>
              {accountMenuOpen ? (
                <aside className="account-popover" aria-label="Profile menu">
                  <input
                    accept="image/*"
                    className="avatar-file-input"
                    onChange={(event) => void handleAvatarFileChange(event)}
                    ref={avatarFileInputRef}
                    type="file"
                  />
                  <div className="account-popover-head">
                    <div className="account-popover-avatar-wrap">
                      {currentUser.avatar_url ? (
                        <Image
                          alt={currentUser.display_name}
                          className="account-popover-avatar"
                          height={58}
                          referrerPolicy="no-referrer"
                          src={currentUser.avatar_url}
                          width={58}
                        />
                      ) : (
                        <div className="account-popover-avatar account-avatar-fallback" aria-hidden="true">
                          <DefaultAvatarIcon />
                        </div>
                      )}
                      <button
                        aria-label="Upload avatar"
                        className="account-avatar-edit-button"
                        disabled={avatarBusy}
                        onClick={handleAvatarUploadClick}
                        title="Avatar"
                        type="button"
                      >
                        <PencilIcon />
                      </button>
                    </div>
                    <div className="account-popover-title">
                      <strong>{currentUser.display_name}</strong>
                      <span>#{currentUser.public_id}</span>
                    </div>
                    <div className="account-coin-pill" title="Coins">
                      <CoinIcon />
                      <strong>{formatCount(currentUser.coins)}</strong>
                    </div>
                  </div>

                  <div
                    className="account-level-panel"
                    title={`${currentUser.level_progress_current} / ${currentUser.level_progress_target} XP`}
                  >
                    <div className="account-level-panel-top">
                      <LevelIcon />
                      <strong>{currentUser.level}</strong>
                      <span>{accountLevelProgressLabel}</span>
                    </div>
                    <div className="account-level-bar" aria-hidden="true">
                      <span style={{ width: `${accountLevelProgressPercent}%` }} />
                    </div>
                  </div>

                  <div className="account-notification-block">
                    <button
                      aria-expanded={notificationsOpen}
                      className="account-notification-toggle"
                      onClick={handleNotificationsToggle}
                      type="button"
                    >
                      <BellIcon className="account-mini-icon" />
                      <span>Notifications</span>
                      {unreadNotificationCount > 0 ? (
                        <strong className="account-inline-badge">{notificationBadgeLabel}</strong>
                      ) : null}
                    </button>
                    {notificationsOpen ? (
                      <div className="account-notification-menu">
                        {notifications.length === 0 ? (
                          <p className="account-helper">No notifications yet.</p>
                        ) : (
                          notifications.map((notification) => (
                            <article
                              className={`account-notification-item is-${notification.tone} ${notification.read ? "is-read" : ""}`}
                              key={notification.id}
                            >
                              <div>
                                <strong>{notification.title}</strong>
                                <time>{formatNotificationTime(notification.createdAt)}</time>
                              </div>
                              <p>{notification.body}</p>
                            </article>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="account-quick-grid">
                    <article className="account-quick-stat">
                      <PixelIcon />
                      <span>Max Pixel</span>
                      <strong>{formatCount(currentUser.normal_pixel_limit)}</strong>
                    </article>
                    <article className="account-quick-stat">
                      <AreaIcon />
                      <span>Areas</span>
                      <strong>{formatCount(ownedAreaCount)}</strong>
                    </article>
                    <article className="account-quick-stat">
                      <TimerIcon />
                      <span>Full</span>
                      <strong>{normalPixelFullRefillText}</strong>
                    </article>
                    <article className="account-quick-stat">
                      <PixelIcon />
                      <span>Total Placed</span>
                      <strong>{formatCount(currentUser.pixels_placed_total)}</strong>
                    </article>
                  </div>

                  <div className="account-inline-edit">
                    <input
                      aria-label="Display name"
                      className="account-input account-popover-input"
                      maxLength={24}
                      onChange={(event) => setProfileName(event.target.value)}
                      placeholder="Name"
                      type="text"
                      value={profileName}
                    />
                    <span className="account-action-tooltip" title={nameChangeHint || "Save display name"}>
                      <button
                        aria-label="Save display name"
                        className="account-icon-action"
                        disabled={
                          authBusy ||
                          profileBusy ||
                          !currentUser.can_change_display_name ||
                          !hasDisplayNameChange
                        }
                        onClick={() => void handleDisplayNameSave()}
                        title={nameChangeHint || "Save display name"}
                        type="button"
                      >
                        <SaveIcon />
                      </button>
                    </span>
                  </div>
                  {profileMessage ? (
                    <p className={`account-feedback is-${profileMessage.tone}`}>{profileMessage.text}</p>
                  ) : null}
                  {avatarMessage ? (
                    <p className={`account-feedback is-${avatarMessage.tone}`}>{avatarMessage.text}</p>
                  ) : null}

                  <div className="account-popover-actions">
                    <button
                      aria-label={soundMuted ? "Unmute sounds" : "Mute sounds"}
                      aria-pressed={soundMuted}
                      className={`account-icon-action ${soundMuted ? "is-muted" : ""}`}
                      onClick={handleSoundMuteToggle}
                      title={soundMuted ? "Unmute sounds" : "Mute sounds"}
                      type="button"
                    >
                      {soundMuted ? <VolumeMutedIcon /> : <VolumeOnIcon />}
                    </button>
                    <button
                      aria-label="Logout"
                      className="account-icon-action"
                      disabled={authBusy || profileBusy || deleteBusy}
                      onClick={() => void handleLogout()}
                      title="Logout"
                      type="button"
                    >
                      <LogoutIcon />
                    </button>
                    <button
                      aria-label="Delete account"
                      className="account-icon-action is-danger"
                      disabled={authBusy || profileBusy || deleteBusy}
                      onClick={() => setDeleteConfirmOpen((open) => !open)}
                      title="Delete"
                      type="button"
                    >
                      <TrashIcon />
                    </button>
                  </div>

                  {deleteConfirmOpen ? (
                    <div className="account-danger-panel">
                      <span>This action cannot be undone.</span>
                      <div>
                        <button
                          className="pixel-clear-button"
                          disabled={deleteBusy}
                          onClick={() => setDeleteConfirmOpen(false)}
                          type="button"
                        >
                          Cancel
                        </button>
                        <button
                          className="google-button account-delete-button"
                          disabled={deleteBusy}
                          onClick={() => void handleDeleteAccount()}
                          type="button"
                        >
                          {deleteBusy ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {deleteMessage ? (
                    <p className={`account-feedback is-${deleteMessage.tone}`}>{deleteMessage.text}</p>
                  ) : null}
                </aside>
              ) : null}
            </>
          ) : (
            <button className="hud-login-button" onClick={() => setActiveModal("login")} type="button">
              Login
            </button>
          )}
        </div>
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
                  <MoreHorizontalIcon />
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
                      <strong>{formatPlayerNameWithId(selectedArea.owner.display_name, selectedArea.owner.public_id)}</strong>
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
                          <strong>{formatPlayerNameWithId(contributor.display_name, contributor.public_id)}</strong>
                          {contributor.role === "admin" ? (
                            <span className="area-role-tag is-admin">Admin</span>
                          ) : null}
                        </div>
                        {selectedAreaCanManage ? (
                          <div className="area-player-actions">
                            <button
                              aria-label={`Open options for ${formatPlayerNameWithId(contributor.display_name, contributor.public_id)}`}
                              className="area-player-options-button"
                              onClick={(event) => openAreaPlayerOptionsMenu(event, contributor)}
                              title="Player options"
                              type="button"
                            >
                              <MoreHorizontalIcon />
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
              {areaMessage ? (
                <p className={`account-feedback is-${areaMessage.tone}`}>{areaMessage.text}</p>
              ) : null}
              <div className="area-bottom-actions">
                <div className="area-reaction-card" aria-label="Artwork reactions">
                  <div className="area-reaction-controls">
                    <button
                      aria-label="Like artwork"
                      aria-pressed={selectedAreaReactions.viewer_reaction === "like"}
                      className={`area-reaction-button ${selectedAreaReactions.viewer_reaction === "like" ? "is-active" : ""}`}
                      disabled={currentUser === null || areaReactionBusy}
                      onClick={() => void handleAreaReaction("like")}
                      title="Like"
                      type="button"
                    >
                      <ThumbUpIcon />
                      <strong>{formatCount(selectedAreaLikeCount)}</strong>
                    </button>
                    <button
                      aria-label="Dislike artwork"
                      aria-pressed={selectedAreaReactions.viewer_reaction === "dislike"}
                      className={`area-reaction-button is-dislike ${selectedAreaReactions.viewer_reaction === "dislike" ? "is-active" : ""}`}
                      disabled={currentUser === null || areaReactionBusy}
                      onClick={() => void handleAreaReaction("dislike")}
                      title="Dislike"
                      type="button"
                    >
                      <ThumbDownIcon />
                      {selectedAreaCanSeeDislikeCount ? (
                        <strong>{formatCount(selectedAreaDislikeCount)}</strong>
                      ) : null}
                    </button>
                  </div>
                  <div className="area-reaction-meta">
                    <span>{formatCount(selectedAreaLikeCount)} likes</span>
                    {selectedAreaCanSeeDislikeCount ? (
                      <>
                        <span>{formatCount(selectedAreaDislikeCount)} dislikes</span>
                        <strong>{selectedAreaReactionRatioLabel}</strong>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="area-share-card">
                  <button
                    className="area-share-button"
                    onClick={() => void handleAreaShare()}
                    type="button"
                  >
                    <ShareIcon />
                    <span>Share</span>
                  </button>
                  {areaShareMessage ? (
                    <p className={`area-share-feedback is-${areaShareMessage.tone}`}>{areaShareMessage.text}</p>
                  ) : null}
                </div>
              </div>
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
          {areaMessage && selectedArea === null ? (
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
              className={`build-tool-button ${newAreaButtonActive ? "is-active" : ""} ${newAreaButtonDisabled ? "is-blocked" : ""}`}
              disabled={newAreaButtonDisabled}
              onClick={() => handleBuildModeChange("claim")}
              title={newAreaBlockedReason ?? "Start a new claim area"}
              type="button"
            >
              <span className="build-tool-icon">
                <AreaIcon className="tool-mini-icon" />
              </span>
              <span className="build-tool-copy">
                <span className="build-tool-title">{BUILD_MODE_LABEL.claim}</span>
                <small>{newAreaButtonDisabled ? "Blocked" : `${ownedActiveAreas.length}/${currentUser.claim_area_limit} active`}</small>
              </span>
              {pendingClaimCount > 0 ? <strong className="build-tool-badge">{pendingClaimCount}</strong> : null}
            </button>
            <button
              className={`build-tool-button ${buildPanelOpen && activeBuildMode === "paint" ? "is-active" : ""}`}
              onClick={() => handleBuildModeChange("paint")}
              title={colorPixelButtonHelp}
              type="button"
            >
              <span className="build-tool-icon">
                <PixelIcon />
              </span>
              <span className="build-tool-copy">
                <span className="build-tool-title">{BUILD_MODE_LABEL.paint}</span>
                <small>{colorPixelButtonLabel}</small>
              </span>
              {pendingPaints.length > 0 ? <strong className="build-tool-badge">{pendingPaints.length}</strong> : null}
            </button>
          </div>
        </div>
      ) : null}

      {buildPanelOpen && currentUser ? (
        <div
          className={`world-hud world-hud-placement ${buildPanelPosition ? "is-floating" : ""}`}
          style={buildPanelStyle}
        >
          <div
            aria-description={claimPlacementStatus ?? placementHelpText}
            className="pixel-placement-panel"
            ref={buildPanelRef}
          >
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
                  {selectedPixel === null ? "--" : `${selectedPixel.x} : ${selectedPixel.y}`}
                </strong>
                {buildPanelModeHelp ? (
                  <span className="pixel-placement-mode-help">{buildPanelModeHelp}</span>
                ) : null}
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
              <div className="claim-tool-row" aria-label="Claim Area tools">
                <button
                  aria-label="Brush"
                  className={`claim-tool-button ${claimTool === "brush" ? "is-active" : ""}`}
                  onClick={() => handleClaimToolChange("brush")}
                  title="Brush"
                  type="button"
                >
                  <BrushToolIcon />
                </button>
                <button
                  aria-label="Rectangle"
                  className={`claim-tool-button ${claimTool === "rectangle" ? "is-active" : ""}`}
                  onClick={() => handleClaimToolChange("rectangle")}
                  title="Rectangle"
                  type="button"
                >
                  <RectangleToolIcon />
                </button>
                <button
                  aria-label="Overlay"
                  className={`claim-tool-button ${claimTool === "overlay" ? "is-active" : ""}`}
                  disabled={claimAreaMode !== "new"}
                  onClick={() => handleClaimToolChange("overlay")}
                  title={claimAreaMode !== "new" ? "Overlay creates a new Claim Area." : "Upload an image overlay"}
                  type="button"
                >
                  <OverlayToolIcon />
                </button>
                {rectanglePlacementBusy ? (
                  <span className="tool-status-pill">Checking</span>
                ) : rectangleAnchor ? (
                  <span className="tool-status-pill">{rectangleAnchor.x} : {rectangleAnchor.y}</span>
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
                    aria-label="Brush"
                    className={`claim-tool-button paint-tool-button ${paintTool === "brush" ? "is-active" : ""}`}
                    onClick={() => handlePaintToolChange("brush")}
                    title="Brush"
                    type="button"
                  >
                    <BrushToolIcon />
                  </button>
                  <button
                    aria-label="Erase staged pixels"
                    className={`claim-tool-button paint-tool-button ${paintTool === "eraser" ? "is-active" : ""}`}
                    onClick={() => handlePaintToolChange("eraser")}
                    title="Only removes locally staged Color Pixels. It does not submit transparent pixels."
                    type="button"
                  >
                    <EraserToolIcon />
                  </button>
                  <button
                    aria-label="Pick color"
                    className={`claim-tool-button paint-tool-button ${paintTool === "picker" ? "is-active" : ""}`}
                    onClick={() => handlePaintToolChange("picker")}
                    title="Pick the exact color from the canvas or overlay. Middle-click triggers the picker too."
                    type="button"
                  >
                    <PickerToolIcon />
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
              <button
                className="google-button pixel-place-button"
                disabled={placementBusy || activePendingCount === 0}
                onClick={() => void handlePlacementAction()}
                title={placementHelpText}
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
              pendingClaimOutlinePaths={pendingClaimOutlinePaths}
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
            className="modal-window areas-modal"
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
                  <div>
                    <span>
                      {ownedAreasLoading
                        ? "Loading..."
                        : currentUser
                          ? `${ownedActiveAreas.length} / ${currentUser.claim_area_limit} active area slot${currentUser.claim_area_limit === 1 ? "" : "s"} used`
                          : `${ownedAreas.length} area${ownedAreas.length === 1 ? "" : "s"}`}
                    </span>
                    <strong>{visibleOwnedAreaCount} shown</strong>
                  </div>
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
                <div className="owned-area-controls">
                  <input
                    aria-label="Search areas"
                    className="account-input owned-area-search"
                    onChange={(event) => setOwnedAreaSearch(event.target.value)}
                    placeholder="Search name, ID, owner"
                    type="search"
                    value={ownedAreaSearch}
                  />
                  <div className="owned-area-filter-row" aria-label="Area filters">
                    {ownedAreaFilterOptions.map((option) => (
                      <button
                        className={`owned-area-filter-button ${ownedAreaFilter === option.value ? "is-active" : ""}`}
                        key={option.value}
                        onClick={() => setOwnedAreaFilter(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                {!ownedAreasLoading && ownedAreas.length === 0 ? (
                  <p className="account-helper">No claim areas found.</p>
                ) : null}
                {!ownedAreasLoading && ownedAreas.length > 0 && visibleOwnedAreaCount === 0 ? (
                  <p className="account-helper">No areas match this search.</p>
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
                            : `Contributor to ${formatPlayerNameWithId(area.owner.display_name, area.owner.public_id)}`;

                          return (
                            <article className="owned-area-item" key={`${section.key}-${area.id}`}>
                              <ClaimAreaMiniPreview area={area} visualTileRevisions={visualTileRevisions} />
                              <div className="owned-area-main">
                                <div className="owned-area-title-row">
                                  <strong>{area.name}</strong>
                                  <span className={`area-role-tag ${area.viewer_can_edit ? "is-owner" : "is-admin"}`}>
                                    {areaRole}
                                  </span>
                                </div>
                                <span>
                                  {formatCount(area.claimed_pixels_count)} claims - {paintedRatio}% painted
                                </span>
                                <small>{getClaimAreaStatusLabel(area.status)} - {formatClaimAreaId(area.public_id)}</small>
                                {area.description ? <small>{area.description}</small> : null}
                                <small>
                                  {area.bounds.min_x}:{area.bounds.min_y} to {area.bounds.max_x}:{area.bounds.max_y}
                                </small>
                              </div>
                              <div className="owned-area-meta">
                                <small>{area.bounds.width} x {area.bounds.height}</small>
                                <small>{formatDateTime(area.last_activity_at)}</small>
                              </div>
                              <div className="owned-area-actions">
                                <button
                                  className="google-button owned-area-jump"
                                  onClick={() => focusClaimArea(area)}
                                  type="button"
                                >
                                  Jump
                                </button>
                                <button
                                  className="pixel-clear-button owned-area-action-button"
                                  onClick={() => {
                                    applyAreaSelection(cacheClaimAreaPreview(area));
                                    setInspectedPixel({
                                      x: Math.floor(area.bounds.center_x),
                                      y: Math.floor(area.bounds.center_y),
                                    });
                                    setInspectedPixelRecord(null);
                                    setAreaPanelBusy(false);
                                    setActiveModal(null);
                                  }}
                                  type="button"
                                >
                                  Info
                                </button>
                                <button
                                  className="area-options-button owned-area-options-button"
                                  onClick={(event) => openAreaOptionsMenu(event, area.public_id, "areas-list", area.viewer_can_edit)}
                                  aria-label={`Open options for ${area.name}`}
                                  title="More options"
                                  type="button"
                                >
                                  <MoreHorizontalIcon />
                                </button>
                              </div>
                              {ownedAreaEditId === area.id ? (
                                <div className="owned-area-inline-panel">
                                  <div className="area-field-stack">
                                    <label className="account-label" htmlFor={`owned-area-name-${area.id}`}>Name</label>
                                    <input
                                      aria-describedby={`owned-area-name-limit-${area.id}`}
                                      aria-invalid={ownedAreaEditName.length > AREA_NAME_MAX_LENGTH}
                                      className="account-input area-input"
                                      id={`owned-area-name-${area.id}`}
                                      onChange={(event) => setOwnedAreaEditName(event.target.value)}
                                      value={ownedAreaEditName}
                                    />
                                    <span
                                      className={`area-field-limit ${ownedAreaEditName.length > AREA_NAME_MAX_LENGTH ? "is-error" : ""}`}
                                      id={`owned-area-name-limit-${area.id}`}
                                    >
                                      {ownedAreaEditName.length} / {AREA_NAME_MAX_LENGTH}
                                    </span>
                                  </div>
                                  <div className="area-field-stack">
                                    <label className="account-label" htmlFor={`owned-area-description-${area.id}`}>Description</label>
                                    <textarea
                                      aria-describedby={`owned-area-description-limit-${area.id}`}
                                      aria-invalid={ownedAreaEditDescription.length > AREA_DESCRIPTION_MAX_LENGTH}
                                      className="account-input area-textarea"
                                      id={`owned-area-description-${area.id}`}
                                      onChange={(event) => setOwnedAreaEditDescription(event.target.value)}
                                      value={ownedAreaEditDescription}
                                    />
                                    <span
                                      className={`area-field-limit ${ownedAreaEditDescription.length > AREA_DESCRIPTION_MAX_LENGTH ? "is-error" : ""}`}
                                      id={`owned-area-description-limit-${area.id}`}
                                    >
                                      {ownedAreaEditDescription.length} / {AREA_DESCRIPTION_MAX_LENGTH}
                                    </span>
                                  </div>
                                  <div className="area-inline-actions">
                                    <button
                                      className="google-button area-action-button"
                                      disabled={ownedAreaActionBusy !== null}
                                      onClick={() => void handleOwnedAreaSave(area)}
                                      type="button"
                                    >
                                      {ownedAreaActionBusy === `edit:${area.id}` ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      className="pixel-clear-button"
                                      disabled={ownedAreaActionBusy !== null}
                                      onClick={closeOwnedAreaInlineTools}
                                      type="button"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                              {ownedAreaInviteId === area.id ? (
                                <div className="owned-area-inline-panel is-invite">
                                  <label className="account-label" htmlFor={`owned-area-invite-${area.id}`}>Player public number</label>
                                  <div className="area-invite-row">
                                    <input
                                      className="account-input area-input"
                                      id={`owned-area-invite-${area.id}`}
                                      inputMode="numeric"
                                      onChange={(event) => setOwnedAreaInvitePublicId(event.target.value)}
                                      placeholder="#123"
                                      value={ownedAreaInvitePublicId}
                                    />
                                    <button
                                      aria-label="Invite player"
                                      className="area-add-player-button"
                                      disabled={ownedAreaActionBusy !== null}
                                      onClick={() => void handleOwnedAreaInvite(area)}
                                      title="Invite player"
                                      type="button"
                                    >
                                      +
                                    </button>
                                  </div>
                                  <button
                                    className="pixel-clear-button"
                                    disabled={ownedAreaActionBusy !== null}
                                    onClick={closeOwnedAreaInlineTools}
                                    type="button"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : null}
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

      {activeModal === "login" && !currentUser ? (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} role="presentation">
          <section
            aria-labelledby="login-title"
            className="modal-window login-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">Account</p>
                <h2 id="login-title">Continue with Google</h2>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} type="button">
                Close
              </button>
            </div>
            <div className="modal-scroll-area">
              <div className="modal-card">
                <p>Google OAuth creates the player account and keeps sessions cookie-based.</p>
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
                <h2 id="shop-title">Pixel shop</h2>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} type="button">
                Close
              </button>
            </div>
            <div className="modal-scroll-area">
              {currentUser ? (
                <div className="shop-content">
                  <div className="shop-balance">
                    <span>Coins</span>
                    <strong>{formatCount(currentUser.coins)}</strong>
                  </div>
                  {shopMessage ? (
                    <p className={`account-feedback is-${shopMessage.tone}`}>{shopMessage.text}</p>
                  ) : null}
                  <div className="shop-perk-list">
                    {shopItems.map((item) => {
                      const quantity = getShopQuantity(item.id);
                      const totalCost = item.cost * quantity;
                      const canBuy = quantity > 0 && shopBusyItem === null && currentUser.coins >= totalCost;

                      return (
                        <article className="shop-perk" key={item.id}>
                          <div className="shop-item-artwork" aria-hidden="true">
                            {item.artwork}
                          </div>
                          <div className="shop-perk-copy">
                            <span className="account-stat-label">{item.id === "pixel_pack_50" ? "Pack" : "Upgrade"}</span>
                            <h3>{item.title}</h3>
                            <p>{item.detail}</p>
                          </div>
                          <div className="shop-perk-actions">
                            <label className="shop-quantity-label">
                              <span>Qty</span>
                              <input
                                aria-label={`${item.title} quantity`}
                                className="shop-quantity-input"
                                inputMode="numeric"
                                maxLength={3}
                                onBlur={() => handleShopQuantityBlur(item.id)}
                                onChange={(event) => handleShopQuantityChange(item.id, event.target.value)}
                                onKeyDown={(event) => {
                                  if ([",", ".", "e", "E", "+", "-"].includes(event.key)) {
                                    event.preventDefault();
                                  }
                                }}
                                pattern="[0-9]*"
                                type="text"
                                value={shopQuantities[item.id]}
                              />
                            </label>
                            <span className="shop-price">{formatCount(totalCost)} Coins</span>
                            <button
                              className="google-button"
                              disabled={!canBuy}
                              onClick={() => void handleShopPurchase(item.id)}
                              type="button"
                            >
                              {shopBusyItem === item.id ? "Buying..." : "Buy"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="modal-card">
                  <p>Login required.</p>
                </div>
              )}
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
              <>
                <button
                  className="area-context-menu-item"
                  onClick={() => {
                    if (areaOptionsMenu.messageTarget === "areas-list") {
                      const listArea = ownedAreas.find((area) => area.public_id === areaOptionsMenu.publicId);

                      if (listArea !== undefined) {
                        startOwnedAreaEdit(listArea);
                      }
                    } else {
                      setAreaEditorOpen(true);
                    }
                    setAreaOptionsMenu(null);
                  }}
                  role="menuitem"
                  type="button"
                >
                  Edit name / description
                </button>
                <button
                  className="area-context-menu-item"
                  onClick={() => {
                    if (areaOptionsMenu.messageTarget === "areas-list") {
                      const listArea = ownedAreas.find((area) => area.public_id === areaOptionsMenu.publicId);

                      if (listArea !== undefined) {
                        startOwnedAreaInvite(listArea);
                      }
                    } else {
                      setAreaEditorOpen(false);
                      setAreaMessage({
                        tone: "info",
                        text: "Use the player number field in Area access to add someone.",
                      });
                    }
                    setAreaOptionsMenu(null);
                  }}
                  role="menuitem"
                  type="button"
                >
                  Add player
                </button>
              </>
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
              <strong>{formatPlayerNameWithId(areaPlayerOptionsMenu.displayName, areaPlayerOptionsMenu.publicId)}</strong>
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
