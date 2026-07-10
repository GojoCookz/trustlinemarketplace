import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { logPlatformFee } from "@/db/repo/listings";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { getTreasuryAddress } from "@/lib/treasury";
import { tradingFee } from "@/lib/fees";
import { buildOfferCreate } from "@/lib/xrpl/transactions/offers";
import { Wallet, type SubmittableTransaction } from "xrpl";

const offerSchema = z.object({
  userId: z.string().min(1),
  launchId: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  tokenAmount: z.number().positive(),
  xrpAmount: z.number().positive().max(1_000_000),
  devSecret: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof offerSchema>;
  try {
    body = offerSchema.parse(await req.json());
  } catch {
    return apiError("userId, launchId, side, tokenAmount, xrpAmount required");
  }

  const launch = getLaunch(body.launchId);
  if (!launch) return apiError("launch not found", 404);

  if (!isDevMode()) {
    return apiError("xaman offer signing not yet implemented — use dev mode", 501);
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

    const xrpDrops = Math.round(body.xrpAmount * 1_000_000);

    // 0.3% routing fee on the XRP leg, paid to the treasury up front
    const feeDrops = tradingFee(xrpDrops);
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
      return apiError(`routing fee failed: ${feeMeta.TransactionResult}`, 500);
    }

    const offerTx = buildOfferCreate({
      account: wallet.classicAddress,
      side: body.side,
      currencyHex: launch.currency_hex,
      issuerAddress: launch.issuer_address,
      tokenAmount: body.tokenAmount.toString(),
      xrpDrops,
    });

    const prepared = await client.autofill(offerTx as unknown as SubmittableTransaction);
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

    logPlatformFee("trading", feeDrops, launch.id, body.userId, feeSigned.hash);

    return apiSuccess({
      offerTx: signed.hash,
      feeTx: feeSigned.hash,
      feeDrops,
      side: body.side,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "offer failed";
    return apiError(msg, 500);
  }
}
