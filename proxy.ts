import { NextRequest, NextResponse } from "next/server";

// Per-IP sliding-window rate limiter for all API routes.
// In-memory per server instance — on serverless this resets per instance,
// which still caps burst abuse; move to durable storage (redis/turso) for
// multi-instance production (see MAINNET.md).
const WINDOW_MS = 60_000;
const LIMIT_MUTATE = 30; // POST/PUT/PATCH/DELETE per minute per ip
const LIMIT_READ = 120; // GET per minute per ip

const hits = new Map<string, number[]>();

function allowed(key: string, limit: number): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const arr = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  // opportunistic cleanup so the map can't grow unbounded
  if (hits.size > 10_000) {
    for (const [k, v] of hits) {
      if (v.length === 0 || v[v.length - 1] < windowStart) hits.delete(k);
    }
  }
  return true;
}

export function proxy(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "local";
  const mutating = req.method !== "GET" && req.method !== "HEAD";
  const limit = mutating ? LIMIT_MUTATE : LIMIT_READ;

  if (!allowed(`${ip}:${mutating ? "w" : "r"}`, limit)) {
    return NextResponse.json(
      { success: false, error: "rate limit exceeded — slow down" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
