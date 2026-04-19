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

export type AuthUser = {
  id: string;
  public_id: number;
  display_name: string;
  avatar_url: string | null;
  holders: number;
  holder_limit: number;
  created_at: string;
  last_login_at: string;
  can_change_display_name: boolean;
  next_display_name_change_at: string | null;
};

export type AuthSessionStatus = {
  authenticated: boolean;
  google_oauth_configured: boolean;
  user: AuthUser | null;
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

export type UpdateDisplayNameResult = {
  ok: boolean;
  user: AuthUser | null;
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
      let error = "Display name update failed.";

      try {
        const payload = (await response.json()) as { detail?: string };
        error = payload.detail ?? error;
      } catch {
        // Ignore JSON parsing issues and fall back to the default message.
      }

      return {
        ok: false,
        user: null,
        status: response.status,
        error,
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
