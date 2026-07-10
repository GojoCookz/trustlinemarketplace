import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getUser, createUser } from "@/db/repo/users";
import { getDb } from "@/db";
import { totalXp, insertXpEvent, getStreak } from "@/db/repo/participation";
import { computeLevel, XP_RULES } from "@/lib/participation/xp";

// browser-extension wallet sign-in (gemwallet / crossmark).
// the extension's own approval popup is the user consent; the address
// arrives from the extension api, not free text.
const walletSchema = z.object({
  address: z
    .string()
    .min(25)
    .max(35)
    .regex(/^r[a-zA-Z0-9]+$/, "invalid xrpl address"),
  provider: z.enum(["gemwallet", "crossmark"]),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof walletSchema>;
  try {
    body = walletSchema.parse(await req.json());
  } catch (e) {
    const msg =
      e instanceof z.ZodError ? e.issues[0]?.message : "invalid input";
    return apiError(msg ?? "invalid input");
  }

  const existing = getDb()
    .prepare("SELECT id FROM users WHERE address = ?")
    .get(body.address) as { id: string } | undefined;

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const user = createUser({ referralSource: null });
    getDb()
      .prepare("UPDATE users SET address = ? WHERE id = ?")
      .run(body.address, user.id);
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
    address: body.address,
    provider: body.provider,
    referralCode: user.referral_code,
    xp,
    ...level,
    streak: streak.current,
  });
}
