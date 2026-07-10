import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import {
  getParticipationLaunch,
  launchProgress,
  userXp,
  topParticipants,
  recordAction,
  markThresholdMet,
  PROJECT_XP_ACTIONS,
  type ProjectXpAction,
} from "@/db/repo/project-launches";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const launch = getParticipationLaunch(id);
  if (!launch) return apiError("launch not found", 404);

  const progress = launchProgress(id);
  const userId = req.nextUrl.searchParams.get("userId");

  return apiSuccess({
    launch,
    progress,
    myXp: userId ? userXp(id, userId) : 0,
    top: topParticipants(id),
    // TGE preview: 1 xp = 1 token, minted via the side A issuer flow.
    // REVIEW: execution intentionally stubbed — TrustSet-to-claim + issuance
    // wiring is a later milestone. Preview numbers only.
    tge:
      progress.totalXp >= launch.xp_goal
        ? {
            tokenSupply: progress.totalXp,
            participants: progress.participants,
            note: "1 xp = 1 token, claim via trust line at tge",
          }
        : null,
  });
}

const actionSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(
    Object.keys(PROJECT_XP_ACTIONS) as [ProjectXpAction, ...ProjectXpAction[]]
  ),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const launch = getParticipationLaunch(id);
  if (!launch) return apiError("launch not found", 404);

  if (launch.status !== "collecting" && launch.status !== "threshold_met") {
    return apiError(`launch is ${launch.status}`);
  }

  let body: z.infer<typeof actionSchema>;
  try {
    body = actionSchema.parse(await req.json());
  } catch {
    return apiError("userId and action (join/checkin/share) required");
  }

  const result = recordAction(id, body.userId, body.action);
  if (!result.ok) return apiError(result.error);

  const progress = launchProgress(id);
  if (progress.totalXp >= launch.xp_goal) {
    markThresholdMet(id);
  }

  return apiSuccess({
    awarded: result.amount,
    myXp: userXp(id, body.userId),
    progress,
    thresholdMet: progress.totalXp >= launch.xp_goal,
  });
}
