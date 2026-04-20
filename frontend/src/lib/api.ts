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

export type WorldOverview = {
  origin: {
    x: number;
    y: number;
  };
  chunk_size: number;
  expansion_buffer: number;
  chunk_count: number;
  bounds: WorldBounds;
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
  google_subject: string;
  email: string;
  display_name: string;
  display_name_changed_at: string | null;
  avatar_key: string;
  avatar_url: string | null;
  avatar_history: AvatarHistoryEntry[];
  role: string;
  is_banned: boolean;
  holders: number;
  holder_limit: number;
  holder_regeneration_interval_seconds: number;
  holders_last_updated_at: string;
  next_holder_regeneration_at: string | null;
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

export type WorldTileLayer = "claims" | "paint";

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

const fallbackWorld: WorldOverview = {
  origin: {
    x: 0,
    y: 0,
  },
  chunk_size: 5000,
  expansion_buffer: 5000,
  chunk_count: 0,
  bounds: {
    min_chunk_x: 0,
    max_chunk_x: 0,
    min_chunk_y: 0,
    max_chunk_y: 0,
    min_world_x: 0,
    max_world_x: 5000,
    min_world_y: 0,
    max_world_y: 5000,
  },
  chunks: [],
  landmarks: [],
};

const fallbackAuthSession: AuthSessionStatus = {
  authenticated: false,
  google_oauth_configured: false,
  user: null,
};

const fallbackWorldPixels: WorldPixelWindow = {
  min_x: 0,
  max_x: 0,
  min_y: 0,
  max_y: 0,
  truncated: false,
  pixels: [],
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

export type AreaOwnerSummary = {
  id: string;
  public_id: number;
  display_name: string;
};

export type AreaContributorSummary = {
  id: string;
  public_id: number;
  display_name: string;
};

export type ClaimAreaSummary = {
  id: string;
  name: string;
  description: string;
  owner: AreaOwnerSummary;
  claimed_pixels_count: number;
  painted_pixels_count: number;
  contributor_count: number;
  contributors: AreaContributorSummary[];
  viewer_can_edit: boolean;
  viewer_can_paint: boolean;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
};

export type PixelBatchClaimResult = {
  ok: boolean;
  pixels: WorldPixel[];
  user: AuthUser | null;
  area: ClaimAreaSummary | null;
  status: number | null;
  error: string | null;
};

export type ClaimAreaResult = {
  ok: boolean;
  area: ClaimAreaSummary | null;
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

export function getClientApiBaseUrl(): string {
  return clientApiBaseUrl;
}

export function getWorldTileUrl(
  layer: WorldTileLayer,
  tileX: number,
  tileY: number,
  revision = 0,
): string {
  const params = new URLSearchParams({ v: String(revision) });
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
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as WorldPixelWindow;
  } catch {
    return fallbackWorldPixels;
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

export async function claimWorldPixels(pixels: Array<{ x: number; y: number }>): Promise<PixelBatchClaimResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/claims/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ pixels }),
    });

    if (!response.ok) {
      return {
        ok: false,
        pixels: [],
        user: null,
        area: null,
        status: response.status,
        error: await readApiError(response, "Batch claim failed."),
      };
    }

    const payload = (await response.json()) as {
      pixels: WorldPixel[];
      user: AuthUser;
      area: ClaimAreaSummary;
    };
    return {
      ok: true,
      pixels: payload.pixels,
      user: payload.user,
      area: payload.area,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      pixels: [],
      user: null,
      area: null,
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

export async function fetchClaimArea(areaId: string): Promise<ClaimAreaResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/areas/${areaId}`, {
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      return {
        ok: false,
        area: null,
        status: response.status,
        error: await readApiError(response, "Area request failed."),
      };
    }

    return {
      ok: true,
      area: (await response.json()) as ClaimAreaSummary,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      area: null,
      status: null,
      error: "Area request failed.",
    };
  }
}

export async function updateClaimArea(
  areaId: string,
  name: string,
  description: string,
): Promise<ClaimAreaResult> {
  try {
    const response = await fetch(`${clientApiBaseUrl}/world/areas/${areaId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ name, description }),
    });

    if (!response.ok) {
      return {
        ok: false,
        area: null,
        status: response.status,
        error: await readApiError(response, "Area update failed."),
      };
    }

    return {
      ok: true,
      area: (await response.json()) as ClaimAreaSummary,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      area: null,
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
        status: response.status,
        error: await readApiError(response, "Contributor invite failed."),
      };
    }

    return {
      ok: true,
      area: (await response.json()) as ClaimAreaSummary,
      status: response.status,
      error: null,
    };
  } catch {
    return {
      ok: false,
      area: null,
      status: null,
      error: "Contributor invite failed.",
    };
  }
}
