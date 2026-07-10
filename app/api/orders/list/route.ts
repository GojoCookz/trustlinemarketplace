import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { listOrders } from "@/db/repo/listings";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return apiError("userId required");

  const role = req.nextUrl.searchParams.get("role") as "buyer" | "seller" | "all" | null;

  const orders = listOrders(userId, role ?? "all");
  return apiSuccess(orders);
}
