import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet, getClient } from "@/lib/xrpl/client";
import { getTreasuryAddress } from "@/lib/treasury";
import { FEES, xrpToDrops } from "@/lib/fees";
import { logPlatformFee } from "@/db/repo/listings";
import { buildNftMint } from "@/lib/xrpl/transactions/nfts";
import {
  createCollection,
  getCollection,
  insertItem,
  logNftActivity,
} from "@/db/repo/nft-collections";
import { grantOnceXp } from "@/db/repo/participation";
import { XP_RULES } from "@/lib/participation/xp";
import { Wallet, type SubmittableTransaction } from "xrpl";

const mintSchema = z
  .object({
    userId: z.string().min(1),
    name: z.string().min(1).max(80),
    imageUrl: z.string().url().max(200).optional(),
    collectionId: z.string().optional(),
    newCollection: z
      .object({
        name: z.string().min(1).max(60),
        description: z.string().max(500).optional(),
        imageUrl: z.string().url().max(200).optional(),
        royaltyPct: z.number().min(0).max(50).optional(),
      })
      .optional(),
    devSecret: z.string().min(1),
  })
  .refine((d) => d.collectionId || d.newCollection, {
    message: "provide collectionId or newCollection",
  });

export async function POST(req: NextRequest) {
  let body: z.infer<typeof mintSchema>;
  try {
    body = mintSchema.parse(await req.json());
  } catch (e) {
    const msg =
      e instanceof z.ZodError ? e.issues[0]?.message : "invalid mint input";
    return apiError(msg ?? "invalid mint input");
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

    // resolve or create the collection — minting only into your own
    let collection = body.collectionId
      ? getCollection(body.collectionId)
      : undefined;
    if (body.collectionId && !collection) {
      return apiError("collection not found", 404);
    }
    if (collection && collection.issuer_address !== wallet.classicAddress) {
      return apiError("you can only mint into your own collection", 403);
    }
    if (!collection && body.newCollection) {
      collection = createCollection({
        creatorId: body.userId,
        name: body.newCollection.name,
        description: body.newCollection.description,
        imageUrl: body.newCollection.imageUrl ?? body.imageUrl,
        issuerAddress: wallet.classicAddress,
        royaltyPct: body.newCollection.royaltyPct ?? 0,
      });
    }
    if (!collection) return apiError("no collection resolved");

    // 1 xrp mint fee to treasury
    const feeDrops = xrpToDrops(FEES.NFT_MINT_XRP);
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
      return apiError(`fee payment failed: ${feeMeta.TransactionResult}`, 500);
    }

    // on-ledger mint
    const mintTx = buildNftMint({
      account: wallet.classicAddress,
      taxon: collection.taxon,
      uri: body.imageUrl,
      transferFee: Math.round(collection.royalty_pct * 1000),
    });
    const prepared = await client.autofill(
      mintTx as unknown as SubmittableTransaction
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
      return apiError(`mint failed: ${meta.TransactionResult}`, 500);
    }

    // rippled >= 1.11 returns the minted id in meta
    const nftokenId =
      typeof meta === "object" && meta !== null && "nftoken_id" in meta
        ? (meta.nftoken_id as string)
        : null;
    if (!nftokenId) {
      return apiError("mint succeeded but nftoken_id missing from meta", 500);
    }

    insertItem({
      nftokenId,
      collectionId: collection.id,
      name: body.name,
      imageUrl: body.imageUrl,
      minterId: body.userId,
      ownerAddress: wallet.classicAddress,
      mintTx: signed.hash,
    });
    logNftActivity({
      nftokenId,
      collectionId: collection.id,
      type: "mint",
      toAddress: wallet.classicAddress,
      txHash: signed.hash,
    });
    logPlatformFee("nft_mint", feeDrops, nftokenId, body.userId, feeSigned.hash);
    grantOnceXp(body.userId, "first_nft_mint", XP_RULES.FIRST_NFT_MINT, "nfts");

    return apiSuccess({
      nftokenId,
      mintTx: signed.hash,
      feeTx: feeSigned.hash,
      collectionId: collection.id,
      taxon: collection.taxon,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "mint failed";
    return apiError(msg, 500);
  }
}
