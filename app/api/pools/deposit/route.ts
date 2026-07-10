import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { xrpToDrops } from "@/lib/fees";
import { buildAmmDeposit } from "@/lib/xrpl/transactions/amm";
import { Wallet, type SubmittableTransaction } from "xrpl";

const depositSchema = z.object({
  userId: z.string().min(1),
  launchId: z.string().min(1),
  tokenAmount: z.number().positive(),
  xrpAmount: z.number().positive().max(100_000),
  devSecret: z.string().min(1),
});

// AMMDeposit flags
const TF_TWO_ASSET = 0x00100000;

export async function POST(req: NextRequest) {
  let body: z.infer<typeof depositSchema>;
  try {
    body = depositSchema.parse(await req.json());
  } catch (e) {
    const msg =
      e instanceof z.ZodError ? e.issues[0]?.message : "invalid deposit input";
    return apiError(msg ?? "invalid deposit input");
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

    const depositTx = buildAmmDeposit({
      account: wallet.classicAddress,
      asset: {
        currency: launch.currency_hex,
        issuer: launch.issuer_address,
      },
      asset2: { currency: "XRP" },
      amount: {
        currency: launch.currency_hex,
        issuer: launch.issuer_address,
        value: body.tokenAmount.toString(),
      },
      amount2: xrpToDrops(body.xrpAmount).toString(),
      flags: TF_TWO_ASSET,
    });

    const prepared = await client.autofill(
      depositTx as unknown as SubmittableTransaction
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
      return apiError(`deposit failed: ${meta.TransactionResult}`, 500);
    }

    return apiSuccess({
      depositTx: signed.hash,
      ticker: launch.ticker,
      tokenAmount: body.tokenAmount,
      xrpAmount: body.xrpAmount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "deposit failed";
    return apiError(msg, 500);
  }
}
