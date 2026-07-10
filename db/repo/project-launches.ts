import { getDb } from "@/db";
import { randomUUID } from "crypto";

export type ParticipationLaunch = {
  id: string;
  creator_id: string;
  name: string;
  ticker: string;
  description: string | null;
  xp_goal: number;
  status: string;
  created_at: string;
};

// XP rulebook for participation launches. join/share once, checkin daily.
export const PROJECT_XP_ACTIONS = {
  join: { amount: 100, once: true },
  checkin: { amount: 50, once: false },
  share: { amount: 50, once: true },
} as const;

export type ProjectXpAction = keyof typeof PROJECT_XP_ACTIONS;

export function createParticipationLaunch(row: {
  creatorId: string;
  name: string;
  ticker: string;
  description?: string;
  xpGoal: number;
}): ParticipationLaunch {
  const id = randomUUID();
  getDb()
    .prepare(
      "INSERT INTO participation_launches (id, creator_id, name, ticker, description, xp_goal) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      row.creatorId,
      row.name,
      row.ticker.toUpperCase(),
      row.description ?? null,
      row.xpGoal
    );
  return getParticipationLaunch(id)!;
}

export function getParticipationLaunch(
  id: string
): ParticipationLaunch | undefined {
  return getDb()
    .prepare("SELECT * FROM participation_launches WHERE id = ?")
    .get(id) as ParticipationLaunch | undefined;
}

export function listParticipationLaunches(limit = 20) {
  return getDb()
    .prepare(
      `SELECT pl.*,
         COALESCE((SELECT SUM(amount) FROM project_xp_events e WHERE e.launch_id = pl.id), 0) as total_xp,
         (SELECT COUNT(DISTINCT user_id) FROM project_xp_events e WHERE e.launch_id = pl.id) as participants
       FROM participation_launches pl
       ORDER BY pl.created_at DESC LIMIT ?`
    )
    .all(limit) as (ParticipationLaunch & {
    total_xp: number;
    participants: number;
  })[];
}

export function launchProgress(id: string): {
  totalXp: number;
  participants: number;
} {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total_xp, COUNT(DISTINCT user_id) as participants
       FROM project_xp_events WHERE launch_id = ?`
    )
    .get(id) as { total_xp: number; participants: number };
  return { totalXp: row.total_xp, participants: row.participants };
}

export function userXp(launchId: string, userId: string): number {
  const row = getDb()
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) as xp FROM project_xp_events WHERE launch_id = ? AND user_id = ?"
    )
    .get(launchId, userId) as { xp: number };
  return row.xp;
}

export function topParticipants(launchId: string, limit = 10) {
  return getDb()
    .prepare(
      `SELECT e.user_id, SUM(e.amount) as xp, u.referral_code
       FROM project_xp_events e JOIN users u ON u.id = e.user_id
       WHERE e.launch_id = ?
       GROUP BY e.user_id ORDER BY xp DESC LIMIT ?`
    )
    .all(launchId, limit) as {
    user_id: string;
    xp: number;
    referral_code: string;
  }[];
}

// Records the action if allowed. Returns the XP awarded, or a refusal reason.
export function recordAction(
  launchId: string,
  userId: string,
  action: ProjectXpAction
): { ok: true; amount: number } | { ok: false; error: string } {
  const rule = PROJECT_XP_ACTIONS[action];

  if (rule.once) {
    const existing = getDb()
      .prepare(
        "SELECT 1 FROM project_xp_events WHERE launch_id = ? AND user_id = ? AND action = ?"
      )
      .get(launchId, userId, action);
    if (existing) return { ok: false, error: `already did ${action}` };
  } else {
    // daily actions: once per utc day
    const today = getDb()
      .prepare(
        "SELECT 1 FROM project_xp_events WHERE launch_id = ? AND user_id = ? AND action = ? AND date(created_at) = date('now')"
      )
      .get(launchId, userId, action);
    if (today) return { ok: false, error: `${action} already done today` };
  }

  getDb()
    .prepare(
      "INSERT INTO project_xp_events (launch_id, user_id, action, amount) VALUES (?, ?, ?, ?)"
    )
    .run(launchId, userId, action, rule.amount);

  return { ok: true, amount: rule.amount };
}

export function markThresholdMet(id: string) {
  getDb()
    .prepare(
      "UPDATE participation_launches SET status = 'threshold_met' WHERE id = ? AND status = 'collecting'"
    )
    .run(id);
}
