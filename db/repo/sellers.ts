import { getDb } from "@/db";
import type { VerificationTier } from "@/lib/fees";

export type SellerProfile = {
  user_id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  category: string;
  store_slug: string | null;
  social_x: string | null;
  social_discord: string | null;
  verification_tier: VerificationTier;
  verified_at: string | null;
  total_sales: number;
  total_revenue_drops: number;
  avg_rating: number;
  created_at: string;
};

export function createSellerProfile(
  userId: string,
  displayName: string,
  opts: {
    bio?: string;
    avatarUrl?: string;
    category?: string;
    storeSlug?: string;
  } = {}
): SellerProfile {
  const db = getDb();

  let slug = opts.storeSlug ?? displayName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
  const existing = db.prepare("SELECT 1 FROM seller_profiles WHERE store_slug = ?").get(slug);
  if (existing) slug = `${slug}${Date.now().toString(36).slice(-4)}`;

  db.prepare(
    `INSERT INTO seller_profiles (user_id, display_name, bio, category, store_slug)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, displayName, opts.bio ?? null, opts.category ?? "general", slug);

  return getSellerProfile(userId)!;
}

export function getSellerProfile(userId: string): SellerProfile | undefined {
  return getDb()
    .prepare("SELECT * FROM seller_profiles WHERE user_id = ?")
    .get(userId) as SellerProfile | undefined;
}

export function getSellerBySlug(slug: string): SellerProfile | undefined {
  return getDb()
    .prepare("SELECT * FROM seller_profiles WHERE store_slug = ?")
    .get(slug) as SellerProfile | undefined;
}

export function updateSellerProfile(
  userId: string,
  fields: Partial<Pick<SellerProfile, "display_name" | "bio" | "avatar_url" | "banner_url" | "category" | "social_x" | "social_discord">>
) {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return;
  values.push(userId);
  db.prepare(`UPDATE seller_profiles SET ${sets.join(", ")} WHERE user_id = ?`).run(...values);
}

export function upgradeVerification(userId: string, tier: VerificationTier) {
  getDb()
    .prepare("UPDATE seller_profiles SET verification_tier = ?, verified_at = datetime('now') WHERE user_id = ?")
    .run(tier, userId);
}

export function incrementSales(userId: string, revenueDrops: number) {
  getDb()
    .prepare(
      `UPDATE seller_profiles
       SET total_sales = total_sales + 1,
           total_revenue_drops = total_revenue_drops + ?
       WHERE user_id = ?`
    )
    .run(revenueDrops, userId);
}

export function updateAvgRating(userId: string) {
  const row = getDb()
    .prepare("SELECT AVG(stars) as avg FROM seller_ratings WHERE seller_id = ?")
    .get(userId) as { avg: number | null };
  if (row.avg !== null) {
    getDb()
      .prepare("UPDATE seller_profiles SET avg_rating = ? WHERE user_id = ?")
      .run(Math.round(row.avg * 10) / 10, userId);
  }
}

export function getSellerRatings(userId: string, limit = 20) {
  return getDb()
    .prepare(
      `SELECT r.stars, r.comment, r.created_at, u.referral_code as buyer_code
       FROM seller_ratings r
       JOIN users u ON u.id = r.buyer_id
       WHERE r.seller_id = ?
       ORDER BY r.created_at DESC LIMIT ?`
    )
    .all(userId, limit) as { stars: number; comment: string | null; created_at: string; buyer_code: string }[];
}
