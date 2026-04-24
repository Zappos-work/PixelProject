export type HealthResponse = {
  status: "ok" | "degraded";
  environment: string;
  service_status: {
    api: boolean;
    database: boolean;
    redis: boolean;
  };
};

export type WorldChunk = {
  id: string;
  chunk_x: number;
  chunk_y: number;
  origin_x: number;
  origin_y: number;
  width: number;
  height: number;
  is_active: boolean;
  created_at: string;
  label: string;
  role: string;
};

export type WorldBounds = {
  min_chunk_x: number;
  max_chunk_x: number;
  min_chunk_y: number;
  max_chunk_y: number;
  min_world_x: number;
  max_world_x: number;
  min_world_y: number;
  max_world_y: number;
};

export type WorldLandmark = {
  id: string;
  name: string;
  kind: string;
  description: string;
  chunk_x: number;
  chunk_y: number;
  offset_x: number;
  offset_y: number;
  tone: string;
};

export type WorldGrowthProgress = {
  stage: number;
  next_stage: number;
  active_stage: number;
  active_chunks: number;
  current_chunks: number;
  next_stage_chunks: number;
  capacity_pixels: number;
  painted_pixels: number;
  claimed_pixels: number;
  required_pixels: number;
  remaining_pixels: number;
  filled_percent: number;
  expansion_threshold_percent: number;
  progress_percent: number;
  remaining_percent: number;
  fill_ratio: number;
};

export type WorldOverview = {
  origin: {
    x: number;
    y: number;
  };
  chunk_size: number;
  expansion_buffer: number;
  chunk_count: number;
  bounds: WorldBounds;
  growth: WorldGrowthProgress;
  chunks: WorldChunk[];
  landmarks: WorldLandmark[];
};

export type DashboardData = {
  health: HealthResponse;
  world: WorldOverview;
};

export type AvatarHistoryEntry = {
  image_url: string;
  label: string;
  selected_at: string;
};

export type AuthUser = {
  id: string;
  public_id: number;
  display_name: string;
  display_name_changed_at: string | null;
  avatar_key: string;
  avatar_url: string | null;
  avatar_history: AvatarHistoryEntry[];
  role: string;
  is_banned: boolean;
  holders: number;
  holders_unlimited: boolean;
  holder_limit: number;
  holder_regeneration_interval_seconds: number;
  holders_last_updated_at: string;
  next_holder_regeneration_at: string | null;
  claim_area_limit: number;
  normal_pixels: number;
  normal_pixel_limit: number;
  normal_pixel_regeneration_interval_seconds: number;
  normal_pixels_last_updated_at: string;
  next_normal_pixel_regeneration_at: string | null;
  created_at: string;
  last_login_at: string;
  needs_display_name_setup: boolean;
  can_change_display_name: boolean;
  next_display_name_change_at: string | null;
  level: number;
  level_progress_current: number;
  level_progress_target: number;
  holders_placed_total: number;
  claimed_pixels_count: number;
};

export type AuthSessionStatus = {
  authenticated: boolean;
  google_oauth_configured: boolean;
  user: AuthUser | null;
  request_failed?: boolean;
};

export type WorldPixel = {
  id: string;
  x: number;
  y: number;
  chunk_x: number;
  chunk_y: number;
  color_id: number | null;
  owner_user_id: string | null;
  owner_public_id: number | null;
  owner_display_name: string | null;
  area_id: string | null;
  is_starter: boolean;
  viewer_relation: "owner" | "contributor" | "blocked" | "starter" | "unclaimed" | null;
  created_at: string;
  updated_at: string;
};

export type WorldPixelWindow = {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  truncated: boolean;
  pixels: WorldPixel[];
};

export type ClaimContextPixel = {
  x: number;
  y: number;
  owner_user_id: string | null;
  area_id: string | null;
  is_starter: boolean;
};

export type ClaimContextPixelWindow = {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  truncated: boolean;
  pixels: ClaimContextPixel[];
};

export type ClaimOutlineSegment = {
  orientation: "horizontal" | "vertical";
  line: number;
  start: number;
  end: number;
  status: "owner" | "contributor" | "blocked" | "starter";
};

