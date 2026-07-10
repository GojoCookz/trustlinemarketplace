// Dev crank bot: ticks the auto-distribute endpoint on an interval.
// Usage: node scripts/distributor-bot.mjs [--once] [--interval=60]
// Prod equivalent: Vercel Cron hitting /api/cron/distribute with x-cron-key.

const BASE = process.env.TRUSTLINE_URL ?? "http://localhost:3000";
const once = process.argv.includes("--once");
const intervalArg = process.argv.find((a) => a.startsWith("--interval="));
const intervalSec = intervalArg ? parseInt(intervalArg.split("=")[1], 10) : 60;

async function tick() {
  try {
    const res = await fetch(`${BASE}/api/cron/distribute`, {
      method: "POST",
      headers: process.env.CRON_SECRET
        ? { "x-cron-key": process.env.CRON_SECRET }
        : {},
    });
    const data = await res.json();
    const stamp = new Date().toISOString();
    if (data.success) {
      console.log(`[${stamp}] due=${data.data.due}`, JSON.stringify(data.data.results));
    } else {
      console.error(`[${stamp}] tick failed:`, data.error);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] tick error:`, err.message);
  }
}

await tick();
if (!once) {
  console.log(`distributor bot running — ticking every ${intervalSec}s`);
  setInterval(tick, intervalSec * 1000);
}
