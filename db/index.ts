import Database from "better-sqlite3";
import { readFileSync } from "fs";
import path from "path";

// SQLite for local persistence. All access goes through repository functions
// in db/repo/ so Postgres can replace this later without touching callers.

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  // serverless (vercel) filesystems are read-only except /tmp — the db there
  // is EPHEMERAL demo state, wiped on cold starts. real deploys need a
  // durable db (turso/postgres, see MAINNET.md).
  const file =
    process.env.DB_FILE ??
    (process.env.VERCEL
      ? "/tmp/trustline.db"
      : path.join(process.cwd(), "trustline.db"));
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(d: Database.Database) {
  const schema = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  d.exec(schema);
  // additive column migrations — CREATE TABLE IF NOT EXISTS skips existing tables
  ensureColumn(d, "listings", "featured_until", "TEXT");
  seed(d);
}

function ensureColumn(
  d: Database.Database,
  table: string,
  column: string,
  type: string
) {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === column)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function seed(d: Database.Database) {
  const insertAch = d.prepare(
    "INSERT OR IGNORE INTO achievements (id, label, description) VALUES (?, ?, ?)"
  );
  const achievements: [string, string, string][] = [
    ["first_checkin", "first check-in", "you showed up."],
    ["streak_7", "7 day streak", "a whole week. habit forming."],
    ["streak_30", "30 day streak", "a month straight. certified regular."],
    ["first_referral", "first referral", "you brought a friend."],
    ["ten_referrals", "10 referrals", "you're a growth channel now."],
  ];
  for (const a of achievements) insertAch.run(...a);

  const insertTask = d.prepare(
    "INSERT OR IGNORE INTO tasks (id, label, description, url, xp) VALUES (?, ?, ?, ?, ?)"
  );
  // REVIEW: task links are placeholders until real socials exist. swap urls in env/config.
  const tasks: [string, string, string, string, number][] = [
    ["follow_x", "follow us on x", "tap through and follow", process.env.TASK_URL_X ?? "https://x.com", 20],
    ["join_discord", "join the discord", "come hang out", process.env.TASK_URL_DISCORD ?? "https://discord.com", 30],
    ["watch_video", "watch the intro video", "like, comment or share", process.env.TASK_URL_VIDEO ?? "https://youtube.com", 30],
    ["subscribe_newsletter", "subscribe to the newsletter", "one email a week, no spam", process.env.TASK_URL_NEWSLETTER ?? "https://example.com", 25],
  ];
  for (const t of tasks) insertTask.run(...t);
}