export type ClaimOutlineWindow = {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  truncated: boolean;
  segments: ClaimOutlineSegment[];
};

export type WorldTileLayer =
  | "claims"
  | "claims-low"
  | "paint"
  | "paint-low"
  | "visual"
  | "visual-low";

const WORLD_TILE_STYLE_VERSION: Record<WorldTileLayer, string> = {
  claims: "access-v6-finished-cleanup",
  "claims-low": "access-v6-finished-cleanup-lod4",
  paint: "v4-centered",
  "paint-low": "v4-centered-lod4",
  visual: "visual-neutral-v2-finished-cleanup",
  "visual-low": "visual-neutral-v2-finished-cleanup-lod4",
};

const apiBaseUrl =
  process.env.API_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://backend:8000/api/v1";

const clientApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

const fallbackHealth: HealthResponse = {
  status: "degraded",
  environment: "local",
  service_status: {
    api: false,
    database: false,
    redis: false,
  },
};

export const fallbackWorld: WorldOverview = {
  origin: {
    x: 0,
    y: 0,
  },
  chunk_size: 4000,
  expansion_buffer: 0,
  chunk_count: 1,
  growth: {
    stage: 1,
    next_stage: 2,
    active_stage: 1,
    active_chunks: 1,
    current_chunks: 1,
    next_stage_chunks: 5,
    capacity_pixels: 16000000,
    painted_pixels: 0,
    claimed_pixels: 0,
    required_pixels: 11200000,
    remaining_pixels: 11200000,
    filled_percent: 0,
    expansion_threshold_percent: 70,
    progress_percent: 0,
    remaining_percent: 70,
    fill_ratio: 0.7,
  },
  bounds: {
    min_chunk_x: 0,
    max_chunk_x: 0,
    min_chunk_y: 0,
    max_chunk_y: 0,
    min_world_x: -2000,
    max_world_x: 2000,
    min_world_y: -2000,
    max_world_y: 2000,
  },
  chunks: [
    {
      id: "fallback-origin",
      chunk_x: 0,
      chunk_y: 0,
      origin_x: -2000,
      origin_y: -2000,
      width: 4000,
      height: 4000,
      is_active: true,
      created_at: "1970-01-01T00:00:00Z",
      label: "Origin Anchor",
      role: "origin",
    },
  ],
  landmarks: [],
};

const fallbackAuthSession: AuthSessionStatus = {
  authenticated: false,
  google_oauth_configured: false,
  user: null,
  request_failed: true,
};

const fallbackWorldPixels: WorldPixelWindow = {
  min_x: 0,
  max_x: 0,
  min_y: 0,
  max_y: 0,
  truncated: false,
  pixels: [],
};

const fallbackClaimContextPixels: ClaimContextPixelWindow = {
  min_x: 0,
  max_x: 0,
  min_y: 0,
  max_y: 0,
  truncated: false,
  pixels: [],
};

const fallbackClaimOutline: ClaimOutlineWindow = {
  min_x: 0,
  max_x: 0,
  min_y: 0,
  max_y: 0,
  truncated: false,
  segments: [],
};

const fallbackClaimAreaPreviewWindow: ClaimAreaPreviewWindow = {
  min_x: 0,
  max_x: 0,
  min_y: 0,
  max_y: 0,
  areas: [],
};

export type UpdateDisplayNameResult = {
  ok: boolean;
  user: AuthUser | null;
  status: number | null;
  error: string | null;
};

export type CurrentUserResult = {
  ok: boolean;
  user: AuthUser | null;
  status: number | null;
  error: string | null;
};

export type UploadAvatarResult = {
  ok: boolean;
  user: AuthUser | null;
  status: number | null;
  error: string | null;
};

export type PixelClaimResult = {
  ok: boolean;
  pixel: WorldPixel | null;
  user: AuthUser | null;
  status: number | null;
  error: string | null;
};

export type PixelPaintResult = {
  ok: boolean;
  pixel: WorldPixel | null;
  user: AuthUser | null;
  status: number | null;
  error: string | null;
};

