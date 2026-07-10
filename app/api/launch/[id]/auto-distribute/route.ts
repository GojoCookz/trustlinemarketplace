import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { getDb } from "@/db";

const configSchema = z.object({
  userId: z.string().min(1),
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(1).max(10080),
  xrpAmount: z.number().positive().max(100_000),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const row = getDb()
    .prepare(
      "SELECT enabled, interval_minutes, amount_drops, last_run_at FROM auto_distribute WHERE launch_id = ?"
    )
    .get(id) as
    | {
        enabled: number;
        interval_minutes: number;
        amount_drops: number;
        last_run_at: string | null;
      }
    | undefined;

  return apiSuccess(
    row
      ? {
          enabled: row.enabled === 1,
          intervalMinutes: row.interval_minutes,
          xrpAmount: row.amount_drops / 1_000_000,
          lastRunAt: row.last_run_at,
        }
      : null
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const launch = getLaunch(id);
  if (!launch) return apiError("launch not found", 404);

  let body: z.infer<typeof configSchema>;
  try {
    body = configSchema.parse(await req.json());
  } catch {
    return apiError("userId, enabled, intervalMinutes, xrpAmount required");
  }

  if (launch.creator_id !== body.userId) {
    return apiError("only the creator can configure auto-pay", 403);
  }

  getDb()
    .prepare(
      `INSERT INTO auto_distribute (launch_id, enabled, interval_minutes, amount_drops)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(launch_id) DO UPDATE SET
         enabled = excluded.enabled,
         interval_minutes = excluded.interval_minutes,
         amount_drops = excluded.amount_drops`
    )
    .run(
      id,
      body.enabled ? 1 : 0,
      body.intervalMinutes,
      Math.round(body.xrpAmount * 1_000_000)
    );

  return apiSuccess({
    enabled: body.enabled,
    intervalMinutes: body.intervalMinutes,
    xrpAmount: body.xrpAmount,
  });
}
