import { getDb } from "@/db";
import { randomUUID } from "crypto";
import { generateReferralCode } from "@/lib/participation/referrals";

export type User = {
  id: string;
  address: string | null;
  email: string | null;
  referral_code: string;
  custom_code: number;
  referral_source: string | null;
  created_at: string;
};

export function createUser(opts: {
  referralSource?: string | null;
  deviceHash?: string | null;
  ipHash?: string | null;
}): User {
  const db = getDb();
  const id = randomUUID();
  let code = generateReferralCode();
  // regenerate on the (unlikely) collision
  while (db.prepare("SELECT 1 FROM users WHERE referral_code = ?").get(code)) {
    code = generateReferralCode();
  }
  db.prepare(
    `INSERT INTO users (id, referral_code, referral_source, device_hash, ip_hash)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, code, opts.referralSource ?? null, opts.deviceHash ?? null, opts.ipHash ?? null);
  db.prepare("INSERT INTO streaks (user_id) VALUES (?)").run(id);
  return getUser(id)!;
}

export function getUser(id: string): User | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByReferralCode(code: string): User | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE referral_code = ?")
    .get(code) as User | undefined;
}

export function setEmail(userId: string, email: string) {
  getDb().prepare("UPDATE users SET email = ? WHERE id = ?").run(email, userId);
}

export function setCustomReferralCode(userId: string, code: string): boolean {
  const db = getDb();
  const taken = db.prepare("SELECT 1 FROM users WHERE referral_code = ?").get(code);
  if (taken) return false;
  db.prepare("UPDATE users SET referral_code = ?, custom_code = 1 WHERE id = ?").run(code, userId);
  return true;
}

export function countReferrals(referralCode: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as n FROM users WHERE referral_source = ?")
    .get(referralCode) as { n: number };
  return row.n;
}
