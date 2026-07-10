import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getUser } from "@/db/repo/users";
import {
  insertXpEvent,
  getStreak,
  updateStreak,
  grantAchievement,
} from "@/db/repo/participation";
import { XP_RULES, streakMultiplier } from "@/lib/participation/xp";

const checkinSchema = z.object({
  userId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof checkinSchema>;
  try {
    body = checkinSchema.parse(await req.json());
  } catch {
    return apiError("invalid request body");
  }

  const user = getUser(body.userId);
  if (!user) return apiError("user not found", 404);

  const today = new Date().toISOString().split("T")[0];
  const streak = getStreak(user.id);

  if (streak.last_check_in === today) {
    return apiError("already checked in today", 409);
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const newCurrent =
    streak.last_check_in === yesterday ? streak.current + 1 : 1;
  const newLongest = Math.max(streak.longest, newCurrent);

  const mult = streakMultiplier(newCurrent);
  const xpAwarded = Math.floor(XP_RULES.DAILY_CHECKIN * mult);

  insertXpEvent(user.id, "daily_checkin", xpAwarded, "hub");
  updateStreak(user.id, newCurrent, newLongest, today);

  if (newCurrent === 1) grantAchievement(user.id, "first_checkin");
  if (newCurrent === 7) {
    grantAchievement(user.id, "streak_7");
    insertXpEvent(user.id, "streak_bonus_7", XP_RULES.STREAK_BONUS_7, "hub");
  }
  if (newCurrent === 30) {
    grantAchievement(user.id, "streak_30");
    insertXpEvent(user.id, "streak_bonus_30", XP_RULES.STREAK_BONUS_30, "hub");
  }

  return apiSuccess({
    xpAwarded,
    multiplier: mult,
    newStreak: newCurrent,
    newLongest,
  });
}
