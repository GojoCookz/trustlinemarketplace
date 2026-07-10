import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { getDb } from "@/db";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet } from "@/lib/xrpl/client";
import { runDistribution } from "@/lib/distributor";

type DueRow = {
  launch_id: string;
  amount_drops: number;
};

// The crank tick: pays every launch whose auto-distribute is due.
// Dev mode: open (testnet playground). Prod: Vercel Cron / external
// scheduler must send x-cron-key matching CRON_SECRET env.
export async function POST(req: NextRequest) {
  if (!isDevMode()) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("x-cron-key") !== secret) {
      return apiError("unauthorized", 401);
    }
  }
  if (!isTestnet()) {
    return apiError("distributor only runs on testnet for now", 403);
  }

  const due = getDb()
    .prepare(
      `SELECT launch_id, amount_drops FROM auto_distribute
       WHERE enabled = 1
         AND (last_run_at IS NULL
              OR datetime(last_run_at, '+' || interval_minutes || ' minutes') <= datetime('now'))`
    )
    .all() as DueRow[];

  const results: {
    launchId: string;
    ok: boolean;
    holderCount?: number;
    error?: string;
  }[] = [];

  for (const row of due) {
    const launch = getLaunch(row.launch_id);
    if (!launch) continue;

    try {
      const result = await runDistribution(launch, row.amount_drops);
      // mark the attempt either way so a failing pool doesn't hot-loop the crank
      getDb()
        .prepare(
          "UPDATE auto_distribute SET last_run_at = datetime('now') WHERE launch_id = ?"
        )
        .run(row.launch_id);

      results.push(
        result.ok
          ? { launchId: row.launch_id, ok: true, holderCount: result.payouts.length }
          : { launchId: row.launch_id, ok: false, error: result.error }
      );
    } catch (err: unknown) {
      results.push({
        launchId: row.launch_id,
        ok: false,
        error: err instanceof Error ? err.message : "distribution failed",
      });
    }
  }

  return apiSuccess({ due: due.length, results });
}
