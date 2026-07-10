import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getOrder } from "@/db/repo/listings";
import { getDb } from "@/db";

const disputeSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().min(1).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return apiError("order not found", 404);

  let body: z.infer<typeof disputeSchema>;
  try {
    body = disputeSchema.parse(await req.json());
  } catch {
    return apiError("userId and reason required");
  }

  if (order.buyer_id !== body.userId && order.seller_id !== body.userId) {
    return apiError("only buyer or seller can dispute", 403);
  }

  if (order.status !== "escrowed" && order.status !== "delivered") {
    return apiError(`order is ${order.status}, can only dispute escrowed or delivered orders`);
  }

  getDb()
    .prepare(
      "UPDATE orders SET status = 'disputed', disputed_at = datetime('now') WHERE id = ?"
    )
    .run(id);

  // dispute reason goes into the order's message thread so both parties
  // and any future arbiter see it in context
  getDb()
    .prepare(
      "INSERT INTO messages (thread_id, sender_id, recipient_id, body) VALUES (?, ?, ?, ?)"
    )
    .run(
      id,
      body.userId,
      body.userId === order.buyer_id ? order.seller_id : order.buyer_id,
      `[dispute opened] ${body.reason}`
    );

  return apiSuccess({ status: "disputed" });
}
