import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getOrder } from "@/db/repo/listings";
import { getDb } from "@/db";

const confirmSchema = z.object({
  txHash: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return apiError("order not found", 404);

  if (order.status === "escrowed") {
    return apiSuccess({ status: "already escrowed", txHash: order.escrow_tx });
  }

  if (order.status !== "pending") {
    return apiError(`order is ${order.status}, cannot confirm`);
  }

  let body: z.infer<typeof confirmSchema>;
  try {
    body = confirmSchema.parse(await req.json());
  } catch {
    return apiError("txHash required");
  }

  getDb()
    .prepare("UPDATE orders SET status = 'escrowed', escrow_tx = ? WHERE id = ?")
    .run(body.txHash, id);

  return apiSuccess({ status: "escrowed", txHash: body.txHash });
}
