import { getDb } from "@/db";

export function insertXpEvent(userId: string, action: string, amount: number, room = "hub") {
  getDb()
    .prepare("INSERT INTO xp_events (user_id, action, amount, room) VALUES (?, ?, ?, ?)")
    .run(userId, action, amount, room);
}

export function totalXp(userId: string): number {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(amount), 0) as xp FROM xp_events WHERE user_id = ?")
    .get(userId) as { xp: number };
  return row.xp;
}

export type Streak = { user_id: string; current: number; longest: number; last_check_in: string | null };

export function getStreak(userId: string): Streak {
  return getDb().prepare("SELECT * FROM streaks WHERE user_id = ?").get(userId) as Streak;
}

export function updateStreak(userId: string, current: number, longest: number, lastCheckIn: string) {
  getDb()
    .prepare("UPDATE streaks SET current = ?, longest = ?, last_check_in = ? WHERE user_id = ?")
    .run(current, longest, lastCheckIn, userId);
}

export function grantAchievement(userId: string, achievementId: string) {
  getDb()
    .prepare("INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)")
    .run(userId, achievementId);
}

export function listAchievements(userId: string) {
  return getDb()
    .prepare(
      `SELECT a.id, a.label, a.description, ua.earned_at
       FROM achievements a LEFT JOIN user_achievements ua
         ON ua.achievement_id = a.id AND ua.user_id = ?`
    )
    .all(userId) as { id: string; label: string; description: string; earned_at: string | null }[];
}

export type Task = { id: string; label: string; description: string; url: string; xp: number };

export function listTasksWithStatus(userId: string, utcDate: string) {
  return getDb()
    .prepare(
      `SELECT t.id, t.label, t.description, t.url, t.xp,
              CASE WHEN tc.task_id IS NULL THEN 0 ELSE 1 END as completed
       FROM tasks t LEFT JOIN task_completions tc
         ON tc.task_id = t.id AND tc.user_id = ? AND tc.completed_on = ?
       WHERE t.active = 1`
    )
    .all(userId, utcDate) as (Task & { completed: number })[];
}

export function getTask(taskId: string): Task | undefined {
  return getDb().prepare("SELECT * FROM tasks WHERE id = ? AND active = 1").get(taskId) as Task | undefined;
}

export function completeTask(userId: string, taskId: string, utcDate: string): boolean {
  const res = getDb()
    .prepare(
      "INSERT OR IGNORE INTO task_completions (user_id, task_id, completed_on) VALUES (?, ?, ?)"
    )
    .run(userId, taskId, utcDate);
  return res.changes > 0;
}

export function leaderboard(limit = 25) {
  return getDb()
    .prepare(
      `SELECT u.referral_code as code, u.custom_code, COALESCE(SUM(e.amount), 0) as xp, s.current as streak
       FROM users u
       LEFT JOIN xp_events e ON e.user_id = u.id
       LEFT JOIN streaks s ON s.user_id = u.id
       GROUP BY u.id ORDER BY xp DESC LIMIT ?`
    )
    .all(limit) as { code: string; custom_code: number; xp: number; streak: number }[];
}

export function logAdImpression(slot: string, page: string, userId: string | null) {
  getDb()
    .prepare("INSERT INTO ad_impressions (slot, page, user_id) VALUES (?, ?, ?)")
    .run(slot, page, userId);
}
