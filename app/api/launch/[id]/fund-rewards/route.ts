import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { Wallet, type SubmittableTransaction } from "xrpl";

const fundSchema = z.object({
  userId: z.string().min(1),
  xrpAmount: z.number().positive().max(100_000),
  devSecret: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const launch = getLaunch(id);
  if (!launch) return apiError("launch not found", 404);

  let body: z.infer<typeof fundSchema>;
  try {
    body = fundSchema.parse(await req.json());
  } catch {
    return apiError("userId, xrpAmount, devSecret required");
  }

  if (launch.creator_id !== body.userId) {
    return apiError("only the creator can fund rewards", 403);
  }

  if (!isDevMode()) {
    return apiError("xaman funding not yet implemented — use dev mode", 501);
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

    // lazily create the pool wallet on first funding
    let pool = getDb()
      .prepare("SELECT address FROM reward_pools WHERE launch_id = ?")
      .get(id) as { address: string } | undefined;

    if (!pool) {
      const funded = await client.fundWallet();
      getDb()
        .prepare(
          "INSERT INTO reward_pools (launch_id, address, seed) VALUES (?, ?, ?)"
        )
        .run(id, funded.wallet.classicAddress, funded.wallet.seed);
      pool = { address: funded.wallet.classicAddress };
    }

    const drops = Math.round(body.xrpAmount * 1_000_000);
    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: wallet.classicAddress,
      Destination: pool.address,
      Amount: drops.toString(),
    } as unknown as SubmittableTransaction);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    const meta = result.result.meta;
    if (
      typeof meta === "object" &&
      meta !== null &&
      "TransactionResult" in meta &&
      meta.TransactionResult !== "tesSUCCESS"
    ) {
      return apiError(`funding failed: ${meta.TransactionResult}`, 500);
    }

    return apiSuccess({
      poolAddress: pool.address,
      fundTx: signed.hash,
      drops,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "funding failed";
    return apiError(msg, 500);
  }
}
