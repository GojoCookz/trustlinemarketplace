import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getUser } from "@/db/repo/users";
import { totalXp, getStreak, listAchievements } from "@/db/repo/participation";
import { computeLevel } from "@/lib/participation/xp";

const querySchema = z.object({
  userId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  let parsed: z.infer<typeof querySchema>;
  try {
    parsed = querySchema.parse(params);
  } catch {
    return apiError("invalid userId");
  }

  const user = getUser(parsed.userId);
  if (!user) return apiError("user not found", 404);

  const xp = totalXp(user.id);
  const level = computeLevel(xp);
  const streak = getStreak(user.id);
  const achievements = listAchievements(user.id);

  return apiSuccess({
    id: user.id,
    referralCode: user.referral_code,
    xp,
    ...level,
    streak: streak.current,
    longest: streak.longest,
    lastCheckIn: streak.last_check_in,
    achievements: achievements.map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description,
      earnedAt: a.earned_at,
    })),
  });
}
