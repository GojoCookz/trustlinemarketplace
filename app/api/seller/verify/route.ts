import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getSellerProfile, upgradeVerification } from "@/db/repo/sellers";
import { logPlatformFee } from "@/db/repo/listings";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { getTreasuryAddress } from "@/lib/treasury";
import { FEES, xrpToDrops } from "@/lib/fees";
import { Wallet } from "xrpl";

const verifySchema = z.object({
  userId: z.string().min(1),
  devSecret: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof verifySchema>;
  try {
    body = verifySchema.parse(await req.json());
  } catch {
    return apiError("userId required");
  }

  const seller = getSellerProfile(body.userId);
  if (!seller) return apiError("seller profile not found", 404);

  if (seller.verification_tier !== "anon") {
    return apiError(`already ${seller.verification_tier} — no upgrade needed`);
  }

  const feeDrops = xrpToDrops(FEES.VERIFICATION_XRP);

  if (!isDevMode()) {
    return apiError("xaman verification payment not yet implemented — use dev mode", 501);
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

    const destination = await getTreasuryAddress();

    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: wallet.classicAddress,
      Destination: destination,
      Amount: feeDrops.toString(),
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
        `payment failed: ${result.result.meta.TransactionResult}`,
        500
      );
    }

    upgradeVerification(body.userId, "verified");

    logPlatformFee(
      "verification",
      feeDrops,
      body.userId,
      body.userId,
      signed.hash
    );

    return apiSuccess({
      tier: "verified",
      txHash: signed.hash,
      feeXrp: FEES.VERIFICATION_XRP,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "verification payment failed";
    return apiError(msg, 500);
  }
}
