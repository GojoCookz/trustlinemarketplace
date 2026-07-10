import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { getClient } from "@/lib/xrpl/client";

type IssuerLine = { account: string; balance: string };

// Holder distribution straight from the ledger: the issuer's trust lines
// carry negative balances for tokens it has issued. This read is the exact
// input the future XRP distributor bot will use for pro-rata payouts.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const launch = getLaunch(id);
  if (!launch) return apiError("launch not found", 404);

  try {
    const client = await getClient();
    const res = await client.request({
      command: "account_lines",
      account: launch.issuer_address,
      limit: 400,
    });

    const supply = parseFloat(launch.supply);
    const holders = (res.result.lines as IssuerLine[])
      .map((l) => ({ address: l.account, balance: -parseFloat(l.balance) }))
      .filter((h) => h.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .map((h) => ({
        ...h,
        pct: supply > 0 ? (h.balance / supply) * 100 : 0,
      }));

    return apiSuccess({
      ticker: launch.ticker,
      supply: launch.supply,
      holderCount: holders.length,
      topHolders: holders.slice(0, 10),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "holders lookup failed";
    return apiError(msg, 500);
  }
}
