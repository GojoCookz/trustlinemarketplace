import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { getTreasuryAddress } from "@/lib/treasury";
import { FEES, xrpToDrops } from "@/lib/fees";
import { logPlatformFee } from "@/db/repo/listings";
import { buildNftBuyOffer } from "@/lib/xrpl/transactions/nfts";
import { Wallet, type SubmittableTransaction } from "xrpl";

const offerSchema = z.object({
  userId: z.string().min(1),
  nftokenId: z.string().min(1),
  owner: z.string().min(1),
  xrpAmount: z.number().positive().max(1_000_000),
  devSecret: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof offerSchema>;
  try {
    body = offerSchema.parse(await req.json());
  } catch (e) {
    const msg =
      e instanceof z.ZodError ? e.issues[0]?.message : "invalid offer input";
    return apiError(msg ?? "invalid offer input");
  }

  if (!isDevMode()) {
    return apiError("xaman signing not yet implemented — use dev mode", 501);
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

    const offerDrops = xrpToDrops(body.xrpAmount);

    // 3% marketplace fee to treasury
    const feeDrops = Math.round(offerDrops * FEES.MARKETPLACE_PCT);
    const treasury = await getTreasuryAddress();
    const feePrepared = await client.autofill({
      TransactionType: "Payment",
      Account: wallet.classicAddress,
      Destination: treasury,
      Amount: feeDrops.toString(),
    } as unknown as SubmittableTransaction);
    const feeSigned = wallet.sign(feePrepared);
    const feeResult = await client.submitAndWait(feeSigned.tx_blob);
    const feeMeta = feeResult.result.meta;
    if (
      typeof feeMeta === "object" &&
      feeMeta !== null &&
      "TransactionResult" in feeMeta &&
      feeMeta.TransactionResult !== "tesSUCCESS"
    ) {
      return apiError(`fee payment failed: ${feeMeta.TransactionResult}`, 500);
    }

    const offerTx = buildNftBuyOffer({
      account: wallet.classicAddress,
      nftokenId: body.nftokenId,
      amountDrops: offerDrops,
      owner: body.owner,
    });

    const prepared = await client.autofill(
      offerTx as unknown as SubmittableTransaction
    );
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    const meta = result.result.meta;
    if (
      typeof meta === "object" &&
      meta !== null &&
      "TransactionResult" in meta &&
      meta.TransactionResult !== "tesSUCCESS"
    ) {
      return apiError(`offer failed: ${meta.TransactionResult}`, 500);
    }

    logPlatformFee(
      "nft_offer",
      feeDrops,
      body.nftokenId,
      body.userId,
      feeSigned.hash
    );

    return apiSuccess({
      offerTx: signed.hash,
      feeTx: feeSigned.hash,
      nftokenId: body.nftokenId,
      xrpAmount: body.xrpAmount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "offer failed";
    return apiError(msg, 500);
  }
}
