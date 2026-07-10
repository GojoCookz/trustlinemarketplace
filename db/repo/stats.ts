import { getDb } from "@/db";

export type PublicStats = {
  users: number;
  sellers: number;
  listings: number;
  orders: number;
  volumeDrops: number;
};

export type FeeRow = {
  id: number;
  fee_type: string;
  amount_drops: number;
  source_id: string | null;
  payer_id: string | null;
  tx_hash: string | null;
  created_at: string;
};

export type DisputedOrder = {
  id: string;
  listing_title: string;
  price_drops: number;
  buyer_id: string;
  seller_id: string;
  disputed_at: string | null;
};

export type AdminStats = PublicStats & {
  ordersByStatus: { status: string; count: number }[];
  feesByType: { type: string; total: number; count: number }[];
  totalFeesDrops: number;
  recentFees: FeeRow[];
  disputedOrders: DisputedOrder[];
};

function count(sql: string): number {
  const row = getDb().prepare(sql).get() as { n: number };
  return row.n;
}

export function publicStats(): PublicStats {
  const volume = getDb()
    .prepare(
      "SELECT COALESCE(SUM(price_drops), 0) as v FROM orders WHERE status IN ('escrowed', 'delivered', 'confirmed', 'disputed')"
    )
    .get() as { v: number };

  return {
    users: count("SELECT COUNT(*) as n FROM users"),
    sellers: count("SELECT COUNT(*) as n FROM seller_profiles"),
    listings: count("SELECT COUNT(*) as n FROM listings WHERE status = 'active'"),
    orders: count("SELECT COUNT(*) as n FROM orders"),
    volumeDrops: volume.v,
  };
}

export function adminStats(): AdminStats {
  const ordersByStatus = getDb()
    .prepare("SELECT status, COUNT(*) as count FROM orders GROUP BY status")
    .all() as { status: string; count: number }[];

  const feesByType = getDb()
    .prepare(
      "SELECT fee_type as type, COALESCE(SUM(amount_drops), 0) as total, COUNT(*) as count FROM platform_fees GROUP BY fee_type"
    )
    .all() as { type: string; total: number; count: number }[];

  const recentFees = getDb()
    .prepare("SELECT * FROM platform_fees ORDER BY created_at DESC LIMIT 20")
    .all() as FeeRow[];

  const disputedOrders = getDb()
    .prepare(
      `SELECT o.id, l.title as listing_title, o.price_drops, o.buyer_id, o.seller_id, o.disputed_at
       FROM orders o JOIN listings l ON l.id = o.listing_id
       WHERE o.status = 'disputed' ORDER BY o.disputed_at DESC LIMIT 20`
    )
    .all() as DisputedOrder[];

  return {
    ...publicStats(),
    ordersByStatus,
    feesByType,
    totalFeesDrops: feesByType.reduce((sum, f) => sum + f.total, 0),
    recentFees,
    disputedOrders,
  };
}
