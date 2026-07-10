// shared client-side types + formatters for the pools room

export type PoolStats = {
  priceXrp: number | null;
  priceChange24hPct: number | null;
  volume24hDrops: number;
  fees24hDrops: number;
  trades24h: number;
  aprPct: number | null;
  sparkline: number[];
};

export type PoolInfo = {
  launchId: string;
  ticker: string;
  name: string;
  currencyHex: string;
  issuerAddress: string;
  createdAt: string;
  exists: boolean;
  ammAccount?: string;
  tokenBalance?: string;
  xrpBalance?: string;
  lpToken?: { currency: string; issuer: string; value: string };
  tradingFee?: number;
  tvlDrops?: number;
  stats?: PoolStats;
};

export function formatNum(n: number | undefined | null): string {
  if (n === undefined || n === null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1) return n.toFixed(2);
  if (n === 0) return "0";
  return n.toFixed(6);
}

export function xrp(drops: number | undefined | null): string {
  return formatNum((drops ?? 0) / 1_000_000);
}

export function age(createdAt: string): string {
  const iso = createdAt.includes("T")
    ? createdAt
    : createdAt.replace(" ", "T") + "Z";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400_000);
  const hours = Math.floor((ms % 86400_000) / 3600_000);
  if (days > 30) return `${Math.floor(days / 30)}mo ${days % 30}d`;
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % 3600_000) / 60_000);
  return `${hours}h ${mins}m`;
}
