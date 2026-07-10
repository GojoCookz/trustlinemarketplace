import { getBalanceChanges } from "xrpl";
import { getDb } from "@/db";
import { getClient } from "@/lib/xrpl/client";
import type { Launch } from "@/db/repo/launches";

// Real market data only: pool_trades come from validated on-ledger
// transactions parsed via getBalanceChanges, price_snapshots from live
// amm_info reads. Nothing here is synthesized.

const RIPPLE_EPOCH_OFFSET = 946684800;
const SNAPSHOT_MIN_INTERVAL_SEC = 60;
const INDEX_MIN_INTERVAL_SEC = 20;
const MAX_PAGES_PER_RUN = 5;

type TradeSide = "buy" | "sell";

export type PoolStats = {
  priceXrp: number | null;
  priceChange24hPct: number | null;
  volume24hDrops: number;
  fees24hDrops: number;
  trades24h: number;
  aprPct: number | null;
  sparkline: number[];
};

export type Candle = {
  time: number; // unix seconds, bucket start
  open: number;
  high: number;
  low: number;
  close: number;
  volumeDrops: number;
};

function rippleToIso(rippleSeconds: number): string {
  return new Date((rippleSeconds + RIPPLE_EPOCH_OFFSET) * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// trade indexing

function getCursor(launchId: string, ammAccount: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT last_ledger, updated_at FROM indexer_cursors WHERE launch_id = ?")
    .get(launchId) as { last_ledger: number; updated_at: string | null } | undefined;
  if (row) return row;
  db.prepare(
    "INSERT INTO indexer_cursors (launch_id, amm_account, last_ledger) VALUES (?, ?, 0)"
  ).run(launchId, ammAccount);
  return { last_ledger: 0, updated_at: null };
}

function cursorIsFresh(updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  const age = Date.now() - new Date(updatedAt + "Z").getTime();
  return age < INDEX_MIN_INTERVAL_SEC * 1000;
}

const LIQUIDITY_TX_TYPES = new Set([
  "AMMCreate",
  "AMMDeposit",
  "AMMWithdraw",
  "AMMBid",
  "AMMVote",
  "AMMDelete",
]);

// Pull validated transactions touching the AMM account since the cursor and
// record every swap. A swap is any tx where the AMM's XRP and token balances
// moved in opposite directions.
export async function indexPoolTrades(
  launch: Launch,
  ammAccount: string
): Promise<number> {
  const db = getDb();
  const cursor = getCursor(launch.id, ammAccount);
  if (cursorIsFresh(cursor.updated_at)) return 0;

  const client = await getClient();
  let recorded = 0;
  let marker: unknown = undefined;
  let maxValidatedLedger = cursor.last_ledger;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO pool_trades
       (launch_id, tx_hash, ledger_index, side, token_amount, xrp_drops, price, executed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
    const resp = await client.request({
      command: "account_tx",
      account: ammAccount,
      ledger_index_min: cursor.last_ledger > 0 ? cursor.last_ledger + 1 : -1,
      ledger_index_max: -1,
      forward: true,
      limit: 200,
      ...(marker ? { marker } : {}),
    });

    const result = resp.result as unknown as {
      transactions: Array<Record<string, unknown>>;
      ledger_index_max?: number;
      marker?: unknown;
    };

    if (typeof result.ledger_index_max === "number") {
      maxValidatedLedger = Math.max(maxValidatedLedger, result.ledger_index_max);
    }

    for (const entry of result.transactions ?? []) {
      if (!entry.validated) continue;
      const meta = entry.meta;
      if (typeof meta !== "object" || meta === null) continue;

      // rippled api v2 nests tx under tx_json
      const txJson = (entry.tx_json ?? entry.tx) as
        | Record<string, unknown>
        | undefined;
      if (!txJson) continue;

      const txType = txJson.TransactionType as string;
      if (LIQUIDITY_TX_TYPES.has(txType)) continue;

      const hash = (entry.hash ?? txJson.hash) as string | undefined;
      const ledgerIndex = (entry.ledger_index ?? txJson.ledger_index ?? 0) as number;
      if (!hash) continue;

      let changes;
      try {
        changes = getBalanceChanges(meta as never);
      } catch {
        continue;
      }
      const ammChanges = changes.find((c) => c.account === ammAccount);
      if (!ammChanges) continue;

      const xrpChange = ammChanges.balances.find((b) => b.currency === "XRP");
      const tokenChange = ammChanges.balances.find(
        (b) =>
          b.currency === launch.currency_hex &&
          b.issuer === launch.issuer_address
      );
      if (!xrpChange || !tokenChange) continue;

      const xrpDelta = parseFloat(xrpChange.value);
      const tokenDelta = parseFloat(tokenChange.value);
      if (xrpDelta === 0 || tokenDelta === 0) continue;
      if (Math.sign(xrpDelta) === Math.sign(tokenDelta)) continue;

      // token left the pool -> someone bought the token
      const side: TradeSide = tokenDelta < 0 ? "buy" : "sell";
      const xrpDrops = Math.round(Math.abs(xrpDelta) * 1_000_000);
      const tokenAmount = Math.abs(tokenDelta);
      const price = Math.abs(xrpDelta) / tokenAmount;

      const closeTimeIso = entry.close_time_iso as string | undefined;
      const rippleDate = txJson.date as number | undefined;
      const executedAt = closeTimeIso
        ? new Date(closeTimeIso).toISOString()
        : rippleDate !== undefined
          ? rippleToIso(rippleDate)
          : new Date().toISOString();

      const res = insert.run(
        launch.id,
        hash,
        ledgerIndex,
        side,
        tokenAmount,
        xrpDrops,
        price,
        executedAt
      );
      recorded += res.changes;
    }

    marker = result.marker;
    if (!marker) break;
  }

  db.prepare(
    "UPDATE indexer_cursors SET last_ledger = ?, amm_account = ?, updated_at = datetime('now') WHERE launch_id = ?"
  ).run(maxValidatedLedger, ammAccount, launch.id);

  return recorded;
}

// ---------------------------------------------------------------------------
// price snapshots

export function recordSnapshot(
  launchId: string,
  tokenBalance: number,
  xrpDrops: number
) {
  if (tokenBalance <= 0 || xrpDrops <= 0) return;
  const db = getDb();
  const last = db
    .prepare(
      "SELECT taken_at FROM price_snapshots WHERE launch_id = ? ORDER BY id DESC LIMIT 1"
    )
    .get(launchId) as { taken_at: string } | undefined;
  if (last) {
    const age = Date.now() - new Date(last.taken_at + "Z").getTime();
    if (age < SNAPSHOT_MIN_INTERVAL_SEC * 1000) return;
  }
  const price = xrpDrops / 1_000_000 / tokenBalance;
  db.prepare(
    "INSERT INTO price_snapshots (launch_id, price, token_balance, xrp_drops) VALUES (?, ?, ?, ?)"
  ).run(launchId, price, tokenBalance, xrpDrops);
}

// ---------------------------------------------------------------------------
// derived stats

type PricePoint = { t: number; price: number; volumeDrops: number };

function pricePoints(launchId: string, sinceIso: string): PricePoint[] {
  const db = getDb();
  const trades = db
    .prepare(
      `SELECT strftime('%s', executed_at) AS t, price, xrp_drops AS v
       FROM pool_trades WHERE launch_id = ? AND executed_at >= ?`
    )
    .all(launchId, sinceIso) as { t: string; price: number; v: number }[];
  const snaps = db
    .prepare(
      `SELECT strftime('%s', taken_at) AS t, price, 0 AS v
       FROM price_snapshots WHERE launch_id = ? AND taken_at >= ?`
    )
    .all(launchId, sinceIso) as { t: string; price: number; v: number }[];
  return [...trades, ...snaps]
    .map((p) => ({ t: parseInt(p.t, 10), price: p.price, volumeDrops: p.v }))
    .sort((a, b) => a.t - b.t);
}

export function getPoolStats(
  launchId: string,
  tradingFee: number | undefined,
  tvlDrops: number | null
): PoolStats {
  const db = getDb();
  const dayAgoIso = new Date(Date.now() - 86400_000).toISOString();

  const vol = db
    .prepare(
      `SELECT COALESCE(SUM(xrp_drops), 0) AS v, COUNT(*) AS n
       FROM pool_trades WHERE launch_id = ? AND executed_at >= ?`
    )
    .get(launchId, dayAgoIso) as { v: number; n: number };

  // XLS-30 trading_fee is in units of 1/100000 (1000 = 1%)
  const feeFraction = (tradingFee ?? 0) / 100_000;
  const fees24hDrops = Math.round(vol.v * feeFraction);

  const points = pricePoints(launchId, dayAgoIso);
  const latest = db
    .prepare(
      `SELECT price FROM (
         SELECT price, executed_at AS t FROM pool_trades WHERE launch_id = ?
         UNION ALL
         SELECT price, taken_at AS t FROM price_snapshots WHERE launch_id = ?
       ) ORDER BY t DESC LIMIT 1`
    )
    .get(launchId, launchId) as { price: number } | undefined;

  const priceXrp = latest?.price ?? null;
  const first = points[0]?.price ?? null;
  const priceChange24hPct =
    priceXrp !== null && first !== null && first > 0
      ? ((priceXrp - first) / first) * 100
      : null;

  // hourly sparkline: last price per hour bucket over 24h
  const buckets = new Map<number, number>();
  for (const p of points) {
    buckets.set(Math.floor(p.t / 3600), p.price);
  }
  const sparkline = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, price]) => price);

  const aprPct =
    tvlDrops && tvlDrops > 0 ? (fees24hDrops / tvlDrops) * 365 * 100 : null;

  return {
    priceXrp,
    priceChange24hPct,
    volume24hDrops: vol.v,
    fees24hDrops,
    trades24h: vol.n,
    aprPct,
    sparkline,
  };
}

