import "server-only";

import { promises as fs } from "fs";
import path from "path";

import { unstable_noStore as noStore } from "next/cache";

import { OUTSIDE_ART_PATTERN_SIZE, type OutsideArtAsset } from "@/lib/outside-art-types";

const OUTSIDE_ART_DIRECTORY = path.join(process.cwd(), "public", "outside-art");
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]);
const OUTSIDE_ART_MIN_CLEARANCE = 10;

type OutsideArtEntry = {
  fileName: string;
  repeatIndex: number;
};

type PlacementSlot = {
  key: string;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
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

function getRotatedArtDiameter(size: number): number {
  return size * Math.SQRT2;
}

function buildPlacementSlots(entryCount: number): PlacementSlot[] {
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(entryCount)));
  const rowCount = Math.max(1, Math.ceil(entryCount / columnCount));
  const slotWidth = OUTSIDE_ART_PATTERN_SIZE / columnCount;
  const slotHeight = OUTSIDE_ART_PATTERN_SIZE / rowCount;
  const slots: PlacementSlot[] = [];

  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      slots.push({
        key: `${column}:${row}`,
        centerX: slotWidth * column + slotWidth / 2,
        centerY: slotHeight * row + slotHeight / 2,
        width: slotWidth,
        height: slotHeight,
      });
    }
  }

  return slots
    .sort((left, right) => compareBySeed(left.key, right.key, `slot:${entryCount}`))
    .slice(0, entryCount);
}

function getJitterBudget(slotSize: number, artSize: number): number {
  const maxOffset = (slotSize - getRotatedArtDiameter(artSize) - OUTSIDE_ART_MIN_CLEARANCE) / 2;

  return Math.max(0, Math.floor(maxOffset));
}

function placeOutsideArtAsset(entry: OutsideArtEntry, assetCount: number, slot: PlacementSlot): OutsideArtAsset {
  const sizeRange = getArtSizeRange(assetCount);
  const size = pickRange(hashString(`${entry.fileName}:size:${entry.repeatIndex}`), sizeRange.min, sizeRange.max);
  const jitterX = pickRange(
    hashString(`${entry.fileName}:x:${entry.repeatIndex}:${slot.key}`),
    -getJitterBudget(slot.width, size),
    getJitterBudget(slot.width, size),
  );
  const jitterY = pickRange(
    hashString(`${entry.fileName}:y:${entry.repeatIndex}:${slot.key}`),
    -getJitterBudget(slot.height, size),
    getJitterBudget(slot.height, size),
  );
  const x = Math.round(slot.centerX + jitterX - size / 2);
  const y = Math.round(slot.centerY + jitterY - size / 2);

  return {
    key: `${entry.fileName}-${entry.repeatIndex}`,
    src: path.posix.join("/outside-art", entry.fileName),
    x,
    y,
    size,
    rotation: pickRange(hashString(`${entry.fileName}:rotation:${entry.repeatIndex}`), -12, 12),
    opacity: pickRange(hashString(`${entry.fileName}:opacity:${entry.repeatIndex}`), 16, 26) / 100,
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
  const placementSlots = buildPlacementSlots(entries.length);

  return entries.map((entry, index) => placeOutsideArtAsset(entry, artFiles.length, placementSlots[index]));
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
