"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorldOverview } from "@/lib/api";
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

function clampZoom(value: number, minZoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(minZoom, Number(value.toFixed(4))));
}

function snapScreen(value: number): number {
  return Math.round(value);
}

function modalButtonClass(isActive: boolean): string {
  return isActive ? "hud-toggle is-active" : "hud-toggle";
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
  const [activeModal, setActiveModal] = useState<"info" | "login" | null>(null);
  const [pointer, setPointer] = useState<PointerPosition>({ x: 0, y: 0, inside: false });
  const [selectedPixel, setSelectedPixel] = useState<PixelCoordinate | null>(null);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [isCentered, setIsCentered] = useState(false);

  useEffect(() => {
    document.body.dataset.theme = darkMode ? "dark" : "light";

    return () => {
      delete document.body.dataset.theme;
    };
  }, [darkMode]);

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
        <button className="hud-login-button" onClick={() => setActiveModal("login")} type="button">
          Login
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
                <h2 id="login-title">Login will start with Google</h2>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} type="button">
                Close
              </button>
            </div>

            <div className="modal-card">
              <p>
                This entry point is reserved for Google OAuth. Once the auth module is implemented,
                players will be able to sign in here and continue straight back into the canvas.
              </p>
              <button className="google-button" disabled type="button">
                Continue with Google
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
