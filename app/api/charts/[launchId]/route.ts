import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { getClient } from "@/lib/xrpl/client";
import {
  indexPoolTrades,
  recordSnapshot,
  getCandles,
  getPoolStats,
  getRecentTrades,
} from "@/lib/marketdata";

// interval presets: label -> [bucket seconds, window seconds]
const INTERVALS: Record<string, [number, number]> = {
  "1m": [60, 6 * 3600],
  "5m": [300, 24 * 3600],
  "15m": [900, 3 * 86400],
  "1h": [3600, 7 * 86400],
  "4h": [14400, 30 * 86400],
  "1d": [86400, 180 * 86400],
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ launchId: string }> }
) {
  const { launchId } = await params;
  const launch = getLaunch(launchId);
  if (!launch) return apiError("launch not found", 404);

  const url = new URL(req.url);
  const intervalKey = url.searchParams.get("interval") ?? "5m";
  const preset = INTERVALS[intervalKey];
  if (!preset) {
    return apiError(`invalid interval — use ${Object.keys(INTERVALS).join(", ")}`);
  }
  const [bucketSec, windowSec] = preset;

  // refresh from the ledger before answering so the chart is current
  let tradingFee: number | undefined;
  let tvlDrops: number | null = null;
  try {
    const client = await getClient();
    const resp = await client.request({
      command: "amm_info",
      asset: { currency: launch.currency_hex, issuer: launch.issuer_address },
      asset2: { currency: "XRP" },
    });
    const amm = resp.result.amm;
    if (amm) {
      tradingFee = amm.trading_fee;
      let tokenBalance = 0;
      let xrpDrops = 0;
      for (const amt of [amm.amount, amm.amount2]) {
        if (typeof amt === "string") xrpDrops = Number(amt);
        else tokenBalance = parseFloat((amt as { value: string }).value);
      }
      tvlDrops = xrpDrops * 2;
      recordSnapshot(launch.id, tokenBalance, xrpDrops);
      try {
        await indexPoolTrades(launch, amm.account);
      } catch {
        // best-effort; candles still serve from recorded data
      }
    }
  } catch {
    // no pool yet — serve whatever trade history exists (e.g. from the dex book)
  }

  const candles = getCandles(launch.id, bucketSec, windowSec);
  const stats = getPoolStats(launch.id, tradingFee, tvlDrops);
  const trades = getRecentTrades(launch.id, 30);

  return apiSuccess({
    launchId: launch.id,
    ticker: launch.ticker,
    interval: intervalKey,
    candles,
    stats,
    trades,
  });
}
