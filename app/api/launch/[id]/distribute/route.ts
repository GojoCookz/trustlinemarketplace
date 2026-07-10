import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { isDevMode } from "@/lib/xrpl/xaman";
import { isTestnet } from "@/lib/xrpl/client";
import { runDistribution } from "@/lib/distributor";

const distributeSchema = z.object({
  userId: z.string().min(1),
  xrpAmount: z.number().positive().max(100_000),
});

// Manual [pay holders]: creator-triggered pro-rata XRP distribution.
// Core logic lives in lib/distributor.ts, shared with the auto-crank.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const launch = getLaunch(id);
  if (!launch) return apiError("launch not found", 404);

  let body: z.infer<typeof distributeSchema>;
  try {
    body = distributeSchema.parse(await req.json());
  } catch {
    return apiError("userId and xrpAmount required");
  }

  if (launch.creator_id !== body.userId) {
    return apiError("only the creator can trigger a distribution", 403);
  }

  if (!isDevMode()) {
    return apiError("xaman distribution not yet implemented — use dev mode", 501);
  }
  if (!isTestnet()) {
    return apiError("dev signing only available on testnet", 403);
  }

  try {
    const result = await runDistribution(
      launch,
      Math.round(body.xrpAmount * 1_000_000)
    );
    if (!result.ok) return apiError(result.error, 400);

    return apiSuccess({
      distributionId: result.distributionId,
      holderCount: result.payouts.length,
      totalDrops: Math.round(body.xrpAmount * 1_000_000),
      payouts: result.payouts,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "distribution failed";
    return apiError(msg, 500);
  }
}
