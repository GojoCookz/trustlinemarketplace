import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getSellerProfile, getSellerRatings } from "@/db/repo/sellers";
import { VERIFICATION_TIERS } from "@/lib/fees";
import type { VerificationTier } from "@/lib/fees";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const profile = getSellerProfile(id);
  if (!profile) return apiError("seller not found", 404);

  const tier = VERIFICATION_TIERS[profile.verification_tier as VerificationTier];
  const ratings = getSellerRatings(id, 10);

  return apiSuccess({
    ...profile,
    tierInfo: tier,
    recentRatings: ratings,
  });
}