export type PaintTileInput = {
  x: number;
  y: number;
  pixels: Record<string, number>;
};

export type PixelBatchPaintResult = {
  ok: boolean;
  user: AuthUser | null;
  painted_count: number;
  paint_tiles: WorldTileCoordinate[];
  claim_tiles: WorldTileCoordinate[];
  status: number | null;
  error: string | null;
};

export type AreaOwnerSummary = {
  id: string;
  public_id: number;
  display_name: string;
  avatar_url: string | null;
};

export type AreaContributorSummary = {
  id: string;
  public_id: number;
  display_name: string;
  avatar_url: string | null;
  role: "member" | "admin";
};

export type ClaimAreaStatus = "active" | "finished";
export type ClaimAreaClaimMode = "new" | "expand";

export type ClaimAreaPreview = {
  id: string;
  public_id: number;
  name: string;
  description: string;
  status: ClaimAreaStatus;
  owner: AreaOwnerSummary;
  claimed_pixels_count: number;
  painted_pixels_count: number;
  contributor_count: number;
  viewer_can_edit: boolean;
  viewer_can_paint: boolean;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
};

export type ClaimAreaSummary = ClaimAreaPreview & {
  contributors: AreaContributorSummary[];
};

export type ClaimAreaRecord = ClaimAreaPreview | ClaimAreaSummary;

export type ClaimAreaBounds = {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  width: number;
  height: number;
  center_x: number;
  center_y: number;
};

export type ClaimAreaListItem = {
  id: string;
  public_id: number;
  name: string;
  description: string;
  status: ClaimAreaStatus;
  owner: AreaOwnerSummary;
  claimed_pixels_count: number;
  painted_pixels_count: number;
  contributor_count: number;
  viewer_can_edit: boolean;
  viewer_can_paint: boolean;
  bounds: ClaimAreaBounds;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
};

export type ClaimAreaListResult = {
  ok: boolean;
  areas: ClaimAreaListItem[];
  status: number | null;
  error: string | null;
};

export type ClaimAreaPreviewWindow = {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  areas: ClaimAreaPreview[];
};

export type ClaimAreaPreviewWindowResult = {
  ok: boolean;
  window: ClaimAreaPreviewWindow;
  status: number | null;
  error: string | null;
};

export type ClaimRectangleInput = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type WorldTileCoordinate = {
  tile_x: number;
  tile_y: number;
};

export type PixelBatchClaimResult = {
  ok: boolean;
  pixels: WorldPixel[];
  user: AuthUser | null;
  area: ClaimAreaSummary | null;
  claimed_count: number;
  returned_pixel_count: number;
  claim_tiles: WorldTileCoordinate[];
  status: number | null;
  error: string | null;
};

export type ClaimAreaResult = {
  ok: boolean;
  area: ClaimAreaSummary | null;
  claim_tiles: WorldTileCoordinate[];
  status: number | null;
  error: string | null;
};

export type ClaimAreaInspection = {
  pixel: WorldPixel | null;
  area: ClaimAreaSummary | null;
};

export type ClaimAreaInspectionResult = {
  ok: boolean;
  inspection: ClaimAreaInspection | null;
  status: number | null;
  error: string | null;
};

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const [health, world] = await Promise.all([
    fetchJson<HealthResponse>("/health", fallbackHealth),
    fetchJson<WorldOverview>("/world/overview", fallbackWorld),
  ]);

  return {
    health,
    world,
  };
}

export async function fetchWorldOverview(): Promise<WorldOverview> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/overview`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as WorldOverview;
  } catch {
    return fallbackWorld;
  }
}

export function getClientApiBaseUrl(): string {
  return clientApiBaseUrl;
}

export function getWorldTileUrl(
  layer: WorldTileLayer,
  tileX: number,
  tileY: number,
  revision = 0,
  viewerKey?: string,
): string {
  const params = new URLSearchParams({
    v: String(revision),
    s: WORLD_TILE_STYLE_VERSION[layer],
  });

  if (viewerKey) {
    params.set("u", viewerKey);
  }

  return `${clientApiBaseUrl}/world/tiles/${layer}/${tileX}/${tileY}.png?${params.toString()}`;
}

export async function fetchAuthSession(): Promise<AuthSessionStatus> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/auth/session`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as AuthSessionStatus;
  } catch {
    return fallbackAuthSession;
  }
}

