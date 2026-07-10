import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getOrder } from "@/db/repo/listings";
import { getDb } from "@/db";

const deliverSchema = z.object({
  sellerId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return apiError("order not found", 404);

  let body: z.infer<typeof deliverSchema>;
  try {
    body = deliverSchema.parse(await req.json());
  } catch {
    return apiError("sellerId required");
  }

  if (order.seller_id !== body.sellerId) {
    return apiError("only the seller can mark as delivered", 403);
  }

  if (order.status !== "escrowed") {
    return apiError(`order is ${order.status}, can only deliver from escrowed`);
  }

  getDb()
    .prepare("UPDATE orders SET status = 'delivered' WHERE id = ?")
    .run(id);

  return apiSuccess({ status: "delivered" });
}
