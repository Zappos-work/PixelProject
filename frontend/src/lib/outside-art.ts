import "server-only";

import { promises as fs } from "fs";
import path from "path";

import { unstable_noStore as noStore } from "next/cache";

import { OUTSIDE_ART_PATTERN_SIZE, type OutsideArtAsset } from "@/lib/outside-art-types";

const OUTSIDE_ART_DIRECTORY = path.join(process.cwd(), "public", "outside-art");
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]);
const OUTSIDE_ART_MARGIN = 32;
const OUTSIDE_ART_CANDIDATE_COUNT = 24;

type OutsideArtEntry = {
  fileName: string;
  repeatIndex: number;
};

type PositionedOutsideArtAsset = OutsideArtAsset & {
  centerX: number;
  centerY: number;
  fileName: string;
};

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function pickRange(seed: number, min: number, max: number): number {
  if (max <= min) {
    return min;
  }

  return min + (seed % (max - min + 1));
}

function getRepeatCount(assetCount: number): number {
  if (assetCount <= 6) {
    return 12;
  }

  if (assetCount <= 12) {
    return 10;
  }

  if (assetCount <= 18) {
    return 8;
  }

  if (assetCount <= 28) {
    return 4;
  }

  return 2;
}

function compareBySeed(left: string, right: string, seed: string): number {
  const delta = hashString(`${seed}:${left}`) - hashString(`${seed}:${right}`);

  if (delta !== 0) {
    return delta;
  }

  return left.localeCompare(right);
}

function getArtSizeRange(assetCount: number): { min: number; max: number } {
  if (assetCount <= 6) {
    return { min: 30, max: 72 };
  }

  if (assetCount <= 12) {
    return { min: 26, max: 58 };
  }

  if (assetCount <= 18) {
    return { min: 24, max: 52 };
  }

  return { min: 22, max: 46 };
}

function buildPlacementEntries(artFiles: string[], repeats: number): OutsideArtEntry[] {
  const entries: OutsideArtEntry[] = [];

  for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
    const roundFiles = [...artFiles].sort((left, right) => compareBySeed(left, right, `round:${repeatIndex}`));

    for (const fileName of roundFiles) {
      entries.push({ fileName, repeatIndex });
    }
  }

  return entries;
}

function getToroidalDistance(ax: number, ay: number, bx: number, by: number): number {
  const wrappedDx = Math.min(Math.abs(ax - bx), OUTSIDE_ART_PATTERN_SIZE - Math.abs(ax - bx));
  const wrappedDy = Math.min(Math.abs(ay - by), OUTSIDE_ART_PATTERN_SIZE - Math.abs(ay - by));

  return Math.hypot(wrappedDx, wrappedDy);
}

function scoreCandidate(
  candidateFileName: string,
  candidateSize: number,
  centerX: number,
  centerY: number,
  placedAssets: PositionedOutsideArtAsset[],
): number {
  if (placedAssets.length === 0) {
    return 0;
  }

  let minAnyClearance = Number.POSITIVE_INFINITY;
  let minSameFileClearance = Number.POSITIVE_INFINITY;

  for (const placedAsset of placedAssets) {
    const distance = getToroidalDistance(centerX, centerY, placedAsset.centerX, placedAsset.centerY);
    const clearance = distance - (candidateSize + placedAsset.size) * 0.58;

    if (clearance < minAnyClearance) {
      minAnyClearance = clearance;
    }

    if (placedAsset.fileName === candidateFileName && clearance < minSameFileClearance) {
      minSameFileClearance = clearance;
    }
  }

  if (!Number.isFinite(minSameFileClearance)) {
    minSameFileClearance = OUTSIDE_ART_PATTERN_SIZE / 2;
  }

  return minSameFileClearance * 2.6 + minAnyClearance;
}

function placeOutsideArtAsset(
  entry: OutsideArtEntry,
  assetCount: number,
  placedAssets: PositionedOutsideArtAsset[],
): PositionedOutsideArtAsset {
  const sizeRange = getArtSizeRange(assetCount);
  const size = pickRange(hashString(`${entry.fileName}:size:${entry.repeatIndex}`), sizeRange.min, sizeRange.max);
  const minCoordinate = OUTSIDE_ART_MARGIN;
  const maxCoordinate = OUTSIDE_ART_PATTERN_SIZE - size - OUTSIDE_ART_MARGIN;
  let bestAsset: PositionedOutsideArtAsset | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let candidateIndex = 0; candidateIndex < OUTSIDE_ART_CANDIDATE_COUNT; candidateIndex += 1) {
    const x = pickRange(hashString(`${entry.fileName}:x:${entry.repeatIndex}:${candidateIndex}`), minCoordinate, maxCoordinate);
    const y = pickRange(hashString(`${entry.fileName}:y:${entry.repeatIndex}:${candidateIndex}`), minCoordinate, maxCoordinate);
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const score =
      scoreCandidate(entry.fileName, size, centerX, centerY, placedAssets) +
      hashString(`${entry.fileName}:tie:${entry.repeatIndex}:${candidateIndex}`) / 1_000_000_000;

    if (score > bestScore) {
      bestScore = score;
      bestAsset = {
        key: `${entry.fileName}-${entry.repeatIndex}`,
        src: path.posix.join("/outside-art", entry.fileName),
        x,
        y,
        size,
        rotation: pickRange(hashString(`${entry.fileName}:rotation:${entry.repeatIndex}`), -12, 12),
        opacity: pickRange(hashString(`${entry.fileName}:opacity:${entry.repeatIndex}`), 16, 26) / 100,
        centerX,
        centerY,
        fileName: entry.fileName,
      };
    }
  }

  if (bestAsset !== null) {
    return bestAsset;
  }

  return {
    key: `${entry.fileName}-${entry.repeatIndex}`,
    src: path.posix.join("/outside-art", entry.fileName),
    x: minCoordinate,
    y: minCoordinate,
    size,
    rotation: 0,
    opacity: 0.2,
    centerX: minCoordinate + size / 2,
    centerY: minCoordinate + size / 2,
    fileName: entry.fileName,
  };
}

function buildOutsideArtAssets(fileNames: string[]): OutsideArtAsset[] {
  const artFiles = fileNames
    .filter((fileName) => !fileName.startsWith("."))
    .filter((fileName) => SUPPORTED_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => left.localeCompare(right));

  if (artFiles.length === 0) {
    return [];
  }

  const repeats = getRepeatCount(artFiles.length);
  const entries = buildPlacementEntries(artFiles, repeats);
  const placedAssets: PositionedOutsideArtAsset[] = [];

  for (const entry of entries) {
    placedAssets.push(placeOutsideArtAsset(entry, artFiles.length, placedAssets));
  }

  return placedAssets.map(({ centerX: _centerX, centerY: _centerY, fileName: _fileName, ...asset }) => asset);
}

export async function listOutsideArtAssets(): Promise<OutsideArtAsset[]> {
  noStore();

  try {
    const fileNames = await fs.readdir(OUTSIDE_ART_DIRECTORY);
    return buildOutsideArtAssets(fileNames);
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;

    if (candidate.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}
