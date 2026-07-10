import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { createListing, listListings } from "@/db/repo/listings";
import { getSellerProfile } from "@/db/repo/sellers";
import { xrpToDrops } from "@/lib/fees";

const createSchema = z.object({
  sellerId: z.string().min(1),
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(2000),
  category: z.enum(["digital", "physical", "services", "tokens"]),
  priceXrp: z.number().positive().max(1_000_000),
  imageUrls: z.array(z.string().url()).max(5).optional(),
  escrowType: z.enum(["time_locked", "conditional"]).optional(),
  deliveryDays: z.number().int().min(1).max(30).optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return apiError("invalid listing data");
  }

  const seller = getSellerProfile(body.sellerId);
  if (!seller) return apiError("set up your seller profile first", 403);

  const listing = createListing(
    body.sellerId,
    body.title,
    body.description,
    body.category,
    xrpToDrops(body.priceXrp),
    {
      imageUrls: body.imageUrls,
      escrowType: body.escrowType,
      deliveryDays: body.deliveryDays,
    }
  );

  return apiSuccess(listing);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category") ?? undefined;
  const search = url.searchParams.get("q") ?? undefined;
  const sellerId = url.searchParams.get("seller") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const listings = listListings({ category, search, sellerId, limit, offset });

  return apiSuccess(listings);
}
