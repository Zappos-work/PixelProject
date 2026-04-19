"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { WorldChunk, WorldOverview } from "@/lib/api";

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

const TILE_SIZE = 172;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.14;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function buildPattern(chunk: WorldChunk): number[] {
  return Array.from({ length: 25 }, (_, index) => {
    return Math.abs(chunk.chunk_x * 17 + chunk.chunk_y * 19 + index * 11) % 5;
  });
}

function buttonClass(isActive: boolean): string {
  return isActive ? "hud-toggle is-active" : "hud-toggle";
}

export function WorldStage({ world }: WorldStageProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [activeModal, setActiveModal] = useState<"info" | "login" | null>(null);
  const [pointer, setPointer] = useState<PointerPosition>({ x: 0, y: 0, inside: false });
  const dragState = useRef<DragState | null>(null);

  useEffect(() => {
    document.body.dataset.theme = darkMode ? "dark" : "light";
    return () => {
      delete document.body.dataset.theme;
    };
  }, [darkMode]);

  const scene = useMemo(() => {
    const columns = world.bounds.max_chunk_x - world.bounds.min_chunk_x + 1;
    const rows = world.bounds.max_chunk_y - world.bounds.min_chunk_y + 1;
    const stageWidth = columns * TILE_SIZE;
    const stageHeight = rows * TILE_SIZE;

    const chunkLayout = world.chunks.map((chunk) => ({
      ...chunk,
      left: (chunk.chunk_x - world.bounds.min_chunk_x) * TILE_SIZE,
      top: (world.bounds.max_chunk_y - chunk.chunk_y) * TILE_SIZE,
      pattern: buildPattern(chunk),
    }));

    const landmarkLayout = world.landmarks.map((landmark) => ({
      ...landmark,
      left: (landmark.chunk_x - world.bounds.min_chunk_x + landmark.offset_x) * TILE_SIZE,
      top: (world.bounds.max_chunk_y - landmark.chunk_y + landmark.offset_y) * TILE_SIZE,
    }));

    return {
      stageWidth,
      stageHeight,
      chunkLayout,
      landmarkLayout,
      originLeft: (0 - world.bounds.min_chunk_x) * TILE_SIZE,
      originTop: (world.bounds.max_chunk_y - 0) * TILE_SIZE,
    };
  }, [world]);

  function adjustZoom(nextZoom: number): void {
    setZoom(clampZoom(nextZoom));
  }

  function updatePointer(event: React.PointerEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      inside: true,
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    updatePointer(event);
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    updatePointer(event);

    if (dragState.current?.pointerId !== event.pointerId) {
      return;
    }

    setOffset({
      x: dragState.current.originX + event.clientX - dragState.current.startX,
      y: dragState.current.originY + event.clientY - dragState.current.startY,
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointerLeave(): void {
    setPointer((current) => ({ ...current, inside: false }));
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    const direction = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    adjustZoom(zoom + direction);
  }

  return (
    <main className={`world-shell ${darkMode ? "theme-dark" : "theme-light"}`}>
      <div className="world-hud world-hud-left">
        <button
          aria-label="Open information"
          className="hud-icon-button"
          onClick={() => setActiveModal("info")}
          type="button"
        >
          I
        </button>
      </div>

      <div className="world-hud world-hud-right">
        <button className="hud-login-button" onClick={() => setActiveModal("login")} type="button">
          Login
        </button>
      </div>

      <div className="world-hud world-hud-bottom">
        <button
          aria-label="Toggle grid"
          className={buttonClass(showGrid)}
          onClick={() => setShowGrid((current) => !current)}
          type="button"
        >
          Grid
        </button>
        <button
          aria-label="Toggle dark mode"
          className={buttonClass(darkMode)}
          onClick={() => setDarkMode((current) => !current)}
          type="button"
        >
          {darkMode ? "Light" : "Dark"}
        </button>
      </div>

      <div
        className={`world-viewport immersive ${showGrid ? "grid-visible" : "grid-hidden"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      >
        <div className="world-backdrop-glow" aria-hidden="true" />
        <div
          className="world-stage-positioner"
          style={{
            width: `${scene.stageWidth}px`,
            height: `${scene.stageHeight}px`,
            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
          }}
        >
          <div
            className="world-stage"
            style={{
              width: `${scene.stageWidth}px`,
              height: `${scene.stageHeight}px`,
              transform: `scale(${zoom})`,
            }}
          >
            <div className="world-grid-layer" aria-hidden="true" />
            <div
              className="world-axis world-axis-horizontal"
              style={{ top: `${scene.originTop}px` }}
            />
            <div
              className="world-axis world-axis-vertical"
              style={{ left: `${scene.originLeft}px` }}
            />

            {scene.chunkLayout.map((chunk) => (
              <article
                className={`world-chunk world-chunk-${chunk.role}`}
                key={chunk.id}
                style={{
                  left: `${chunk.left}px`,
                  top: `${chunk.top}px`,
                  width: `${TILE_SIZE}px`,
                  height: `${TILE_SIZE}px`,
                }}
              >
                <div className="world-chunk-pattern" aria-hidden="true">
                  {chunk.pattern.map((tone, index) => (
                    <span className={`world-pixel tone-${tone}`} key={`${chunk.id}-${index}`} />
                  ))}
                </div>
              </article>
            ))}

            {scene.landmarkLayout.map((landmark) => (
              <div
                className="world-landmark"
                key={landmark.id}
                style={{
                  left: `${landmark.left}px`,
                  top: `${landmark.top}px`,
                }}
              >
                <span className={`world-landmark-dot tone-${landmark.tone}`} />
              </div>
            ))}

            <div
              className="world-origin-marker"
              style={{
                left: `${scene.originLeft}px`,
                top: `${scene.originTop}px`,
              }}
            >
              <span>0:0</span>
            </div>
          </div>
        </div>

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
                <p>The local foundation is live, the starter world is visible, and the next step is the first claim flow.</p>
              </article>
              <article className="modal-card">
                <h3>Rules</h3>
                <p>Canvas interaction rules, claim restrictions and moderation details will live here once the gameplay systems are implemented.</p>
              </article>
              <article className="modal-card">
                <h3>Terms of Service</h3>
                <p>Legal terms, privacy information and account policies are intentionally moved out of the landing screen and will be maintained here.</p>
              </article>
              <article className="modal-card">
                <h3>World status</h3>
                <p>The current seeded map spans from chunk -1:-1 to 1:1 around the origin, with a dark first-view mode to keep the empty canvas easier on the eyes.</p>
              </article>
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
                <h2 id="login-title">Login will start with Google</h2>
              </div>
              <button className="modal-close" onClick={() => setActiveModal(null)} type="button">
                Close
              </button>
            </div>

            <div className="modal-card">
              <p>
                The visual login entry is already reserved here. As soon as the auth module is built,
                this modal will connect to Google OAuth and create the player account automatically.
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
