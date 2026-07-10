import { apiSuccess, apiError } from "@/lib/api";
import { listLaunches } from "@/db/repo/launches";
import { getClient } from "@/lib/xrpl/client";

type PoolInfo = {
  launchId: string;
  ticker: string;
  currencyHex: string;
  issuerAddress: string;
  exists: boolean;
  ammAccount?: string;
  tokenBalance?: string;
  xrpBalance?: string;
  lpToken?: { currency: string; issuer: string; value: string };
  tradingFee?: number;
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
        currencyHex: launch.currency_hex,
        issuerAddress: launch.issuer_address,
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

          if (typeof tokenAmt === "string") {
            base.xrpBalance = (Number(tokenAmt) / 1_000_000).toFixed(6);
          } else {
            base.tokenBalance = tokenAmt.value;
          }

          if (typeof xrpAmt === "string") {
            base.xrpBalance = (Number(xrpAmt) / 1_000_000).toFixed(6);
          } else {
            base.tokenBalance = base.tokenBalance ?? xrpAmt.value;
          }
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
