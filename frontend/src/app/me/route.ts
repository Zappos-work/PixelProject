import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const apiBaseUrl =
  process.env.API_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://backend:8000/api/v1";

export async function GET(request: Request) {
  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    cache: "no-store",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
    },
  });

  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}
