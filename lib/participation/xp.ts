export const XP_RULES = {
  DAILY_CHECKIN: 10,
  STREAK_BONUS_7: 50,
  STREAK_BONUS_30: 200,
  TASK_COMPLETE: 0,
  FIRST_REFERRAL: 25,
  SIGNUP_BONUS: 5,
} as const;

export const STREAK_MULTIPLIERS: Record<number, number> = {
  3: 1.5,
  7: 2,
  14: 3,
  30: 5,
};

export function streakMultiplier(day: number): number {
  let mult = 1;
  for (const [threshold, m] of Object.entries(STREAK_MULTIPLIERS)) {
    if (day >= Number(threshold)) mult = m;
  }
  return mult;
}

export function computeLevel(totalXp: number): { level: number; title: string; nextAt: number } {
  const tiers: [number, string][] = [
    [0, "newcomer"],
    [100, "regular"],
    [500, "contributor"],
    [2000, "veteran"],
    [10000, "elite"],
    [50000, "legend"],
  ];
  let level = 0;
  let title = tiers[0][1];
  let nextAt = tiers[1]?.[0] ?? Infinity;
  for (let i = 0; i < tiers.length; i++) {
    if (totalXp >= tiers[i][0]) {
      level = i;
      title = tiers[i][1];
      nextAt = tiers[i + 1]?.[0] ?? Infinity;
    }
  }
  return { level, title, nextAt };
}
