import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { verifySignIn } from "@/lib/xrpl/xaman";
import { getUser, createUser } from "@/db/repo/users";
import { getDb } from "@/db";
import { totalXp } from "@/db/repo/participation";
import { computeLevel, XP_RULES } from "@/lib/participation/xp";
import { insertXpEvent, getStreak } from "@/db/repo/participation";

const verifySchema = z.object({
  payloadUuid: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof verifySchema>;
  try {
    body = verifySchema.parse(await req.json());
  } catch {
    return apiError("invalid request body");
  }

  const result = await verifySignIn(body.payloadUuid);
  if (!result) {
    return apiError("sign-in not completed or expired", 401);
  }

  const existing = getDb()
    .prepare("SELECT id FROM users WHERE address = ?")
    .get(result.address) as { id: string } | undefined;

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const user = createUser({ referralSource: null });
    getDb()
      .prepare("UPDATE users SET address = ? WHERE id = ?")
      .run(result.address, user.id);
    userId = user.id;

    if (XP_RULES.SIGNUP_BONUS > 0) {
      insertXpEvent(userId, "signup_bonus", XP_RULES.SIGNUP_BONUS, "hub");
    }
  }

  const user = getUser(userId)!;
  const xp = totalXp(userId);
  const level = computeLevel(xp);
  const streak = getStreak(userId);

  return apiSuccess({
    id: user.id,
    address: result.address,
    referralCode: user.referral_code,
    xp,
    ...level,
    streak: streak.current,
  });
}