// ---------------------------------------------------------------------------
// candles

export function getCandles(
  launchId: string,
  intervalSec: number,
  windowSec: number
): Candle[] {
  const sinceIso = new Date(Date.now() - windowSec * 1000).toISOString();
  const points = pricePoints(launchId, sinceIso);
  if (points.length === 0) return [];

  const candles: Candle[] = [];
  let current: Candle | null = null;

  for (const p of points) {
    const bucket = Math.floor(p.t / intervalSec) * intervalSec;
    if (!current || current.time !== bucket) {
      // carry the previous close forward as the new open for continuity
      const open: number = current ? current.close : p.price;
      if (current) candles.push(current);
      current = {
        time: bucket,
        open,
        high: Math.max(open, p.price),
        low: Math.min(open, p.price),
        close: p.price,
        volumeDrops: p.volumeDrops,
      };
    } else {
      current.high = Math.max(current.high, p.price);
      current.low = Math.min(current.low, p.price);
      current.close = p.price;
      current.volumeDrops += p.volumeDrops;
    }
  }
  if (current) candles.push(current);
  return candles;
}

export function getRecentTrades(launchId: string, limit = 30) {
  return getDb()
    .prepare(
      `SELECT tx_hash, side, token_amount, xrp_drops, price, executed_at
       FROM pool_trades WHERE launch_id = ?
       ORDER BY executed_at DESC LIMIT ?`
    )
    .all(launchId, limit) as {
    tx_hash: string;
    side: TradeSide;
    token_amount: number;
    xrp_drops: number;
    price: number;
    executed_at: string;
  }[];
}
