import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { getTreasuryAddress } from "@/lib/treasury";
import { FEES, xrpToDrops } from "@/lib/fees";
import { logPlatformFee } from "@/db/repo/listings";
import { buildNftAcceptOffer } from "@/lib/xrpl/transactions/nfts";
import { Wallet, type SubmittableTransaction } from "xrpl";

const acceptSchema = z.object({
  userId: z.string().min(1),
  sellOfferId: z.string().optional(),
  buyOfferId: z.string().optional(),
  feeXrp: z.number().nonnegative().optional(),
  devSecret: z.string().min(1),
}).refine(
  (d) => d.sellOfferId || d.buyOfferId,
  { message: "provide sellOfferId or buyOfferId" }
);

export async function POST(req: NextRequest) {
  let body: z.infer<typeof acceptSchema>;
  try {
    body = acceptSchema.parse(await req.json());
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? e.issues[0]?.message
        : "invalid accept input";
    return apiError(msg ?? "invalid accept input");
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

    let feeTxHash: string | null = null;

    if (body.feeXrp && body.feeXrp > 0) {
      const feeDrops = xrpToDrops(body.feeXrp);
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
        return apiError(
          `fee payment failed: ${feeMeta.TransactionResult}`,
          500
        );
      }
      feeTxHash = feeSigned.hash;

      logPlatformFee(
        "nft_accept",
        feeDrops,
        body.sellOfferId ?? body.buyOfferId ?? "",
        body.userId,
        feeSigned.hash
      );
    }

    const acceptTx = buildNftAcceptOffer({
      account: wallet.classicAddress,
      nfTokenSellOffer: body.sellOfferId,
      nfTokenBuyOffer: body.buyOfferId,
    });

    const prepared = await client.autofill(
      acceptTx as unknown as SubmittableTransaction
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
      return apiError(`accept failed: ${meta.TransactionResult}`, 500);
    }

    return apiSuccess({
      acceptTx: signed.hash,
      feeTx: feeTxHash,
      sellOfferId: body.sellOfferId,
      buyOfferId: body.buyOfferId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "accept offer failed";
    return apiError(msg, 500);
  }
}