export async function fetchCurrentUser(): Promise<CurrentUserResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/auth/me`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      return {
        ok: false,
        user: null,
        status: response.status,
        error: await readApiError(response, "Current user request failed."),
      };
    }

    return {
      ok: true,
      user: (await response.json()) as AuthUser,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      user: null,
      status: null,
      error: "Current user request failed.",
    };
  }
}

export async function logoutAuthSession(): Promise<boolean> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function updateDisplayName(displayName: string): Promise<UpdateDisplayNameResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/auth/profile/display-name`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ display_name: displayName }),
    });

    if (!response.ok) {
      return {
        ok: false,
        user: null,
        status: response.status,
        error: await readApiError(response, "Display name update failed."),
      };
    }

    return {
      ok: true,
      user: (await response.json()) as AuthUser,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      user: null,
      status: null,
      error: "Display name update failed.",
    };
  }
}

export async function uploadAvatar(file: File): Promise<UploadAvatarResult> {
  try {
    const formData = new FormData();
    formData.append("avatar", file);

    const response = await fetch(`${clientApiBaseUrl}/auth/profile/avatar-upload`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!response.ok) {
      return {
        ok: false,
        user: null,
        status: response.status,
        error: await readApiError(response, "Avatar upload failed."),
      };
    }

    return {
      ok: true,
      user: (await response.json()) as AuthUser,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      user: null,
      status: null,
      error: "Avatar upload failed.",
    };
  }
}

export async function fetchVisibleWorldPixels(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  signal?: AbortSignal,
): Promise<WorldPixelWindow> {
  try {
    const params = new URLSearchParams({
      min_x: String(minX),
      max_x: String(maxX),
      min_y: String(minY),
      max_y: String(maxY),
    });
    const response = await fetch(`${clientApiBaseUrl}/world/pixels?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
      signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as WorldPixelWindow;
  } catch {
    return fallbackWorldPixels;
  }
}

export async function fetchClaimContextPixels(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  signal?: AbortSignal,
): Promise<ClaimContextPixelWindow> {
  try {
    const params = new URLSearchParams({
      min_x: String(minX),
      max_x: String(maxX),
      min_y: String(minY),
      max_y: String(maxY),
    });
    const response = await fetch(`${clientApiBaseUrl}/world/claims/context?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
      signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as ClaimContextPixelWindow;
  } catch {
    return fallbackClaimContextPixels;
  }
}

export async function fetchClaimOutlinePixels(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  focusAreaId?: string | null,
  signal?: AbortSignal,
): Promise<ClaimOutlineWindow> {
  try {
    const params = new URLSearchParams({
      min_x: String(minX),
      max_x: String(maxX),
      min_y: String(minY),
      max_y: String(maxY),
    });

    if (focusAreaId) {
      params.set("focus_area_id", focusAreaId);
    }

    const response = await fetch(`${clientApiBaseUrl}/world/claims/outline?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
      signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as ClaimOutlineWindow;
  } catch {
    return fallbackClaimOutline;
  }
}

export async function fetchVisibleClaimAreaPreviews(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  signal?: AbortSignal,
): Promise<ClaimAreaPreviewWindowResult> {
  try {
    const params = new URLSearchParams({
      min_x: String(minX),
      max_x: String(maxX),
      min_y: String(minY),
      max_y: String(maxY),
    });
    const response = await fetch(`${clientApiBaseUrl}/world/areas/visible?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
      signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        window: fallbackClaimAreaPreviewWindow,
        status: response.status,
        error: await readApiError(response, "Visible area preview request failed."),
      };
    }

    return {
      ok: true,
      window: (await response.json()) as ClaimAreaPreviewWindow,
      status: response.status,
      error: null,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        window: fallbackClaimAreaPreviewWindow,
        status: null,
        error: "Visible area preview request aborted.",
      };
    }

    return {
      ok: false,
      window: fallbackClaimAreaPreviewWindow,
      status: null,
      error: "Visible area preview request failed.",
    };
  }
}

