import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { getClient } from "@/lib/xrpl/client";

// Reads the caller's LP token balance straight from their trust lines with
// the AMM account, plus their share of the pool.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const launchId = url.searchParams.get("launchId");
  const address = url.searchParams.get("address");
  if (!launchId || !address) {
    return apiError("launchId and address are required");
  }
  if (!address.startsWith("r") || address.length < 25) {
    return apiError("invalid xrpl address");
  }

  const launch = getLaunch(launchId);
  if (!launch) return apiError("launch not found", 404);

  try {
    const client = await getClient();

    const ammResp = await client.request({
      command: "amm_info",
      asset: { currency: launch.currency_hex, issuer: launch.issuer_address },
      asset2: { currency: "XRP" },
    });
    const amm = ammResp.result.amm;
    if (!amm) return apiError("no pool for this token", 404);

    const lpToken = amm.lp_token as {
      currency: string;
      issuer: string;
      value: string;
    };
    const lpSupply = parseFloat(lpToken.value);

    let xrpDrops = 0;
    for (const amt of [amm.amount, amm.amount2]) {
      if (typeof amt === "string") xrpDrops = Number(amt);
    }

    let lpBalance = 0;
    try {
      const lines = await client.request({
        command: "account_lines",
        account: address,
        peer: amm.account,
      });
      for (const line of lines.result.lines) {
        if (line.currency === lpToken.currency) {
          lpBalance = Math.abs(parseFloat(line.balance));
        }
      }
    } catch {
      // account may have no trust lines with the AMM — zero position
    }

    const sharePct = lpSupply > 0 ? (lpBalance / lpSupply) * 100 : 0;
    const valueDrops = Math.round((sharePct / 100) * xrpDrops * 2);

    return apiSuccess({
      lpBalance,
      lpSupply,
      sharePct,
      valueDrops,
      ammAccount: amm.account,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "position lookup failed";
    return apiError(msg, 500);
  }
}
