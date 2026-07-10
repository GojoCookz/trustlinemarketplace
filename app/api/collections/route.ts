import { apiSuccess } from "@/lib/api";
import {
  listCollections,
  collectionStats,
} from "@/db/repo/nft-collections";

export async function GET() {
  const collections = listCollections(50).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    imageUrl: c.image_url,
    issuerAddress: c.issuer_address,
    taxon: c.taxon,
    royaltyPct: c.royalty_pct,
    createdAt: c.created_at,
    stats: collectionStats(c.id),
  }));
  return apiSuccess(collections);
}
