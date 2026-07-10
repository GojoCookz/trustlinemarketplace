import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getOrder } from "@/db/repo/listings";
import { updateAvgRating } from "@/db/repo/sellers";
import { getDb } from "@/db";

const rateSchema = z.object({
  buyerId: z.string().min(1),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = getDb()
    .prepare("SELECT stars, comment, created_at FROM seller_ratings WHERE order_id = ?")
    .get(id) as { stars: number; comment: string | null; created_at: string } | undefined;

  return apiSuccess(existing ?? null);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return apiError("order not found", 404);

  let body: z.infer<typeof rateSchema>;
  try {
    body = rateSchema.parse(await req.json());
  } catch {
    return apiError("stars (1-5) and buyerId required");
  }

  if (order.buyer_id !== body.buyerId) {
    return apiError("only the buyer can rate this order", 403);
  }

  if (order.status !== "confirmed") {
    return apiError("can only rate confirmed orders");
  }

  const existing = getDb()
    .prepare("SELECT 1 FROM seller_ratings WHERE order_id = ?")
    .get(id);
  if (existing) {
    return apiError("already rated this order");
  }

  getDb()
    .prepare(
      "INSERT INTO seller_ratings (order_id, seller_id, buyer_id, stars, comment) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, order.seller_id, order.buyer_id, body.stars, body.comment ?? null);

  updateAvgRating(order.seller_id);

  return apiSuccess({ stars: body.stars, comment: body.comment ?? null });
}