export async function claimWorldPixel(x: number, y: number): Promise<PixelClaimResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/claims`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ x, y }),
    });

    if (!response.ok) {
      return {
        ok: false,
        pixel: null,
        user: null,
        status: response.status,
        error: await readApiError(response, "Pixel claim failed."),
      };
    }

    const payload = (await response.json()) as { pixel: WorldPixel; user: AuthUser };
    return {
      ok: true,
      pixel: payload.pixel,
      user: payload.user,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      pixel: null,
      user: null,
      status: null,
      error: "Pixel claim failed.",
    };
  }
}

export async function claimWorldPixels(input: {
  pixels: Array<{ x: number; y: number }>;
  rectangles?: ClaimRectangleInput[];
  claimMode: ClaimAreaClaimMode;
  targetAreaId?: string | null;
}): Promise<PixelBatchClaimResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/claims/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        pixels: input.pixels,
        rectangles: (input.rectangles ?? []).map((rectangle) => ({
          min_x: rectangle.minX,
          max_x: rectangle.maxX,
          min_y: rectangle.minY,
          max_y: rectangle.maxY,
        })),
        claim_mode: input.claimMode,
        target_area_id: input.targetAreaId ?? null,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        pixels: [],
        user: null,
        area: null,
        claimed_count: 0,
        returned_pixel_count: 0,
        claim_tiles: [],
        status: response.status,
        error: await readApiError(response, "Batch claim failed."),
      };
    }

    const payload = (await response.json()) as {
      pixels: WorldPixel[];
      user: AuthUser;
      area: ClaimAreaSummary;
      claimed_count: number;
      returned_pixel_count: number;
      claim_tiles: WorldTileCoordinate[];
    };
    return {
      ok: true,
      pixels: payload.pixels,
      user: payload.user,
      area: payload.area,
      claimed_count: payload.claimed_count,
      returned_pixel_count: payload.returned_pixel_count,
      claim_tiles: payload.claim_tiles,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      pixels: [],
      user: null,
      area: null,
      claimed_count: 0,
      returned_pixel_count: 0,
      claim_tiles: [],
      status: null,
      error: "Batch claim failed.",
    };
  }
}

export async function paintWorldPixel(
  x: number,
  y: number,
  colorId: number,
): Promise<PixelPaintResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/pixels`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        x,
        y,
        color_id: colorId,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        pixel: null,
        user: null,
        status: response.status,
        error: await readApiError(response, "Pixel painting failed."),
      };
    }

    const payload = (await response.json()) as { pixel: WorldPixel; user: AuthUser };
    return {
      ok: true,
      pixel: payload.pixel,
      user: payload.user,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      pixel: null,
      user: null,
      status: null,
      error: "Pixel painting failed.",
    };
  }
}

export async function paintWorldPixels(tiles: PaintTileInput[]): Promise<PixelBatchPaintResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/paint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        season: 0,
        tiles,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        user: null,
        painted_count: 0,
        paint_tiles: [],
        claim_tiles: [],
        status: response.status,
        error: await readApiError(response, "Pixel painting failed."),
      };
    }

    const payload = (await response.json()) as {
      user: AuthUser;
      painted_count: number;
      paint_tiles: WorldTileCoordinate[];
      claim_tiles: WorldTileCoordinate[];
    };
    return {
      ok: true,
      user: payload.user,
      painted_count: payload.painted_count,
      paint_tiles: payload.paint_tiles,
      claim_tiles: payload.claim_tiles,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      user: null,
      painted_count: 0,
      paint_tiles: [],
      claim_tiles: [],
      status: null,
      error: "Pixel painting failed.",
    };
  }
}

