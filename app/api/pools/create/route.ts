import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { logPlatformFee } from "@/db/repo/listings";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { getTreasuryAddress } from "@/lib/treasury";
import { FEES, xrpToDrops } from "@/lib/fees";
import { buildAmmCreate } from "@/lib/xrpl/transactions/amm";
import { Wallet, type SubmittableTransaction } from "xrpl";
import { grantOnceXp } from "@/db/repo/participation";
import { XP_RULES } from "@/lib/participation/xp";

const createSchema = z.object({
  userId: z.string().min(1),
  launchId: z.string().min(1),
  tokenAmount: z.number().positive(),
  xrpAmount: z.number().positive().max(100_000),
  tradingFee: z.number().int().min(0).max(1000),
  devSecret: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    const msg =
      e instanceof z.ZodError ? e.issues[0]?.message : "invalid pool input";
    return apiError(msg ?? "invalid pool input");
  }

  if (!isDevMode()) {
    return apiError("xaman signing not yet implemented — use dev mode", 501);
  }
  if (!isTestnet()) {
    return apiError("dev signing only available on testnet", 403);
  }

  const launch = getLaunch(body.launchId);
  if (!launch) return apiError("launch not found", 404);

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

    // Platform fee for pool creation (same as launch fee)
    const treasury = await getTreasuryAddress();
    const feeDrops = xrpToDrops(FEES.LAUNCH_XRP);
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

    const ammTx = buildAmmCreate({
      account: wallet.classicAddress,
      amount1: {
        currency: launch.currency_hex,
        issuer: launch.issuer_address,
        value: body.tokenAmount.toString(),
      },
      amount2: xrpToDrops(body.xrpAmount).toString(),
      tradingFee: body.tradingFee,
    });

    const prepared = await client.autofill(
      ammTx as unknown as SubmittableTransaction
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
      return apiError(
        `pool creation failed: ${meta.TransactionResult}`,
        500
      );
    }

    logPlatformFee(
      "pool_create",
      feeDrops,
      body.launchId,
      body.userId,
      feeSigned.hash
    );
    grantOnceXp(body.userId, "first_pool", XP_RULES.FIRST_POOL, "pools");

    return apiSuccess({
      ammTx: signed.hash,
      feeTx: feeSigned.hash,
      ticker: launch.ticker,
      tokenAmount: body.tokenAmount,
      xrpAmount: body.xrpAmount,
      tradingFee: body.tradingFee,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "pool creation failed";
    return apiError(msg, 500);
  }
}
