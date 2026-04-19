"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  claimWorldPixel,
  fetchAuthSession,
  fetchVisibleWorldPixels,
  getClientApiBaseUrl,
  logoutAuthSession,
  paintWorldPixel,
  updateDisplayName,
  uploadAvatar,
  type AuthUser,
  type AuthSessionStatus,
  type WorldOverview,
  type WorldPixel,
} from "@/lib/api";
import { APP_CHANGELOG } from "@/lib/app-changelog";
import { APP_VERSION } from "@/lib/app-version";
import { DEFAULT_COLOR_ID, PIXEL_PALETTE } from "@/lib/pixel-palette";

type WorldStageProps = {
  world: WorldOverview;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

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

type GridLine = {
  key: string;
  position: number;
  major: boolean;
};

type PixelCoordinate = {
  x: number;
  y: number;
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
const HOLDER_TICK_MS = 250;
const PIXEL_FETCH_DEBOUNCE_MS = 120;
const PIXEL_FETCH_MARGIN = 2;

const FALLBACK_AUTH_STATUS: AuthSessionStatus = {
  authenticated: false,
  google_oauth_configured: false,
  user: null,
};

function clampZoom(value: number, minZoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(minZoom, Number(value.toFixed(4))));
}

function snapScreen(value: number): number {
  return Math.round(value);
}

function modalButtonClass(isActive: boolean): string {
  return isActive ? "hud-toggle is-active" : "hud-toggle";
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

export function WorldStage({ world }: WorldStageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const namePromptShownRef = useRef(false);
  const [camera, setCamera] = useState<CameraState>({
    x: 0,
    y: 0,
    zoom: DEFAULT_ZOOM,
  });
  const [showGrid, setShowGrid] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [activeModal, setActiveModal] = useState<"info" | "login" | "shop" | "avatar" | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthSessionStatus>(FALLBACK_AUTH_STATUS);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<ProfileMessage | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<ProfileMessage | null>(null);
  const [pointer, setPointer] = useState<PointerPosition>({ x: 0, y: 0, inside: false });
  const [selectedPixel, setSelectedPixel] = useState<PixelCoordinate | null>(null);
  const [selectedColorId, setSelectedColorId] = useState(DEFAULT_COLOR_ID);
  const [placementBusy, setPlacementBusy] = useState(false);
  const [placementMessage, setPlacementMessage] = useState<ProfileMessage | null>(null);
  const [visiblePixels, setVisiblePixels] = useState<WorldPixel[]>([]);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [isCentered, setIsCentered] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const refreshAuthStatus = useCallback(async (showLoading = true): Promise<void> => {
    if (showLoading) {
      setAuthLoading(true);
    }

    const nextStatus = await fetchAuthSession();
    setAuthStatus(nextStatus);
    setAuthLoading(false);
  }, []);

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
    const ticker = window.setInterval(() => {
      setNowMs(Date.now());
    }, HOLDER_TICK_MS);

    return () => {
      window.clearInterval(ticker);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (viewport === null) {
      return;
    }

    const syncSize = (): void => {
      const rect = viewport.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
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

  const activeWorldBounds = useMemo<ActiveWorldBounds>(() => {
    const activeChunks = world.chunks.filter((chunk) => chunk.is_active);

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
  }, [world.bounds.max_world_x, world.bounds.max_world_y, world.bounds.min_world_x, world.bounds.min_world_y, world.chunks]);

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

  const hoverPixel = useMemo(() => {
    if (!pointer.inside) {
      return null;
    }

    return screenToWorldPixel(pointer.x, pointer.y);
  }, [pointer.inside, pointer.x, pointer.y, screenToWorldPixel]);

  const normalizedProfileName = useMemo(() => {
    return profileName.trim().replace(/\s+/g, " ");
  }, [profileName]);

  const currentUser = authStatus.user;
  const projectedHolderState = useMemo(() => getProjectedHolderState(currentUser, nowMs), [currentUser, nowMs]);
  const displayedHolders = currentUser ? projectedHolderState.displayedHolders : 0;

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
      return "Choose your permanent display name now. After the first save, the next rename unlocks in 30 days.";
    }

    if (currentUser.can_change_display_name) {
      return "You can change your display name now. After a successful update, the next rename unlocks in 30 days.";
    }

    if (currentUser.next_display_name_change_at) {
      return `Next display name change: ${new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(currentUser.next_display_name_change_at))}`;
    }

    return "Display name changes are temporarily unavailable.";
  }, [currentUser]);

  const holderStatus = projectedHolderState.statusText;

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
    const activeChunks = world.chunks.filter((chunk) => chunk.is_active);
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
  }, [camera.x, camera.y, camera.zoom, world.chunks]);

  const pixelFetchBounds = useMemo(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) {
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
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    if (pixelFetchBounds === null) {
      return;
    }

    let cancelled = false;
    const fetchTimeout = window.setTimeout(async () => {
      const result = await fetchVisibleWorldPixels(
        pixelFetchBounds.minX,
        pixelFetchBounds.maxX,
        pixelFetchBounds.minY,
        pixelFetchBounds.maxY,
      );

      if (!cancelled) {
        setVisiblePixels(result.pixels);
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

  const selectedPixelRecord = useMemo(() => {
    if (selectedPixel === null) {
      return null;
    }

    return pixelIndex.get(`${selectedPixel.x}:${selectedPixel.y}`) ?? null;
  }, [pixelIndex, selectedPixel]);

  useEffect(() => {
    if (selectedPixelRecord?.color_id !== null && selectedPixelRecord?.color_id !== undefined) {
      setSelectedColorId(selectedPixelRecord.color_id);
    }
  }, [selectedPixelRecord]);

  const renderedClaims = useMemo(() => {
    return visiblePixels.map((pixel) => ({
      key: `${pixel.id}-claim`,
      left: camera.x + pixel.x * camera.zoom,
      top: camera.y + pixel.y * camera.zoom,
      width: camera.zoom,
      height: camera.zoom,
      tone: pixel.is_starter
        ? "is-starter"
        : pixel.owner_user_id === currentUser?.id
          ? "is-owned"
          : "is-foreign",
      isSelected: selectedPixel?.x === pixel.x && selectedPixel?.y === pixel.y,
    }));
  }, [camera.x, camera.y, camera.zoom, currentUser?.id, selectedPixel, visiblePixels]);

  const renderedPixels = useMemo(() => {
    return visiblePixels
      .filter((pixel) => pixel.color_id !== null)
      .map((pixel) => ({
        key: pixel.id,
        left: camera.x + pixel.x * camera.zoom,
        top: camera.y + pixel.y * camera.zoom,
        width: camera.zoom,
        height: camera.zoom,
        color: PIXEL_PALETTE[pixel.color_id ?? DEFAULT_COLOR_ID]?.hex ?? "#ffffff",
        isSelected: selectedPixel?.x === pixel.x && selectedPixel?.y === pixel.y,
      }));
  }, [camera.x, camera.y, camera.zoom, selectedPixel, visiblePixels]);

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

  const isSelectedInsideWorld = useMemo(() => {
    if (selectedPixel === null) {
      return false;
    }

    return (
      selectedPixel.x >= activeWorldBounds.minX &&
      selectedPixel.x < activeWorldBounds.maxX &&
      selectedPixel.y >= activeWorldBounds.minY &&
      selectedPixel.y < activeWorldBounds.maxY
    );
  }, [activeWorldBounds.maxX, activeWorldBounds.maxY, activeWorldBounds.minX, activeWorldBounds.minY, selectedPixel]);

  const canClaimSelectedPixel = useMemo(() => {
    if (
      selectedPixel === null ||
      currentUser === null ||
      camera.zoom < GRID_THRESHOLD ||
      !isSelectedInsideWorld ||
      selectedPixelRecord !== null
    ) {
      return false;
    }

    const neighborKeys = [
      `${selectedPixel.x - 1}:${selectedPixel.y}`,
      `${selectedPixel.x + 1}:${selectedPixel.y}`,
      `${selectedPixel.x}:${selectedPixel.y - 1}`,
      `${selectedPixel.x}:${selectedPixel.y + 1}`,
    ];

    return neighborKeys.some((key) => {
      const neighbor = pixelIndex.get(key);
      return neighbor ? neighbor.is_starter || neighbor.owner_user_id !== null : false;
    });
  }, [camera.zoom, currentUser, isSelectedInsideWorld, pixelIndex, selectedPixel, selectedPixelRecord]);

  const canPaintSelectedPixel = useMemo(() => {
    if (selectedPixel === null || currentUser === null || camera.zoom < GRID_THRESHOLD || !isSelectedInsideWorld) {
      return false;
    }

    return (
      selectedPixelRecord !== null &&
      !selectedPixelRecord.is_starter &&
      selectedPixelRecord.owner_user_id === currentUser.id
    );
  }, [camera.zoom, currentUser, isSelectedInsideWorld, selectedPixel, selectedPixelRecord]);

  const placementLabel = useMemo(() => {
    if (currentUser === null) {
      return "Login required";
    }

    if (selectedPixelRecord === null) {
      return canClaimSelectedPixel ? "Claim pixel" : "Claim unavailable";
    }

    if (selectedPixelRecord.is_starter) {
      return "Starter frontier";
    }

    if (selectedPixelRecord.owner_user_id === currentUser.id) {
      return selectedPixelRecord.color_id === null ? "Paint my claim" : "Recolor my claim";
    }

    return "Claimed by another player";
  }, [canClaimSelectedPixel, currentUser, selectedPixelRecord]);

  const placementHelpText = useMemo(() => {
    if (currentUser === null) {
      return "Login required to claim territory and paint inside it.";
    }

    if (selectedPixelRecord === null) {
      return canClaimSelectedPixel
        ? "Claiming costs 1 Holder. New claims must touch the starter frontier or another claimed pixel."
        : "This cell is not claimable yet. Claims must touch the starter frontier or an existing claimed pixel.";
    }

    if (selectedPixelRecord.is_starter) {
      return "Starter frontier cells are reserved. Claim directly next to them to begin your own area.";
    }

    if (selectedPixelRecord.owner_user_id === currentUser.id) {
      return selectedPixelRecord.color_id === null
        ? "This claimed cell belongs to you. Pick a palette color and paint it."
        : "Only your own claimed territory can be repainted here.";
    }

    return `This territory already belongs to #${selectedPixelRecord.owner_public_id}.`;
  }, [canClaimSelectedPixel, currentUser, selectedPixelRecord]);

  function updatePointer(event: React.PointerEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      inside: true,
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }

    updatePointer(event);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: camera.x,
      originY: camera.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    updatePointer(event);

    const drag = dragState.current;

    if (drag?.pointerId !== event.pointerId) {
      return;
    }

    setCamera((current) =>
      clampCamera({
        ...current,
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      }),
    );
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
      const rect = event.currentTarget.getBoundingClientRect();
      setSelectedPixel(screenToWorldPixel(event.clientX - rect.left, event.clientY - rect.top));
      setPlacementMessage(null);
    }
  }

  function handlePointerLeave(): void {
    setPointer((current) => ({ ...current, inside: false }));
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
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

  async function handlePlacementAction(): Promise<void> {
    if (selectedPixel === null || currentUser === null) {
      return;
    }

    setPlacementBusy(true);
    setPlacementMessage(null);

    const result = canClaimSelectedPixel
      ? await claimWorldPixel(selectedPixel.x, selectedPixel.y)
      : await paintWorldPixel(selectedPixel.x, selectedPixel.y, selectedColorId);

    if (!result.ok || result.pixel === null || result.user === null) {
      setPlacementMessage({
        tone: "error",
        text: result.error ?? (canClaimSelectedPixel ? "Pixel claim failed." : "Pixel painting failed."),
      });
      setPlacementBusy(false);
      return;
    }

    const nextPixel = result.pixel;
    setVisiblePixels((current) => {
      const nextPixels = current.filter(
        (pixel) => pixel.id !== nextPixel.id && !(pixel.x === nextPixel.x && pixel.y === nextPixel.y),
      );
      nextPixels.push(nextPixel);
      return nextPixels;
    });
    setAuthStatus((current) => ({
      ...current,
      user: result.user,
    }));
    setPlacementMessage({
      tone: "success",
      text: canClaimSelectedPixel ? "Claim created successfully." : "Pixel painted successfully.",
    });
    setPlacementBusy(false);
  }

  function openMePage(): void {
    window.open("/me", "_blank", "noopener,noreferrer");
  }

  const accountButtonLabel = currentUser
    ? `${currentUser.display_name} #${currentUser.public_id}`
    : "Login";

  return (
    <main className={`world-shell ${darkMode ? "theme-dark" : "theme-light"}`}>
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
          <p className="hud-version">Version {APP_VERSION}</p>
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

      <div className="world-hud world-hud-bottom-left">
        <div className="coordinate-panel">
          <div className="coordinate-row">
            <span className="coordinate-label">Hover</span>
            <span className="coordinate-value">
              {hoverPixel === null ? "-- : --" : `${hoverPixel.x} : ${hoverPixel.y}`}
            </span>
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

      {currentUser ? (
        <div className="world-hud world-hud-bottom-center">
          <div className="holder-panel">
            <span className="holder-label">Holders</span>
            <span className="holder-value">
              {displayedHolders} / {currentUser.holder_limit}
            </span>
            <span className="holder-subtext">{holderStatus}</span>
          </div>
        </div>
      ) : null}

      {selectedPixel ? (
        <div className="world-hud world-hud-placement">
          <div className="pixel-placement-panel">
            <div className="pixel-placement-header">
              <div>
                <span className="coordinate-label">Claim / Paint</span>
                <strong className="pixel-placement-title">
                  {selectedPixel.x} : {selectedPixel.y}
                </strong>
              </div>
              {selectedPixelRecord === null ? (
                <span className="pixel-placement-owner">Unclaimed cell</span>
              ) : selectedPixelRecord.is_starter ? (
                <span className="pixel-placement-owner">Starter frontier</span>
              ) : selectedPixelRecord.owner_user_id === currentUser?.id ? (
                <span className="pixel-placement-owner">Your claimed territory</span>
              ) : (
                <span className="pixel-placement-owner">
                  Claimed by #{selectedPixelRecord.owner_public_id}
                </span>
              )}
            </div>
            {canPaintSelectedPixel ? (
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
              <p className="pixel-placement-help">{placementHelpText}</p>
              {placementMessage ? (
                <p className={`account-feedback is-${placementMessage.tone}`}>{placementMessage.text}</p>
              ) : null}
              <button
                className="google-button pixel-place-button"
                disabled={placementBusy || !(canClaimSelectedPixel || canPaintSelectedPixel)}
                onClick={() => void handlePlacementAction()}
                type="button"
              >
                {placementBusy ? "Saving..." : placementLabel}
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
        onWheel={handleWheel}
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
          {renderedClaims.map((pixel) => (
            <span
              className={`world-claimed-pixel ${pixel.tone} ${pixel.isSelected ? "is-selected" : ""}`}
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
          {renderedPixels.map((pixel) => (
            <span
              className={`world-painted-pixel ${pixel.isSelected ? "is-selected" : ""}`}
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

        {pointer.inside ? (
          <>
            <div className="world-crosshair-line world-crosshair-horizontal" style={{ top: `${pointer.y}px` }} />
            <div className="world-crosshair-line world-crosshair-vertical" style={{ left: `${pointer.x}px` }} />
          </>
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

            <div className="modal-sections">
              <article className="modal-card">
                <h3>Announcements</h3>
                <p>
                  The landing view is now intentionally minimal: only the world viewport is visible,
                  while project information and the running changelog stay inside modal windows.
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
              <article className="modal-card changelog-card">
                <h3>Changelog</h3>
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
                      Holders: {displayedHolders} / {currentUser.holder_limit}
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
                    <strong>{holderStatus}</strong>
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
            <div className="modal-card">
              <p>
                The shop entry point now exists for signed-in players. We can fill it with holder
                upgrades, perks, cosmetics or supporter packs in the next steps.
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
