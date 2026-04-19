"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchAuthSession,
  getClientApiBaseUrl,
  logoutAuthSession,
  updateDisplayName,
  type AuthSessionStatus,
  type WorldOverview,
} from "@/lib/api";
import { APP_VERSION } from "@/lib/app-version";

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

export function WorldStage({ world }: WorldStageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const [camera, setCamera] = useState<CameraState>({
    x: 0,
    y: 0,
    zoom: DEFAULT_ZOOM,
  });
  const [showGrid, setShowGrid] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [activeModal, setActiveModal] = useState<"info" | "login" | "shop" | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthSessionStatus>(FALLBACK_AUTH_STATUS);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<ProfileMessage | null>(null);
  const [pointer, setPointer] = useState<PointerPosition>({ x: 0, y: 0, inside: false });
  const [selectedPixel, setSelectedPixel] = useState<PixelCoordinate | null>(null);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [isCentered, setIsCentered] = useState(false);

  const refreshAuthStatus = useCallback(async (): Promise<void> => {
    setAuthLoading(true);
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
    setProfileName(authStatus.user?.display_name ?? "");
    setProfileMessage(null);
  }, [authStatus.user?.display_name]);

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

  const hasDisplayNameChange = useMemo(() => {
    if (!authStatus.user) {
      return false;
    }

    return normalizedProfileName.length > 0 && normalizedProfileName !== authStatus.user.display_name;
  }, [authStatus.user, normalizedProfileName]);

  const nameChangeHint = useMemo(() => {
    if (!authStatus.user) {
      return "";
    }

    if (authStatus.user.can_change_display_name) {
      return "You can change your display name now. After a successful update, the next rename unlocks in 30 days.";
    }

    if (authStatus.user.next_display_name_change_at) {
      return `Next display name change: ${new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(authStatus.user.next_display_name_change_at))}`;
    }

    return "Display name changes are temporarily unavailable.";
  }, [authStatus.user]);

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
    await refreshAuthStatus();
    setAuthBusy(false);
  }

  async function handleDisplayNameSave(): Promise<void> {
    if (!authStatus.user) {
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
      text: "Display name updated successfully.",
    });
    setProfileBusy(false);
  }

  const accountButtonLabel = authStatus.user
    ? `${authStatus.user.display_name} #${authStatus.user.public_id}`
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
        {authStatus.authenticated && authStatus.user ? (
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

      {authStatus.authenticated && authStatus.user ? (
        <div className="world-hud world-hud-bottom-center">
          <div className="holder-panel">
            <span className="holder-label">Holders</span>
            <span className="holder-value">
              {authStatus.user.holders} / {authStatus.user.holder_limit}
            </span>
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
                  while project information stays inside modal windows.
                </p>
              </article>
              <article className="modal-card">
                <h3>Rules</h3>
                <p>
                  Claim rules, moderation rules and painting restrictions will appear here once the
                  gameplay layer is connected to the live canvas.
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

            {authStatus.authenticated && authStatus.user ? (
              <div className="modal-card account-card">
                <div className="account-header">
                  {authStatus.user.avatar_url ? (
                    <Image
                      alt={authStatus.user.display_name}
                      className="account-avatar"
                      height={72}
                      referrerPolicy="no-referrer"
                      src={authStatus.user.avatar_url}
                      width={72}
                    />
                  ) : (
                    <div className="account-avatar account-avatar-fallback" aria-hidden="true">
                      <DefaultAvatarIcon />
                    </div>
                  )}
                  <div className="account-details">
                    <h3>{authStatus.user.display_name}</h3>
                    <p className="account-tag">#{authStatus.user.public_id}</p>
                    <p>
                      Holders: {authStatus.user.holders} / {authStatus.user.holder_limit}
                    </p>
                    <p>Default avatar active. Custom avatar settings can follow later.</p>
                  </div>
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
                    className="google-button"
                    disabled={
                      authBusy ||
                      profileBusy ||
                      !authStatus.user.can_change_display_name ||
                      !hasDisplayNameChange
                    }
                    onClick={() => void handleDisplayNameSave()}
                    type="button"
                  >
                    {profileBusy ? "Saving..." : "Save display name"}
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
                  Google OAuth is now the account entry point for PixelProject. The first successful
                  login automatically creates the player account and returns to the canvas with an
                  active session.
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
