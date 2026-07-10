import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getUser, setCustomReferralCode } from "@/db/repo/users";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { getTreasuryAddress } from "@/lib/treasury";
import { FEES, xrpToDrops } from "@/lib/fees";
import { logPlatformFee } from "@/db/repo/listings";
import { Wallet, type SubmittableTransaction } from "xrpl";

const upgradeSchema = z.object({
  userId: z.string().min(1),
  newCode: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, and underscores only"),
  devSecret: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof upgradeSchema>;
  try {
    body = upgradeSchema.parse(await req.json());
  } catch (e) {
    const msg =
      e instanceof z.ZodError ? e.issues[0]?.message : "invalid input";
    return apiError(msg ?? "invalid input");
  }

  if (!isDevMode()) {
    return apiError("xaman signing not yet implemented — use dev mode", 501);
  }
  if (!isTestnet()) {
    return apiError("dev signing only available on testnet", 403);
  }

  const user = getUser(body.userId);
  if (!user) return apiError("user not found", 404);
  if (user.custom_code === 1) {
    return apiError("already upgraded — code can only be customized once");
  }

  const userRow = getDb()
    .prepare("SELECT address FROM users WHERE id = ?")
    .get(body.userId) as { address: string | null } | undefined;
  if (!userRow?.address) return apiError("wallet not connected", 400);

  try {
    const client = await getClient();
    const wallet = Wallet.fromSeed(body.devSecret);
    if (wallet.classicAddress !== userRow.address) {
      return apiError("devSecret does not match wallet", 403);
    }

    const feeDrops = xrpToDrops(FEES.PREMIUM_CODE_XRP);
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
        `payment failed: ${feeMeta.TransactionResult}`,
        500
      );
    }

    const success = setCustomReferralCode(body.userId, body.newCode);
    if (!success) {
      return apiError("code already taken — pick another");
    }

    logPlatformFee(
      "custom_code",
      feeDrops,
      body.userId,
      body.userId,
      feeSigned.hash
    );

    return apiSuccess({
      newCode: body.newCode,
      feeTx: feeSigned.hash,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "upgrade failed";
    return apiError(msg, 500);
  }
}