export async function fetchClaimArea(areaId: string, signal?: AbortSignal): Promise<ClaimAreaResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/areas/${areaId}`, {
      cache: "no-store",
      credentials: "include",
      signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        area: null,
        claim_tiles: [],
        status: response.status,
        error: await readApiError(response, "Area request failed."),
      };
    }

    return {
      ok: true,
      area: (await response.json()) as ClaimAreaSummary,
      claim_tiles: [],
      status: response.status,
      error: null,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        area: null,
        claim_tiles: [],
        status: null,
        error: "Area request aborted.",
      };
    }

    return {
      ok: false,
      area: null,
      claim_tiles: [],
      status: null,
      error: "Area request failed.",
    };
  }
}

export async function fetchClaimAreaAtPixel(
  x: number,
  y: number,
  signal?: AbortSignal,
): Promise<ClaimAreaInspectionResult> {
  try {
    const params = new URLSearchParams({
      x: String(x),
      y: String(y),
    });
    const response = await fetch(`${clientApiBaseUrl}/world/areas/by-pixel?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
      signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        inspection: null,
        status: response.status,
        error: await readApiError(response, "Area inspection request failed."),
      };
    }

    return {
      ok: true,
      inspection: (await response.json()) as ClaimAreaInspection,
      status: response.status,
      error: null,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        inspection: null,
        status: null,
        error: "Area inspection request aborted.",
      };
    }

    return {
      ok: false,
      inspection: null,
      status: null,
      error: "Area inspection request failed.",
    };
  }
}

export async function fetchMyClaimAreas(): Promise<ClaimAreaListResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/areas/mine`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      return {
        ok: false,
        areas: [],
        status: response.status,
        error: await readApiError(response, "Area list request failed."),
      };
    }

    const payload = (await response.json()) as { areas: ClaimAreaListItem[] };
    return {
      ok: true,
      areas: payload.areas,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      areas: [],
      status: null,
      error: "Area list request failed.",
    };
  }
}

export async function updateClaimArea(
  areaId: string,
  name: string,
  description: string,
  status?: ClaimAreaStatus,
): Promise<ClaimAreaResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/areas/${areaId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ name, description, status }),
    });

    if (!response.ok) {
      return {
        ok: false,
        area: null,
        claim_tiles: [],
        status: response.status,
        error: await readApiError(response, "Area update failed."),
      };
    }

    const payload = (await response.json()) as {
      area: ClaimAreaSummary;
      claim_tiles: WorldTileCoordinate[];
    };

    return {
      ok: true,
      area: payload.area,
      claim_tiles: payload.claim_tiles,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      area: null,
      claim_tiles: [],
      status: null,
      error: "Area update failed.",
    };
  }
}

export async function inviteAreaContributor(
  areaId: string,
  publicId: number,
): Promise<ClaimAreaResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/areas/${areaId}/contributors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ public_id: publicId }),
    });

    if (!response.ok) {
      return {
        ok: false,
        area: null,
        claim_tiles: [],
        status: response.status,
        error: await readApiError(response, "Contributor invite failed."),
      };
    }

    return {
      ok: true,
      area: (await response.json()) as ClaimAreaSummary,
      claim_tiles: [],
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      area: null,
      claim_tiles: [],
      status: null,
      error: "Contributor invite failed.",
    };
  }
}

export async function removeAreaContributor(
  areaId: string,
  publicId: number,
): Promise<ClaimAreaResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/areas/${areaId}/contributors/${publicId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      return {
        ok: false,
        area: null,
        claim_tiles: [],
        status: response.status,
        error: await readApiError(response, "Contributor removal failed."),
      };
    }

    return {
      ok: true,
      area: (await response.json()) as ClaimAreaSummary,
      claim_tiles: [],
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      area: null,
      claim_tiles: [],
      status: null,
      error: "Contributor removal failed.",
    };
  }
}

export async function promoteAreaContributor(
  areaId: string,
  publicId: number,
): Promise<ClaimAreaResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/areas/${areaId}/contributors/${publicId}/promote`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      return {
        ok: false,
        area: null,
        claim_tiles: [],
        status: response.status,
        error: await readApiError(response, "Contributor promote failed."),
      };
    }

    return {
      ok: true,
      area: (await response.json()) as ClaimAreaSummary,
      claim_tiles: [],
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      area: null,
      claim_tiles: [],
      status: null,
      error: "Contributor promote failed.",
    };
  }
}
