import { apiSuccess, apiError } from "@/lib/api";
import { listLaunches } from "@/db/repo/launches";
import { getClient } from "@/lib/xrpl/client";
import {
  indexPoolTrades,
  recordSnapshot,
  getPoolStats,
  type PoolStats,
} from "@/lib/marketdata";

type PoolInfo = {
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

export async function GET() {
  try {
    const launches = listLaunches(50);
    if (launches.length === 0) {
      return apiSuccess([]);
    }

    const client = await getClient();
    const pools: PoolInfo[] = [];

    for (const launch of launches) {
      const base: PoolInfo = {
        launchId: launch.id,
        ticker: launch.ticker,
        name: launch.name,
        currencyHex: launch.currency_hex,
        issuerAddress: launch.issuer_address,
        createdAt: launch.created_at,
        exists: false,
      };

      try {
        const resp = await client.request({
          command: "amm_info",
          asset: {
            currency: launch.currency_hex,
            issuer: launch.issuer_address,
          },
          asset2: { currency: "XRP" },
        });

        const amm = resp.result.amm;
        if (amm) {
          const tokenAmt = amm.amount as
            | string
            | { currency: string; issuer: string; value: string };
          const xrpAmt = amm.amount2 as
            | string
            | { currency: string; issuer: string; value: string };

          base.exists = true;
          base.ammAccount = amm.account;
          base.tradingFee = amm.trading_fee;
          base.lpToken = amm.lp_token as {
            currency: string;
            issuer: string;
            value: string;
          };

          let tokenBalance = 0;
          let xrpDrops = 0;
          for (const amt of [tokenAmt, xrpAmt]) {
            if (typeof amt === "string") {
              xrpDrops = Number(amt);
              base.xrpBalance = (xrpDrops / 1_000_000).toFixed(6);
            } else {
              tokenBalance = parseFloat(amt.value);
              base.tokenBalance = amt.value;
            }
          }

          // pool holds equal value both sides: TVL = 2x the XRP side
          base.tvlDrops = xrpDrops * 2;

          // real-data pipeline: sample spot price + pull new on-ledger swaps
          recordSnapshot(launch.id, tokenBalance, xrpDrops);
          try {
            await indexPoolTrades(launch, amm.account);
          } catch {
            // indexing is best-effort per request; next call retries
          }

          base.stats = getPoolStats(launch.id, amm.trading_fee, base.tvlDrops);
        }
      } catch {
        // amm_info throws if no pool exists — that's fine
      }

      pools.push(base);
    }

    return apiSuccess(pools);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "failed to query pools";
    return apiError(msg, 500);
  }
}
