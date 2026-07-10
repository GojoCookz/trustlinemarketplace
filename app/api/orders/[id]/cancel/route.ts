import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getOrder } from "@/db/repo/listings";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { Wallet } from "xrpl";

const cancelSchema = z.object({
  userId: z.string().min(1),
  devSecret: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) return apiError("order not found", 404);

  let body: z.infer<typeof cancelSchema>;
  try {
    body = cancelSchema.parse(await req.json());
  } catch {
    return apiError("userId required");
  }

  if (order.buyer_id !== body.userId && order.seller_id !== body.userId) {
    return apiError("only buyer or seller can cancel", 403);
  }

  if (order.status !== "escrowed" && order.status !== "disputed") {
    return apiError(`order is ${order.status}, cannot cancel`);
  }

  if (!order.escrow_tx) {
    getDb()
      .prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?")
      .run(id);
    return apiSuccess({ status: "cancelled" });
  }

  if (!isDevMode()) {
    return apiError("xaman escrow cancel not yet implemented — use dev mode", 501);
  }

  if (!isTestnet()) {
    return apiError("dev signing only available on testnet", 403);
  }

  if (!body.devSecret) {
    return apiError("devSecret required for dev mode");
  }

  try {
    const client = await getClient();
    const wallet = Wallet.fromSeed(body.devSecret);

    const escrowTxInfo = await client.request({
      command: "tx",
      transaction: order.escrow_tx,
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
      TransactionType: "EscrowCancel",
      Account: wallet.classicAddress,
      Owner: owner,
      OfferSequence: sequence,
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
        `escrow cancel failed: ${result.result.meta.TransactionResult}`,
        500
      );
    }

    getDb()
      .prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?")
      .run(id);

    return apiSuccess({ status: "cancelled", txHash: signed.hash });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "escrow cancel failed";
    return apiError(msg, 500);
  }
}
