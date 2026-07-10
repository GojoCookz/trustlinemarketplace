import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { getDb } from "@/db";
import { getClient } from "@/lib/xrpl/client";

// Rewards status: pool address, live ledger balance, distribution history.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const launch = getLaunch(id);
  if (!launch) return apiError("launch not found", 404);

  const pool = getDb()
    .prepare("SELECT address FROM reward_pools WHERE launch_id = ?")
    .get(id) as { address: string } | undefined;

  let poolBalanceDrops = 0;
  if (pool) {
    try {
      const client = await getClient();
      const info = await client.request({
        command: "account_info",
        account: pool.address,
      });
      poolBalanceDrops = parseInt(info.result.account_data.Balance, 10);
    } catch {
      // unfunded/deleted account — treat as zero
    }
  }

  const history = getDb()
    .prepare(
      "SELECT id, total_drops, holder_count, created_at FROM distributions WHERE launch_id = ? ORDER BY created_at DESC LIMIT 10"
    )
    .all(id) as {
    id: number;
    total_drops: number;
    holder_count: number;
    created_at: string;
  }[];

  return apiSuccess({
    poolAddress: pool?.address ?? null,
    poolBalanceDrops,
    history,
  });
}
