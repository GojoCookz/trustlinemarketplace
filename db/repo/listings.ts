import { getDb } from "@/db";
import { randomUUID } from "crypto";
import { marketplaceFee } from "@/lib/fees";

export type Listing = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  category: string;
  price_drops: number;
  currency: string;
  image_urls: string;
  status: string;
  escrow_type: string;
  delivery_days: number;
  total_sold: number;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  price_drops: number;
  platform_fee_drops: number;
  seller_payout_drops: number;
  status: string;
  escrow_tx: string | null;
  release_tx: string | null;
  created_at: string;
  confirmed_at: string | null;
  disputed_at: string | null;
};

export function createListing(
  sellerId: string,
  title: string,
  description: string,
  category: string,
  priceDrops: number,
  opts: {
    imageUrls?: string[];
    escrowType?: string;
    deliveryDays?: number;
  } = {}
): Listing {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO listings (id, seller_id, title, description, category, price_drops, image_urls, escrow_type, delivery_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      sellerId,
      title,
      description,
      category,
      priceDrops,
      JSON.stringify(opts.imageUrls ?? []),
      opts.escrowType ?? "time_locked",
      opts.deliveryDays ?? 7
    );
  return getListing(id)!;
}

export function getListing(id: string): Listing | undefined {
  return getDb().prepare("SELECT * FROM listings WHERE id = ?").get(id) as Listing | undefined;
}

export function listListings(opts: {
  category?: string;
  status?: string;
  sellerId?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.status) {
    conditions.push("l.status = ?");
    params.push(opts.status);
  } else {
    conditions.push("l.status = 'active'");
  }

  if (opts.category && opts.category !== "all") {
    conditions.push("l.category = ?");
    params.push(opts.category);
  }

  if (opts.sellerId) {
    conditions.push("l.seller_id = ?");
    params.push(opts.sellerId);
  }

  if (opts.search) {
    conditions.push("(l.title LIKE ? OR l.description LIKE ?)");
    const term = `%${opts.search}%`;
    params.push(term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);

  return getDb()
    .prepare(
      `SELECT l.*,
         sp.display_name as seller_name, sp.verification_tier, sp.avg_rating as seller_rating,
         CASE WHEN l.featured_until > datetime('now') THEN 1 ELSE 0 END as is_featured
       FROM listings l
       LEFT JOIN seller_profiles sp ON sp.user_id = l.seller_id
       ${where}
       ORDER BY is_featured DESC, l.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params) as (Listing & {
    seller_name: string;
    verification_tier: string;
    seller_rating: number;
    is_featured: number;
  })[];
}

export function createOrder(listingId: string, buyerId: string): Order {
  const listing = getListing(listingId);
  if (!listing) throw new Error("listing not found");

  const { fee, sellerPayout } = marketplaceFee(listing.price_drops);
  const id = randomUUID();

  getDb()
    .prepare(
      `INSERT INTO orders (id, listing_id, buyer_id, seller_id, price_drops, platform_fee_drops, seller_payout_drops)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, listingId, buyerId, listing.seller_id, listing.price_drops, fee, sellerPayout);

  return getOrder(id)!;
}

export function getOrder(id: string): Order | undefined {
  return getDb().prepare("SELECT * FROM orders WHERE id = ?").get(id) as Order | undefined;
}

export function updateOrderStatus(id: string, status: string) {
  getDb().prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
}

export function listOrders(userId: string, role: "buyer" | "seller" | "all" = "all") {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (role === "buyer") {
    conditions.push("o.buyer_id = ?");
    params.push(userId);
  } else if (role === "seller") {
    conditions.push("o.seller_id = ?");
    params.push(userId);
  } else {
    conditions.push("(o.buyer_id = ? OR o.seller_id = ?)");
    params.push(userId, userId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return getDb()
    .prepare(
      `SELECT o.*, l.title as listing_title, l.category as listing_category
       FROM orders o
       JOIN listings l ON l.id = o.listing_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT 50`
    )
    .all(...params) as (Order & { listing_title: string; listing_category: string })[];
}

export function logPlatformFee(
  feeType: string,
  amountDrops: number,
  sourceId: string | null,
  payerId: string | null,
  txHash: string | null
) {
  getDb()
    .prepare(
      "INSERT INTO platform_fees (fee_type, amount_drops, source_id, payer_id, tx_hash) VALUES (?, ?, ?, ?, ?)"
    )
    .run(feeType, amountDrops, sourceId, payerId, txHash);
}

export function totalPlatformFees(): { type: string; total: number; count: number }[] {
  return getDb()
    .prepare(
      "SELECT fee_type as type, SUM(amount_drops) as total, COUNT(*) as count FROM platform_fees GROUP BY fee_type"
    )
    .all() as { type: string; total: number; count: number }[];
}
