import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { listLaunches } from "@/db/repo/launches";
import { getClient } from "@/lib/xrpl/client";

// live LP positions for one wallet: account_lines against each AMM account.
// share of pool -> underlying token/xrp amounts, all straight from the ledger.
export async function GET(req: NextRequest) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !address.startsWith("r") || address.length < 25) {
    return apiError("address required");
  }

  try {
    const client = await getClient();
    const launches = listLaunches(50);
    const positions: unknown[] = [];

    // one account_lines call for the user covers every LP token they hold
    const linesResp = await client.request({
      command: "account_lines",
      account: address,
      ledger_index: "validated",
    });
    const lines = linesResp.result.lines as {
      account: string;
      currency: string;
      balance: string;
    }[];

    for (const launch of launches) {
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
        if (!amm) continue;

        const lp = amm.lp_token as {
          currency: string;
          issuer: string;
          value: string;
        };
        const line = lines.find(
          (l) => l.account === lp.issuer && l.currency === lp.currency
        );
        const lpBalance = line ? parseFloat(line.balance) : 0;
        if (lpBalance <= 0) continue;

        const lpSupply = parseFloat(lp.value);
        const share = lpSupply > 0 ? lpBalance / lpSupply : 0;

        let tokenBalance = 0;
        let xrpDrops = 0;
        for (const amt of [amm.amount, amm.amount2]) {
          if (typeof amt === "string") xrpDrops = Number(amt);
          else tokenBalance = parseFloat((amt as { value: string }).value);
        }

        positions.push({
          launchId: launch.id,
          ticker: launch.ticker,
          ammAccount: amm.account,
          tradingFee: amm.trading_fee,
          lpBalance,
          lpSupply,
          sharePct: share * 100,
          yourTokens: tokenBalance * share,
          yourXrpDrops: Math.floor(xrpDrops * share),
          poolTvlDrops: xrpDrops * 2,
        });
      } catch {
        // no pool for this launch — skip
      }
    }

    return apiSuccess({ address, positions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "positions lookup failed";
    return apiError(msg, 500);
  }
}
