// Phase 1: all fees in XRP (drops). 1 XRP = 1,000,000 drops.
// "xrp going to 5" — fees are % based so they scale with price.

export const DROPS_PER_XRP = 1_000_000;

export const FEES = {
  MARKETPLACE_PCT: 0.03,
  TRADING_PCT: 0.003,
  VERIFICATION_XRP: 5,
  PREMIUM_CODE_XRP: 1,
  FEATURED_LISTING_XRP: 10,
  PREMIUM_STORE_XRP: 10,
  LAUNCH_XRP: 10,
  NFT_MINT_XRP: 1,
} as const;

export function marketplaceFee(priceDrops: number): {
  fee: number;
  sellerPayout: number;
} {
  const fee = Math.ceil(priceDrops * FEES.MARKETPLACE_PCT);
  return { fee, sellerPayout: priceDrops - fee };
}

export function tradingFee(amountDrops: number): number {
  return Math.ceil(amountDrops * FEES.TRADING_PCT);
}

export function xrpToDrops(xrp: number): number {
  return Math.round(xrp * DROPS_PER_XRP);
}

export function dropsToXrp(drops: number): number {
  return drops / DROPS_PER_XRP;
}

export function formatXrp(drops: number): string {
  const xrp = dropsToXrp(drops);
  if (xrp >= 1000) return `${(xrp / 1000).toFixed(1)}k xrp`;
  if (xrp >= 1) return `${xrp.toFixed(2)} xrp`;
  return `${xrp.toFixed(6)} xrp`;
}

export const VERIFICATION_TIERS = {
  anon: { label: "anon", minSales: 0, minRating: 0, feePct: FEES.MARKETPLACE_PCT },
  verified: { label: "verified", minSales: 0, minRating: 0, feePct: 0.028 },
  trusted: { label: "trusted", minSales: 10, minRating: 4.5, feePct: 0.025 },
  elite: { label: "elite", minSales: 100, minRating: 4.8, feePct: 0.02 },
} as const;

export type VerificationTier = keyof typeof VERIFICATION_TIERS;

export function effectiveMarketplaceFee(tier: VerificationTier, priceDrops: number): {
  fee: number;
  sellerPayout: number;
  pct: number;
} {
  const pct = VERIFICATION_TIERS[tier].feePct;
  const fee = Math.ceil(priceDrops * pct);
  return { fee, sellerPayout: priceDrops - fee, pct };
}
