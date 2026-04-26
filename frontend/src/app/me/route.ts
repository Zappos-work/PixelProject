import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const apiBaseUrl =
  process.env.API_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://backend:8000/api/v1";

type AuthMeResponse = {
  id: string;
  public_id: number;
  display_name: string;
  display_name_changed_at: string | null;
  avatar_key: string;
  avatar_url: string | null;
  role: string;
  is_banned: boolean;
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
  xp: number;
  level: number;
  level_progress_current: number;
  level_progress_target: number;
  coins: number;
  shop_items_purchased: {
    pixel_pack_50: {
      purchased: number;
      item_size: number;
      total_received: number;
    };
    max_pixels_5: {
      purchased: number;
      item_size: number;
      total_received: number;
    };
  };
  pixels_placed_total: number;
  claimed_pixels_count: number;
};

type ClaimAreaListItem = {
  id: string;
  public_id: number;
  name: string;
  description: string;
  status: "active" | "finished";
  owner: {
    id: string;
    public_id: number;
    display_name: string;
  };
  claimed_pixels_count: number;
  painted_pixels_count: number;
  contributor_count: number;
  reactions: {
    like_count: number;
    dislike_count: number;
    viewer_reaction: "like" | "dislike" | null;
  };
  viewer_can_edit: boolean;
  viewer_can_paint: boolean;
  bounds: {
    min_x: number;
    max_x: number;
    min_y: number;
    max_y: number;
    width: number;
    height: number;
    center_x: number;
    center_y: number;
  };
  created_at: string;
  updated_at: string;
  last_activity_at: string;
};

type ClaimAreaListResponse = {
  areas: ClaimAreaListItem[];
};

type ImageSourceSummary =
  | {
      kind: "inline-base64";
      mime_type: string;
      characters: number;
      base64_characters: number;
      approx_bytes: number;
      preview: string;
    }
  | {
      kind: "url";
      url: string;
    };

function buildBackendHeaders(request: Request): HeadersInit {
  return {
    cookie: request.headers.get("cookie") ?? "",
  };
}

function summarizeImageSource(value: string | null): ImageSourceSummary | null {
  if (!value) {
    return null;
  }

  const dataUrlMatch = value.match(/^data:([^;]+);base64,(.+)$/);

  if (!dataUrlMatch) {
    return {
      kind: "url",
      url: value,
    };
  }

  const mimeType = dataUrlMatch[1] ?? "application/octet-stream";
  const base64Payload = dataUrlMatch[2] ?? "";
  const paddingLength = (base64Payload.match(/=*$/)?.[0]?.length) ?? 0;
  const approxBytes = Math.max(0, Math.floor((base64Payload.length * 3) / 4) - paddingLength);

  return {
    kind: "inline-base64",
    mime_type: mimeType,
    characters: value.length,
    base64_characters: base64Payload.length,
    approx_bytes: approxBytes,
    preview: `${value.slice(0, 48)}...`,
  };
}

function sanitizeOwnedClaimArea(area: ClaimAreaListItem): ClaimAreaListItem {
  return {
    id: area.id,
    public_id: area.public_id,
    name: area.name,
    description: area.description,
    status: area.status,
    owner: {
      id: area.owner.id,
      public_id: area.owner.public_id,
      display_name: area.owner.display_name,
    },
    claimed_pixels_count: area.claimed_pixels_count,
    painted_pixels_count: area.painted_pixels_count,
    contributor_count: area.contributor_count,
    reactions: area.reactions ?? {
      like_count: 0,
      dislike_count: 0,
      viewer_reaction: null,
    },
    viewer_can_edit: area.viewer_can_edit,
    viewer_can_paint: area.viewer_can_paint,
    bounds: area.bounds,
    created_at: area.created_at,
    updated_at: area.updated_at,
    last_activity_at: area.last_activity_at,
  };
}

export async function GET(request: Request) {
  const authResponse = await fetch(`${apiBaseUrl}/auth/me`, {
    cache: "no-store",
    headers: buildBackendHeaders(request),
  });

  if (!authResponse.ok) {
    const body = await authResponse.text();
    return new NextResponse(body, {
      status: authResponse.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  }

  const user = (await authResponse.json()) as AuthMeResponse;
  let ownedAreas: ClaimAreaListItem[] = [];

  const ownedAreasResponse = await fetch(`${apiBaseUrl}/world/areas/mine`, {
    cache: "no-store",
    headers: buildBackendHeaders(request),
  });

  if (ownedAreasResponse.ok) {
    const payload = (await ownedAreasResponse.json()) as ClaimAreaListResponse;
    ownedAreas = payload.areas.map(sanitizeOwnedClaimArea);
  }

  return NextResponse.json({
    public_id: user.public_id,
    display_name: user.display_name,
    display_name_changed_at: user.display_name_changed_at,
    avatar_key: user.avatar_key,
    avatar: summarizeImageSource(user.avatar_url),
    role: user.role,
    is_banned: user.is_banned,
    claim_area_limit: user.claim_area_limit,
    normal_pixels: user.normal_pixels,
    normal_pixel_limit: user.normal_pixel_limit,
    normal_pixel_regeneration_interval_seconds: user.normal_pixel_regeneration_interval_seconds,
    normal_pixels_last_updated_at: user.normal_pixels_last_updated_at,
    next_normal_pixel_regeneration_at: user.next_normal_pixel_regeneration_at,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
    needs_display_name_setup: user.needs_display_name_setup,
    can_change_display_name: user.can_change_display_name,
    next_display_name_change_at: user.next_display_name_change_at,
    xp: user.xp,
    level: user.level,
    level_progress_current: user.level_progress_current,
    level_progress_target: user.level_progress_target,
    coins: user.coins,
    shop_items_purchased: {
      color_pixels: {
        item_id: "pixel_pack_50",
        label: "50 Color Pixels",
        purchased: user.shop_items_purchased.pixel_pack_50.purchased,
        color_pixels_per_purchase: user.shop_items_purchased.pixel_pack_50.item_size,
        total_color_pixels_received: user.shop_items_purchased.pixel_pack_50.total_received,
      },
      max_pixels: {
        item_id: "max_pixels_5",
        label: "Max Pixels +5",
        purchased: user.shop_items_purchased.max_pixels_5.purchased,
        max_pixels_per_purchase: user.shop_items_purchased.max_pixels_5.item_size,
        total_max_pixels_received: user.shop_items_purchased.max_pixels_5.total_received,
      },
    },
    pixels_placed_total: user.pixels_placed_total,
    claimed_pixels_count: user.claimed_pixels_count,
    owned_claim_areas: ownedAreas,
  });
}
