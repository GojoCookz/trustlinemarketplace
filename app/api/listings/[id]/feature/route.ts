import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getListing, logPlatformFee } from "@/db/repo/listings";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { getTreasuryAddress } from "@/lib/treasury";
import { FEES, xrpToDrops } from "@/lib/fees";
import { Wallet, type SubmittableTransaction } from "xrpl";

const featureSchema = z.object({
  userId: z.string().min(1),
  devSecret: z.string().min(1),
});

const FEATURE_DAYS = 7;

// Paid placement: 10 XRP pins the listing to the top of the market for 7 days.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listing = getListing(id);
  if (!listing) return apiError("listing not found", 404);

  let body: z.infer<typeof featureSchema>;
  try {
    body = featureSchema.parse(await req.json());
  } catch {
    return apiError("userId and devSecret required");
  }

  if (listing.seller_id !== body.userId) {
    return apiError("only the seller can feature a listing", 403);
  }

  const already = getDb()
    .prepare(
      "SELECT 1 FROM listings WHERE id = ? AND featured_until > datetime('now')"
    )
    .get(id);
  if (already) return apiError("listing is already featured");

  if (!isDevMode()) {
    return apiError("xaman feature payment not yet implemented — use dev mode", 501);
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

    const feeDrops = xrpToDrops(FEES.FEATURED_LISTING_XRP);
    const treasury = await getTreasuryAddress();

    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: wallet.classicAddress,
      Destination: treasury,
      Amount: feeDrops.toString(),
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
      return apiError(`payment failed: ${meta.TransactionResult}`, 500);
    }

    getDb()
      .prepare(
        `UPDATE listings SET featured_until = datetime('now', '+${FEATURE_DAYS} days') WHERE id = ?`
      )
      .run(id);

    logPlatformFee("featured_listing", feeDrops, id, body.userId, signed.hash);

    return apiSuccess({
      featuredDays: FEATURE_DAYS,
      txHash: signed.hash,
      feeXrp: FEES.FEATURED_LISTING_XRP,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "feature payment failed";
    return apiError(msg, 500);
  }
}
