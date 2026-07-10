import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getSellerRatings } from "@/db/repo/sellers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return apiError("seller id required");

  const reviews = getSellerRatings(id);
  return apiSuccess(reviews);
}
