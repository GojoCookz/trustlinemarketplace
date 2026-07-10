import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { buildOfferCancel } from "@/lib/xrpl/transactions/offers";
import { Wallet, type SubmittableTransaction } from "xrpl";

const cancelSchema = z.object({
  userId: z.string().min(1),
  offerSequence: z.number().int().positive(),
  devSecret: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof cancelSchema>;
  try {
    body = cancelSchema.parse(await req.json());
  } catch {
    return apiError("userId, offerSequence, devSecret required");
  }

  if (!isDevMode()) {
    return apiError("xaman offer cancel not yet implemented — use dev mode", 501);
  }
  if (!isTestnet()) {
    return apiError("dev signing only available on testnet", 403);
  }

  const user = getDb()
    .prepare("SELECT address FROM users WHERE id = ?")
    .get(body.userId) as { address: string | null } | undefined;
  if (!user?.address) return apiError("wallet not connected", 400);

  try {
    const client = await getClient();
    const wallet = Wallet.fromSeed(body.devSecret);
    if (wallet.classicAddress !== user.address) {
      return apiError("devSecret does not match wallet", 403);
    }

    const tx = buildOfferCancel({
      account: wallet.classicAddress,
      offerSequence: body.offerSequence,
    });

    const prepared = await client.autofill(tx as unknown as SubmittableTransaction);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    const meta = result.result.meta;
    if (
      typeof meta === "object" &&
      meta !== null &&
      "TransactionResult" in meta &&
      meta.TransactionResult !== "tesSUCCESS"
    ) {
      return apiError(`cancel failed: ${meta.TransactionResult}`, 500);
    }

    return apiSuccess({ cancelTx: signed.hash });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "cancel failed";
    return apiError(msg, 500);
  }
}
