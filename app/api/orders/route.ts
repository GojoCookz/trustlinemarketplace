import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { createOrder } from "@/db/repo/listings";
import { getUser } from "@/db/repo/users";
import { getListing } from "@/db/repo/listings";
import { generateCondition, buildEscrowCreate } from "@/lib/xrpl/transactions/escrow";
import { isDevMode } from "@/lib/xrpl/xaman";
import { getDb } from "@/db";

const orderSchema = z.object({
  listingId: z.string().min(1),
  buyerId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof orderSchema>;
  try {
    body = orderSchema.parse(await req.json());
  } catch {
    return apiError("invalid request body");
  }

  const buyer = getUser(body.buyerId);
  if (!buyer) return apiError("buyer not found", 404);

  const listing = getListing(body.listingId);
  if (!listing) return apiError("listing not found", 404);

  if (listing.seller_id === body.buyerId) {
    return apiError("cannot buy your own listing");
  }

  const sellerRow = getDb()
    .prepare("SELECT address FROM users WHERE id = ?")
    .get(listing.seller_id) as { address: string | null } | undefined;

  if (!sellerRow?.address && !isDevMode()) {
    return apiError("seller has no wallet connected", 400);
  }

  const order = createOrder(body.listingId, body.buyerId);

  const { condition, fulfillment, preimage } = generateCondition();

  getDb()
    .prepare(
      "INSERT INTO escrow_conditions (order_id, condition_hex, fulfillment_hex, preimage_hex) VALUES (?, ?, ?, ?)"
    )
    .run(order.id, condition, fulfillment, preimage);

  const escrowTx = buildEscrowCreate({
    account: buyer.address ?? "rDevPlaceholder",
    destination: sellerRow?.address ?? "rDevPlaceholder",
    amountDrops: listing.price_drops,
    condition,
    cancelAfterSeconds: listing.delivery_days * 24 * 60 * 60,
  });

  return apiSuccess({
    order,
    escrowTx,
    condition,
  });
}
