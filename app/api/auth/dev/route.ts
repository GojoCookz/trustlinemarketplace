import { apiSuccess, apiError } from "@/lib/api";
import { isDevMode, getDevWallet } from "@/lib/xrpl/xaman";
import { isTestnet } from "@/lib/xrpl/client";
import { createUser, getUser } from "@/db/repo/users";
import { getDb } from "@/db";
import { totalXp, insertXpEvent, getStreak } from "@/db/repo/participation";
import { computeLevel, XP_RULES } from "@/lib/participation/xp";

export async function POST() {
  if (!isDevMode()) {
    return apiError("dev login disabled — Xaman is configured", 403);
  }

  if (!isTestnet()) {
    return apiError("dev login only available on testnet", 403);
  }

  try {
    const wallet = await getDevWallet();

    const existing = getDb()
      .prepare("SELECT id FROM users WHERE address = ?")
      .get(wallet.address) as { id: string } | undefined;

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      const user = createUser({ referralSource: null });
      getDb()
        .prepare("UPDATE users SET address = ? WHERE id = ?")
        .run(wallet.address, user.id);
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
      address: wallet.address,
      referralCode: user.referral_code,
      xp,
      ...level,
      streak: streak.current,
      _dev: { secret: wallet.secret },
    });
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "failed to create dev wallet",
      500
    );
  }
}
