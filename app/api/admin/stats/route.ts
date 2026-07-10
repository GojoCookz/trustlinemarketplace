import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { adminStats } from "@/db/repo/stats";
import { isDevMode } from "@/lib/xrpl/xaman";

// dev mode: open (testnet-only playground). production: requires ADMIN_KEY env
// matched against the x-admin-key header — never hardcoded, never in the client bundle.
export async function GET(req: NextRequest) {
  if (!isDevMode()) {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || req.headers.get("x-admin-key") !== adminKey) {
      return apiError("unauthorized", 401);
    }
  }
  return apiSuccess(adminStats());
}
