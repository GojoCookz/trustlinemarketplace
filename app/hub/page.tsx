"use client";

import { useState, useEffect, useCallback } from "react";

type Profile = {
  id: string;
  referralCode: string;
  xp: number;
  level: number;
  title: string;
  nextAt: number;
  streak: number;
  longest: number;
  lastCheckIn: string | null;
  achievements: { id: string; label: string; description: string; earnedAt: string | null }[];
};

type TaskItem = {
  id: string;
  label: string;
  description: string;
  url: string;
  xp: number;
  completed: boolean;
};

type LeaderboardEntry = {
  code: string;
  customCode: number;
  xp: number;
  streak: number;
};

export default function HubPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [tab, setTab] = useState<"tasks" | "board" | "achievements">("tasks");

  const [showUpgrade, setShowUpgrade] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const userId =
    typeof window !== "undefined"
      ? localStorage.getItem("tl_user_id")
      : null;

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(`/api/hub/profile?userId=${userId}`);
    const data = await res.json();
    if (data.success) setProfile(data.data);
  }, [userId]);

  const fetchTasks = useCallback(async () => {
    if (!userId) return;
    const res = await fetch(`/api/hub/tasks?userId=${userId}`);
    const data = await res.json();
    if (data.success) setTasks(data.data);
  }, [userId]);

  const fetchLeaderboard = useCallback(async () => {
    const res = await fetch("/api/hub/leaderboard");
    const data = await res.json();
    if (data.success) setLeaderboard(data.data);
  }, []);

  useEffect(() => {
    Promise.all([fetchProfile(), fetchTasks(), fetchLeaderboard()]).finally(
      () => setLoading(false)
    );
  }, [fetchProfile, fetchTasks, fetchLeaderboard]);

  async function handleSignup(ref?: string) {
    const res = await fetch("/api/hub/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralSource: ref || null }),
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem("tl_user_id", data.data.id);
      setProfile(data.data);
      fetchTasks();
      fetchLeaderboard();
    }
  }

  async function handleCheckin() {
    if (!userId) return;
    setCheckinLoading(true);
    const res = await fetch("/api/hub/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.success) {
      fetchProfile();
    }
    setCheckinLoading(false);
  }

  async function handleTaskComplete(taskId: string) {
    if (!userId) return;
    await fetch(`/api/hub/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    fetchTasks();
    fetchProfile();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-muted">loading hub...</p>
      </div>
    );
  }

  if (!userId || !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6">
        <h1 className="text-xl font-bold text-mint">[hub]</h1>
        <p className="text-sm text-foreground">
          check in. stack xp. climb the board.
        </p>
        <button
          onClick={() => handleSignup()}
          className="px-6 py-2 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm hover:bg-mint/80 transition-colors"
        >
          [join trustline]
        </button>
        <p className="text-xs text-muted">
          no wallet needed yet — just tap join
        </p>
      </div>
    );
  }

  const xpPercent =
    profile.nextAt === Infinity
      ? 100
      : Math.min(
          100,
          ((profile.xp - (profile.nextAt - 500)) /
            (profile.nextAt - (profile.nextAt - 500))) *
            100
        );

  const canCheckin = (() => {
    if (!profile.lastCheckIn) return true;
    const today = new Date().toISOString().split("T")[0];
    return profile.lastCheckIn !== today;
  })();

  return (
    <div className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-mint">[hub]</h1>
        <p className="text-xs text-muted">
          check in. stack xp. climb the board.
        </p>
      </header>

      {/* Profile card */}
      <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {profile.title}
            </p>
            <p className="text-xs text-muted">level {profile.level}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-mint">
              {profile.xp.toLocaleString()} xp
            </p>
          </div>
        </div>
        <div className="w-full bg-white/5 rounded-full h-2">
          <div
            className="bg-mint h-2 rounded-full transition-all"
            style={{ width: `${xpPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            streak: {profile.streak} day{profile.streak !== 1 ? "s" : ""}
          </span>
          <span>best: {profile.longest}</span>
        </div>
      </div>

      {/* Check-in */}
      <button
        onClick={handleCheckin}
        disabled={!canCheckin || checkinLoading}
        className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${
          canCheckin
            ? "bg-mint text-[#1b1d28] hover:bg-mint/80"
            : "bg-white/5 text-muted cursor-not-allowed"
        }`}
      >
        {checkinLoading
          ? "checking in..."
          : canCheckin
            ? "[daily check-in]"
            : "checked in today"}
      </button>

      {/* Referral code */}
      <div className="rounded-lg bg-card border border-white/5 p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">your referral code</p>
            <p className="text-sm font-mono font-semibold text-foreground">
              {profile.referralCode}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  `${window.location.origin}?ref=${profile.referralCode}`
                )
              }
              className="text-xs text-mint hover:text-mint/70 transition-colors"
            >
              [copy link]
            </button>
            {!showUpgrade && (
              <button
                onClick={() => setShowUpgrade(true)}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                [customize]
              </button>
            )}
          </div>
        </div>
        {showUpgrade && (
          <div className="flex flex-col gap-2 border-t border-white/5 pt-2">
            <p className="text-[10px] text-muted">
              pick a custom code — 1 xrp, one-time
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={customCode}
                onChange={(e) =>
                  setCustomCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                }
                placeholder="your_code"
                maxLength={20}
                className="flex-1 bg-[#1b1d28] border border-white/10 rounded px-2 py-1.5 text-xs text-foreground font-mono placeholder:text-muted focus:outline-none focus:border-mint/30"
              />
              <button
                onClick={async () => {
                  if (!customCode || customCode.length < 3 || upgradeBusy) return;
                  setUpgradeBusy(true);
                  setUpgradeError(null);
                  try {
                    const devSecret = localStorage.getItem("tl_dev_secret") ?? "";
                    const res = await fetch("/api/hub/upgrade-code", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        userId,
                        newCode: customCode,
                        devSecret,
                      }),
                    });
                    const json = await res.json();
                    if (json.success) {
                      setShowUpgrade(false);
                      setCustomCode("");
                      fetchProfile();
                    } else {
                      setUpgradeError(json.error ?? "upgrade failed");
                    }
                  } catch {
                    setUpgradeError("network error");
                  } finally {
                    setUpgradeBusy(false);
                  }
                }}
                disabled={upgradeBusy || customCode.length < 3}
                className="px-3 py-1.5 rounded bg-mint text-[#1b1d28] text-xs font-semibold disabled:opacity-40"
              >
                {upgradeBusy ? "..." : "[upgrade — 1 xrp]"}
              </button>
            </div>
            {upgradeError && (
              <p className="text-[10px] text-red-400">{upgradeError}</p>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-white/5 pb-1">
        {(["tasks", "board", "achievements"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs font-medium pb-1 transition-colors ${
              tab === t
                ? "text-mint border-b border-mint"
                : "text-muted hover:text-foreground"
            }`}
          >
            [{t}]
          </button>
        ))}
      </div>

      {/* Tasks tab */}
      {tab === "tasks" && (
        <div className="flex flex-col gap-2">
          {tasks.length === 0 && (
            <p className="text-xs text-muted text-center py-4">
              no tasks available today
            </p>
          )}
          {tasks.map((task) => (
            <div
              key={task.id}
              className="rounded-lg bg-card border border-white/5 p-3 flex items-center justify-between"
            >
              <div className="flex flex-col gap-0.5">
                <p className="text-sm text-foreground">{task.label}</p>
                <p className="text-xs text-muted">{task.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-mint">
                  +{task.xp} xp
                </span>
                {task.completed ? (
                  <span className="text-xs text-muted">done</span>
                ) : (
                  <button
                    onClick={() => handleTaskComplete(task.id)}
                    className="text-xs text-mint hover:text-mint/70 transition-colors"
                  >
                    [go]
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Leaderboard tab */}
      {tab === "board" && (
        <div className="flex flex-col gap-1">
          {leaderboard.map((entry, i) => (
            <div
              key={entry.code}
              className={`rounded-lg p-3 flex items-center justify-between text-sm ${
                i < 3
                  ? "bg-mint/5 border border-mint/10"
                  : "bg-card border border-white/5"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-bold w-6 ${i < 3 ? "text-mint" : "text-muted"}`}
                >
                  #{i + 1}
                </span>
                <span className="font-mono text-foreground">{entry.code}</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-muted">
                  {entry.streak}d streak
                </span>
                <span className="font-semibold text-mint">
                  {entry.xp.toLocaleString()} xp
                </span>
              </div>
            </div>
          ))}
          {leaderboard.length === 0 && (
            <p className="text-xs text-muted text-center py-4">
              no one here yet — be first
            </p>
          )}
        </div>
      )}

      {/* Achievements tab */}
      {tab === "achievements" && (
        <div className="flex flex-col gap-2">
          {profile.achievements.map((a) => (
            <div
              key={a.id}
              className={`rounded-lg p-3 flex items-center justify-between border ${
                a.earnedAt
                  ? "bg-mint/5 border-mint/10"
                  : "bg-card border-white/5 opacity-50"
              }`}
            >
              <div>
                <p className="text-sm text-foreground">{a.label}</p>
                <p className="text-xs text-muted">{a.description}</p>
              </div>
              {a.earnedAt && (
                <span className="text-xs text-mint">earned</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ad slot placeholder */}
      <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-muted/50">
        [ad slot — reserved]
      </div>
    </div>
  );
}
