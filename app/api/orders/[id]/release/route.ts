import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getOrder, logPlatformFee } from "@/db/repo/listings";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { Wallet } from "xrpl";

const releaseSchema = z.object({
  buyerId: z.string().min(1),
  devSecret: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return apiError("order not found", 404);

  let body: z.infer<typeof releaseSchema>;
  try {
    body = releaseSchema.parse(await req.json());
  } catch {
    return apiError("buyerId required");
  }

  if (order.buyer_id !== body.buyerId) {
    return apiError("only the buyer can release escrow", 403);
  }

  if (order.status !== "delivered") {
    return apiError(`order is ${order.status}, can only release from delivered`);
  }

  const escrowRow = getDb()
    .prepare("SELECT * FROM escrow_conditions WHERE order_id = ?")
    .get(id) as
    | { condition_hex: string; fulfillment_hex: string }
    | undefined;

  if (!escrowRow) return apiError("escrow condition not found", 500);

  if (!isDevMode()) {
    return apiError("xaman escrow release not yet implemented — use dev mode", 501);
  }

  if (!isTestnet()) {
    return apiError("dev signing only available on testnet", 403);
  }

  if (!body.devSecret) {
    return apiError("devSecret required for dev mode");
  }

  const buyerAddress = getDb()
    .prepare("SELECT address FROM users WHERE id = ?")
    .get(order.buyer_id) as { address: string | null } | undefined;

  if (!buyerAddress?.address) {
    return apiError("buyer wallet not connected", 400);
  }

  try {
    const client = await getClient();
    const wallet = Wallet.fromSeed(body.devSecret);

    const escrowTxInfo = await client.request({
      command: "tx",
      transaction: order.escrow_tx!,
    });

    // rippled api v2 nests the transaction under tx_json; v1 puts fields on result
    const txResult = escrowTxInfo.result as unknown as Record<string, unknown>;
    const txJson = (txResult.tx_json ?? txResult) as Record<string, unknown>;
    const sequence = txJson.Sequence as number;
    const owner = txJson.Account as string;

    if (!owner || sequence === undefined) {
      return apiError("could not resolve escrow owner/sequence from ledger", 500);
    }

    const prepared = await client.autofill({
      TransactionType: "EscrowFinish",
      Account: wallet.classicAddress,
      Owner: owner,
      OfferSequence: sequence,
      Condition: escrowRow.condition_hex,
      Fulfillment: escrowRow.fulfillment_hex,
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
        `escrow finish failed: ${result.result.meta.TransactionResult}`,
        500
      );
    }

    const txHash = signed.hash;

    getDb()
      .prepare(
        "UPDATE orders SET status = 'confirmed', release_tx = ?, confirmed_at = datetime('now') WHERE id = ?"
      )
      .run(txHash, id);

    getDb()
      .prepare(
        "UPDATE seller_profiles SET total_sales = total_sales + 1, total_revenue_drops = total_revenue_drops + ? WHERE user_id = ?"
      )
      .run(order.seller_payout_drops, order.seller_id);

    getDb()
      .prepare("UPDATE listings SET total_sold = total_sold + 1 WHERE id = ?")
      .run(order.listing_id);

    logPlatformFee(
      "marketplace",
      order.platform_fee_drops,
      order.id,
      order.buyer_id,
      txHash
    );

    return apiSuccess({
      txHash,
      status: "confirmed",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "escrow release failed";
    return apiError(msg, 500);
  }
}
