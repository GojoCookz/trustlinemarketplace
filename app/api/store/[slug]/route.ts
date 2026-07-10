import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getSellerBySlug, getSellerRatings } from "@/db/repo/sellers";
import { listListings } from "@/db/repo/listings";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const seller = getSellerBySlug(slug);
  if (!seller) return apiError("store not found", 404);

  const listings = listListings({
    sellerId: seller.user_id,
    status: "active",
    limit: 50,
  });

  const reviews = getSellerRatings(seller.user_id, 10);

  return apiSuccess({
    profile: {
      displayName: seller.display_name,
      bio: seller.bio,
      avatarUrl: seller.avatar_url,
      bannerUrl: seller.banner_url,
      category: seller.category,
      slug: seller.store_slug,
      tier: seller.verification_tier,
      totalSales: seller.total_sales,
      avgRating: seller.avg_rating,
      socialX: seller.social_x,
      socialDiscord: seller.social_discord,
      createdAt: seller.created_at,
    },
    listings,
    reviews,
  });
}
