import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getOrder, updateOrderStatus } from "@/db/repo/listings";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { Wallet } from "xrpl";

const devSignSchema = z.object({
  devSecret: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return apiError("order not found", 404);
  if (order.status !== "pending") {
    return apiError(`order already ${order.status}`);
  }

  const escrowRow = getDb()
    .prepare("SELECT * FROM escrow_conditions WHERE order_id = ?")
    .get(id) as
    | { condition_hex: string; fulfillment_hex: string }
    | undefined;

  if (!escrowRow) return apiError("escrow condition not found", 500);

  if (!isDevMode()) {
    return apiError("xaman escrow signing not yet implemented — use dev mode", 501);
  }

  if (!isTestnet()) {
    return apiError("dev signing only available on testnet", 403);
  }

  let body: z.infer<typeof devSignSchema>;
  try {
    body = devSignSchema.parse(await req.json());
  } catch {
    return apiError("devSecret required for dev mode signing");
  }

  const buyerRow = getDb()
    .prepare("SELECT address FROM users WHERE id = ?")
    .get(order.buyer_id) as { address: string | null } | undefined;

  let sellerAddr: string | null = (getDb()
    .prepare("SELECT address FROM users WHERE id = ?")
    .get(order.seller_id) as { address: string | null } | undefined)?.address ?? null;

  if (!buyerRow?.address) {
    return apiError("buyer wallet not connected", 400);
  }

  try {
    const client = await getClient();

    if (!sellerAddr) {
      const funded = await client.fundWallet();
      sellerAddr = funded.wallet.classicAddress;
      getDb()
        .prepare("UPDATE users SET address = ? WHERE id = ?")
        .run(sellerAddr, order.seller_id);
    }

    const wallet = Wallet.fromSeed(body.devSecret);

    const rippleEpoch = 946684800;
    const cancelAfterSeconds = 7 * 24 * 60 * 60;
    const cancelAfter =
      Math.floor(Date.now() / 1000) - rippleEpoch + cancelAfterSeconds;

    const prepared = await client.autofill({
      TransactionType: "EscrowCreate",
      Account: wallet.classicAddress,
      Destination: sellerAddr,
      Amount: order.price_drops.toString(),
      Condition: escrowRow.condition_hex,
      CancelAfter: cancelAfter,
    });

    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    if (
      typeof result.result.meta === "object" &&
      result.result.meta !== null &&
      "TransactionResult" in result.result.meta &&
      result.result.meta.TransactionResult !== "tesSUCCESS"
    ) {
      return apiError(
        `escrow create failed: ${result.result.meta.TransactionResult}`,
        500
      );
    }

    const txHash = signed.hash;
    const sequence = (prepared as { Sequence?: number }).Sequence;

    getDb()
      .prepare("UPDATE orders SET status = 'escrowed', escrow_tx = ? WHERE id = ?")
      .run(txHash, id);

    return apiSuccess({
      txHash,
      sequence,
      status: "escrowed",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "escrow submission failed";
    return apiError(msg, 500);
  }
}
