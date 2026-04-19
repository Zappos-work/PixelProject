"use client";

import { useMemo, useRef, useState } from "react";

import type { WorldChunk, WorldLandmark, WorldOverview } from "@/lib/api";

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

const TILE_SIZE = 172;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.14;

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function buildPattern(chunk: WorldChunk): number[] {
  return Array.from({ length: 16 }, (_, index) => {
    return Math.abs(chunk.chunk_x * 11 + chunk.chunk_y * 7 + index * 13) % 5;
  });
}

function toneLabel(landmark: WorldLandmark): string {
  return `${landmark.name} (${landmark.kind})`;
}

export function WorldStage({ world }: WorldStageProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<DragState | null>(null);

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
      left:
        (landmark.chunk_x - world.bounds.min_chunk_x + landmark.offset_x) * TILE_SIZE,
      top:
        (world.bounds.max_chunk_y - landmark.chunk_y + landmark.offset_y) * TILE_SIZE,
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

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
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
    if (dragState.current?.pointerId !== event.pointerId) {
      return;
    }

    setOffset({
      x: dragState.current.originX + event.clientX - dragState.current.startX,
      y: dragState.current.originY + event.clientY - dragState.current.startY,
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (dragState.current?.pointerId !== event.pointerId) {
      return;
    }

    dragState.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    const direction = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    adjustZoom(zoom + direction);
  }

  return (
    <section className="panel world-panel">
      <div className="panel-header">
        <p className="eyebrow">World Preview</p>
        <h2>Starter world around the 0:0 origin</h2>
      </div>

      <div className="world-toolbar">
        <div className="world-chip">
          <span>Loaded chunks</span>
          <strong>{world.chunk_count}</strong>
        </div>
        <div className="world-chip">
          <span>Visible span</span>
          <strong>
            {world.bounds.min_world_x} to {world.bounds.max_world_x}
          </strong>
        </div>
        <div className="world-controls">
          <button type="button" onClick={() => adjustZoom(zoom - ZOOM_STEP)}>
            Zoom out
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => adjustZoom(zoom + ZOOM_STEP)}>
            Zoom in
          </button>
          <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>
            Reset
          </button>
        </div>
      </div>

      <div
        className="world-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
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
                <div className="world-chunk-copy">
                  <p>{chunk.chunk_x}:{chunk.chunk_y}</p>
                  <h3>{chunk.label}</h3>
                  <span>{chunk.role}</span>
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
                <div className="world-landmark-copy">
                  <strong>{landmark.name}</strong>
                  <span>{landmark.kind}</span>
                </div>
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
      </div>

      <div className="world-stage-footer">
        <p>
          Drag the world to explore the seeded starter ring. Mouse wheel zoom is already wired in
          so this can evolve naturally into the real chunk viewer later.
        </p>
        <div className="world-landmark-list">
          {world.landmarks.map((landmark) => (
            <article className="world-landmark-card" key={landmark.id}>
              <div className="world-landmark-card-header">
                <span className={`world-landmark-dot tone-${landmark.tone}`} />
                <strong>{toneLabel(landmark)}</strong>
              </div>
              <p>{landmark.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

