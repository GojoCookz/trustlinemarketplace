import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getListing } from "@/db/repo/listings";
import { getSellerProfile } from "@/db/repo/sellers";
import { effectiveMarketplaceFee, dropsToXrp } from "@/lib/fees";
import type { VerificationTier } from "@/lib/fees";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listing = getListing(id);
  if (!listing) return apiError("listing not found", 404);

  const seller = getSellerProfile(listing.seller_id);
  const tier = (seller?.verification_tier ?? "anon") as VerificationTier;
  const feeBreakdown = effectiveMarketplaceFee(tier, listing.price_drops);

  return apiSuccess({
    ...listing,
    priceXrp: dropsToXrp(listing.price_drops),
    seller: seller
      ? {
          displayName: seller.display_name,
          tier: seller.verification_tier,
          rating: seller.avg_rating,
          totalSales: seller.total_sales,
          slug: seller.store_slug,
        }
      : null,
    fees: {
      platformFeeXrp: dropsToXrp(feeBreakdown.fee),
      sellerPayoutXrp: dropsToXrp(feeBreakdown.sellerPayout),
      feePct: `${(feeBreakdown.pct * 100).toFixed(1)}%`,
    },
  });
}
