import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { xrpToDrops } from "@/lib/fees";
import { buildNftSellOffer } from "@/lib/xrpl/transactions/nfts";
import { logNftActivity } from "@/db/repo/nft-collections";
import { Wallet, type SubmittableTransaction } from "xrpl";

const sellSchema = z.object({
  userId: z.string().min(1),
  nftokenId: z.string().min(1),
  xrpAmount: z.number().positive().max(1_000_000),
  destination: z.string().optional(),
  devSecret: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof sellSchema>;
  try {
    body = sellSchema.parse(await req.json());
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? e.issues[0]?.message
        : "invalid sell offer input";
    return apiError(msg ?? "invalid sell offer input");
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

    const sellTx = buildNftSellOffer({
      account: wallet.classicAddress,
      nftokenId: body.nftokenId,
      amountDrops: xrpToDrops(body.xrpAmount),
      destination: body.destination,
    });

    const prepared = await client.autofill(
      sellTx as unknown as SubmittableTransaction
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
      return apiError(`sell offer failed: ${meta.TransactionResult}`, 500);
    }

    logNftActivity({
      nftokenId: body.nftokenId,
      type: "sell_offer",
      priceDrops: xrpToDrops(body.xrpAmount),
      fromAddress: wallet.classicAddress,
      txHash: signed.hash,
    });

    return apiSuccess({
      offerTx: signed.hash,
      nftokenId: body.nftokenId,
      xrpAmount: body.xrpAmount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "sell offer failed";
    return apiError(msg, 500);
  }
}
