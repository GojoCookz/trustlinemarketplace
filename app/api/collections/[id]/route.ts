import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import {
  getCollection,
  collectionStats,
  listItems,
  listActivity,
} from "@/db/repo/nft-collections";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const collection = getCollection(id);
  if (!collection) return apiError("collection not found", 404);

  return apiSuccess({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    imageUrl: collection.image_url,
    issuerAddress: collection.issuer_address,
    taxon: collection.taxon,
    royaltyPct: collection.royalty_pct,
    createdAt: collection.created_at,
    stats: collectionStats(collection.id),
    items: listItems(collection.id).map((i) => ({
      nftokenId: i.nftoken_id,
      name: i.name,
      imageUrl: i.image_url,
      ownerAddress: i.owner_address,
      serial: i.serial,
      mintTx: i.mint_tx,
      createdAt: i.created_at,
    })),
    activity: listActivity(collection.id).map((a) => ({
      nftokenId: a.nftoken_id,
      itemName: a.item_name,
      type: a.type,
      priceDrops: a.price_drops,
      txHash: a.tx_hash,
      createdAt: a.created_at,
    })),
  });
}
