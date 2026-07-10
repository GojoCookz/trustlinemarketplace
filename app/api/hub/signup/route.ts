import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { createUser, getUserByReferralCode, countReferrals } from "@/db/repo/users";
import { totalXp } from "@/db/repo/participation";
import { insertXpEvent, getStreak, listAchievements } from "@/db/repo/participation";
import { computeLevel, XP_RULES } from "@/lib/participation/xp";

const signupSchema = z.object({
  referralSource: z.string().max(20).nullable().optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof signupSchema>;
  try {
    body = signupSchema.parse(await req.json());
  } catch {
    return apiError("invalid request body");
  }

  const user = createUser({
    referralSource: body.referralSource ?? null,
  });

  if (XP_RULES.SIGNUP_BONUS > 0) {
    insertXpEvent(user.id, "signup_bonus", XP_RULES.SIGNUP_BONUS, "hub");
  }

  if (body.referralSource) {
    const referrer = getUserByReferralCode(body.referralSource);
    if (referrer) {
      const refCount = countReferrals(body.referralSource);
      if (refCount === 1) {
        insertXpEvent(referrer.id, "first_referral", XP_RULES.FIRST_REFERRAL, "hub");
      }
      insertXpEvent(referrer.id, "referral", XP_RULES.REFERRAL_REWARD, "hub");
    }
  }

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
