import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { createLaunch, listLaunches } from "@/db/repo/launches";
import { logPlatformFee } from "@/db/repo/listings";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { getTreasuryAddress } from "@/lib/treasury";
import { FEES, xrpToDrops } from "@/lib/fees";
import { grantOnceXp } from "@/db/repo/participation";
import { XP_RULES } from "@/lib/participation/xp";
import {
  currencyCode,
  buildIssuerAccountSet,
  buildTrustSet,
  buildIssuancePayment,
} from "@/lib/xrpl/transactions/issuance";
import { Wallet, type Client, type SubmittableTransaction } from "xrpl";

const launchSchema = z.object({
  creatorId: z.string().min(1),
  name: z.string().min(1).max(40),
  ticker: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9]+$/, "ticker must be alphanumeric"),
  supply: z.number().int().positive().max(1_000_000_000_000),
  transferRatePct: z.number().min(0).max(5),
  description: z.string().max(300).optional(),
  imageUrl: z.string().url().max(300).optional(),
  devSecret: z.string().min(1),
});

async function submitOrThrow(
  client: Client,
  wallet: Wallet,
  tx: Record<string, unknown>,
  label: string
): Promise<string> {
  const prepared = await client.autofill(tx as unknown as SubmittableTransaction);
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  const meta = result.result.meta;
  if (
    typeof meta === "object" &&
    meta !== null &&
    "TransactionResult" in meta &&
    meta.TransactionResult !== "tesSUCCESS"
  ) {
    throw new Error(`${label} failed: ${meta.TransactionResult}`);
  }
  return signed.hash;
}

export async function GET() {
  return apiSuccess(listLaunches());
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof launchSchema>;
  try {
    body = launchSchema.parse(await req.json());
  } catch (e) {
    const msg =
      e instanceof z.ZodError ? e.issues[0]?.message : "invalid launch input";
    return apiError(msg ?? "invalid launch input");
  }

  if (body.ticker.toUpperCase() === "XRP") {
    return apiError("ticker XRP is reserved");
  }

  if (!isDevMode()) {
    return apiError("xaman launch signing not yet implemented — use dev mode", 501);
  }
  if (!isTestnet()) {
    return apiError("dev signing only available on testnet", 403);
  }

  const creator = getDb()
    .prepare("SELECT address FROM users WHERE id = ?")
    .get(body.creatorId) as { address: string | null } | undefined;
  if (!creator?.address) return apiError("creator wallet not connected", 400);

  try {
    const client = await getClient();
    const creatorWallet = Wallet.fromSeed(body.devSecret);
    if (creatorWallet.classicAddress !== creator.address) {
      return apiError("devSecret does not match creator wallet", 403);
    }

    // 1. fresh faucet-funded issuer account
    const { wallet: issuerWallet } = await client.fundWallet();
    const hex = currencyCode(body.ticker);
    const supplyStr = body.supply.toString();

    // 2. configure issuer: DefaultRipple + burn fee (TransferRate) + TickSize
    await submitOrThrow(
      client,
      issuerWallet,
      buildIssuerAccountSet({
        issuerAddress: issuerWallet.classicAddress,
        transferRatePct: body.transferRatePct,
      }),
      "issuer setup"
    );

    // 3. creator opens the trust line
    await submitOrThrow(
      client,
      creatorWallet,
      buildTrustSet({
        account: creatorWallet.classicAddress,
        issuerAddress: issuerWallet.classicAddress,
        currencyHex: hex,
        limit: supplyStr,
      }),
      "trust line"
    );

    // 4. issuer delivers the full supply to the creator
    const issueTx = await submitOrThrow(
      client,
      issuerWallet,
      buildIssuancePayment({
        issuerAddress: issuerWallet.classicAddress,
        destination: creatorWallet.classicAddress,
        currencyHex: hex,
        value: supplyStr,
      }),
      "supply issuance"
    );

    // 5. launch fee in XRP to the platform treasury
    const treasury = await getTreasuryAddress();
    const feeDrops = xrpToDrops(FEES.LAUNCH_XRP);
    const feeTx = await submitOrThrow(
      client,
      creatorWallet,
      {
        TransactionType: "Payment",
        Account: creatorWallet.classicAddress,
        Destination: treasury,
        Amount: feeDrops.toString(),
      },
      "launch fee"
    );

    const launch = createLaunch({
      creatorId: body.creatorId,
      name: body.name,
      ticker: body.ticker.toUpperCase(),
      currencyHex: hex,
      supply: supplyStr,
      transferRatePct: body.transferRatePct,
      description: body.description,
      imageUrl: body.imageUrl,
      issuerAddress: issuerWallet.classicAddress,
      issuerSeed: issuerWallet.seed, // REVIEW: testnet dev only — prod uses vault/KMS
      issueTx,
    });

    logPlatformFee("launch", feeDrops, launch.id, body.creatorId, feeTx);
    grantOnceXp(body.creatorId, "first_launch", XP_RULES.FIRST_LAUNCH, "launch");

    return apiSuccess({
      id: launch.id,
      issuerAddress: issuerWallet.classicAddress,
      issueTx,
      feeTx,
      ticker: launch.ticker,
      supply: supplyStr,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "launch failed";
    return apiError(msg, 500);
  }
}
