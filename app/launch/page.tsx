"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";

type Mode = "pick" | "side-a" | "side-b";

type LaunchRow = {
  id: string;
  creator_id: string;
  name: string;
  ticker: string;
  supply: string;
  transfer_rate_pct: number;
  issuer_address: string;
  issue_tx: string | null;
  created_at: string;
};

type RewardsInfo = {
  poolAddress: string | null;
  poolBalanceDrops: number;
  history: { id: number; total_drops: number; holder_count: number; created_at: string }[];
};

type AutoConfig = {
  enabled: boolean;
  intervalMinutes: number;
  xrpAmount: number;
  lastRunAt: string | null;
};

type ParticipationRow = {
  id: string;
  creator_id: string;
  name: string;
  ticker: string;
  description: string | null;
  xp_goal: number;
  status: string;
  total_xp: number;
  participants: number;
};

export default function LaunchPage() {
  const [mode, setMode] = useState<Mode>("pick");
  const [launches, setLaunches] = useState<LaunchRow[]>([]);

  useEffect(() => {
    fetch("/api/launch")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setLaunches(res.data);
      })
      .catch(() => {});
  }, [mode]);

  if (mode === "side-a") return <SideAWizard onBack={() => setMode("pick")} />;
  if (mode === "side-b") return <SideBView onBack={() => setMode("pick")} />;

  return (
    <div className="flex flex-col gap-6 py-8">
      <header>
        <h1 className="text-xl font-bold text-mint">[launch]</h1>
        <p className="text-xs text-muted">
          you get paid every trade. that's the whole thing.
        </p>
      </header>

      {/* Two big buttons — one job each */}
      <button
        onClick={() => setMode("side-a")}
        className="rounded-lg bg-card border border-white/5 p-5 text-left hover:border-mint/20 transition-colors"
      >
        <p className="text-sm font-bold text-mint">[launch a token]</p>
        <p className="text-xs text-muted mt-1">
          mint it, set a burn fee, earn from every trade — live on testnet
        </p>
      </button>

      <button
        onClick={() => setMode("side-b")}
        className="rounded-lg bg-card border border-white/5 p-5 text-left hover:border-mint/20 transition-colors"
      >
        <p className="text-sm font-bold text-mint">[participation launch]</p>
        <p className="text-xs text-muted mt-1">
          build community first, launch token later. 1 xp = 1 airdrop.
        </p>
      </button>

      {/* Recent launches */}
      <section className="flex flex-col gap-3 mt-2">
        <h2 className="text-sm font-semibold text-muted">recent launches</h2>
        {launches.length === 0 ? (
          <div className="rounded-lg bg-card border border-white/5 p-6 text-center text-xs text-muted">
            no tokens launched yet — be the first
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {launches.map((l) => (
              <LaunchCard key={l.id} launch={l} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function LaunchCard({ launch }: { launch: LaunchRow }) {
  const { userId, isDevMode } = useWallet();
  const isCreator = userId === launch.creator_id;
  const [open, setOpen] = useState(false);
  const [rewards, setRewards] = useState<RewardsInfo | null>(null);
  const [fundAmount, setFundAmount] = useState("20");
  const [distAmount, setDistAmount] = useState("10");
  const [busy, setBusy] = useState<"fund" | "distribute" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [autoConfig, setAutoConfig] = useState<AutoConfig | null>(null);
  const [autoInterval, setAutoInterval] = useState("60");
  const [autoAmount, setAutoAmount] = useState("1");
  const [savingAuto, setSavingAuto] = useState(false);

  const loadRewards = () => {
    fetch(`/api/launch/${launch.id}/rewards`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setRewards(res.data);
      })
      .catch(() => {});

    fetch(`/api/launch/${launch.id}/auto-distribute`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setAutoConfig(res.data);
          setAutoInterval(String(res.data.intervalMinutes));
          setAutoAmount(String(res.data.xrpAmount));
        }
      })
      .catch(() => {});
  };

  async function saveAutoConfig(enabled: boolean) {
    if (!userId) return;
    const intervalMinutes = parseInt(autoInterval, 10);
    const xrpAmount = parseFloat(autoAmount);
    if (!(intervalMinutes > 0) || !(xrpAmount > 0)) return;
    setSavingAuto(true);
    setError(null);
    try {
      const res = await fetch(`/api/launch/${launch.id}/auto-distribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, enabled, intervalMinutes, xrpAmount }),
      });
      const data = await res.json();
      if (data.success) {
        setAutoConfig({
          enabled,
          intervalMinutes,
          xrpAmount,
          lastRunAt: autoConfig?.lastRunAt ?? null,
        });
        setMsg(enabled ? "auto-pay on" : "auto-pay off");
      } else {
        setError(data.error ?? "save failed");
      }
    } catch {
      setError("save failed");
    } finally {
      setSavingAuto(false);
    }
  }

  useEffect(() => {
    if (open) loadRewards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function act(kind: "fund" | "distribute") {
    if (!userId) return;
    const amount = parseFloat(kind === "fund" ? fundAmount : distAmount);
    if (!(amount > 0)) return;
    setBusy(kind);
    setMsg(null);
    setError(null);
    try {
      const devSecret = isDevMode
        ? localStorage.getItem("tl_dev_secret")
        : undefined;
      const url =
        kind === "fund"
          ? `/api/launch/${launch.id}/fund-rewards`
          : `/api/launch/${launch.id}/distribute`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "fund"
            ? { userId, xrpAmount: amount, devSecret }
            : { userId, xrpAmount: amount }
        ),
      });
      const data = await res.json();
      if (data.success) {
        setMsg(
          kind === "fund"
            ? `pool funded +${amount} xrp`
            : `paid ${data.data.holderCount} holders ${amount} xrp pro-rata`
        );
        loadRewards();
      } else {
        setError(data.error ?? `${kind} failed`);
      }
    } catch {
      setError(`${kind} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {launch.name} <span className="text-mint">${launch.ticker}</span>
          </p>
          <p className="text-[10px] text-muted font-mono">
            issuer: {launch.issuer_address.slice(0, 8)}...
            {launch.issuer_address.slice(-4)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-foreground">
            {Number(launch.supply).toLocaleString()} supply
          </p>
          <p className="text-[10px] text-muted">
            {launch.transfer_rate_pct}% burn fee
          </p>
        </div>
      </div>

      {isCreator && (
        <button
          onClick={() => setOpen(!open)}
          className="self-start text-[10px] text-mint hover:text-foreground"
        >
          {open ? "[close rewards]" : "[manage rewards]"}
        </button>
      )}

      {isCreator && open && (
        <div className="rounded-lg bg-[#1b1d28] p-3 flex flex-col gap-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted">rewards pool</span>
            <span className="text-mint font-bold">
              {rewards
                ? `${(rewards.poolBalanceDrops / 1_000_000).toFixed(2)} xrp`
                : "..."}
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              className="flex-1 bg-card border border-white/5 rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-mint/30"
            />
            <button
              onClick={() => act("fund")}
              disabled={busy !== null}
              className="px-4 py-2 rounded-lg bg-white/5 text-mint text-xs font-semibold disabled:opacity-40"
            >
              {busy === "fund" ? "funding..." : "[fund pool]"}
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              value={distAmount}
              onChange={(e) => setDistAmount(e.target.value)}
              className="flex-1 bg-card border border-white/5 rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-mint/30"
            />
            <button
              onClick={() => act("distribute")}
              disabled={busy !== null}
              className="px-4 py-2 rounded-lg bg-mint text-[#1b1d28] text-xs font-semibold disabled:opacity-40"
            >
              {busy === "distribute" ? "paying holders..." : "[pay holders]"}
            </button>
          </div>

          <div className="border-t border-white/5 pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-foreground">
                auto-pay holders{" "}
                <span
                  className={`text-[10px] ${autoConfig?.enabled ? "text-mint" : "text-muted"}`}
                >
                  {autoConfig?.enabled ? "(on)" : "(off)"}
                </span>
              </p>
              <button
                onClick={() => saveAutoConfig(!autoConfig?.enabled)}
                disabled={savingAuto}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold disabled:opacity-40 ${
                  autoConfig?.enabled
                    ? "bg-red-400/20 text-red-400"
                    : "bg-mint/20 text-mint"
                }`}
              >
                {savingAuto
                  ? "saving..."
                  : autoConfig?.enabled
                  ? "[turn off]"
                  : "[turn on]"}
              </button>
            </div>
            <div className="flex gap-2 items-center text-[10px] text-muted">
              <span>pay</span>
              <input
                type="number"
                value={autoAmount}
                onChange={(e) => setAutoAmount(e.target.value)}
                className="w-16 bg-card border border-white/5 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-mint/30"
              />
              <span>xrp every</span>
              <input
                type="number"
                value={autoInterval}
                onChange={(e) => setAutoInterval(e.target.value)}
                className="w-16 bg-card border border-white/5 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-mint/30"
              />
              <span>min</span>
            </div>
            {autoConfig?.lastRunAt && (
              <p className="text-[10px] text-muted">
                last run: {new Date(autoConfig.lastRunAt + "Z").toLocaleString()}
              </p>
            )}
          </div>

          {msg && <p className="text-[10px] text-mint">{msg}</p>}
          {error && <p className="text-[10px] text-red-400">{error}</p>}

          {rewards && rewards.history.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-white/5 pt-2">
              <p className="text-[10px] text-muted">past distributions</p>
              {rewards.history.map((h) => (
                <div key={h.id} className="flex justify-between text-[10px]">
                  <span className="text-muted">
                    {new Date(h.created_at + "Z").toLocaleString()}
                  </span>
                  <span className="text-foreground">
                    {(h.total_drops / 1_000_000).toFixed(2)} xrp &rarr;{" "}
                    {h.holder_count} holders
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SideAWizard({ onBack }: { onBack: () => void }) {
  const { userId, isDevMode } = useWallet();
  const [step, setStep] = useState(1);

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [supply, setSupply] = useState("1000000000");
  const [burnFee, setBurnFee] = useState(1);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    issuerAddress: string;
    issueTx: string;
    feeTx: string;
    ticker: string;
  } | null>(null);

  const supplyNum = parseInt(supply || "0", 10);
  const step1Valid = name.trim().length > 0 && /^[a-zA-Z0-9]{3,20}$/.test(ticker);
  const step2Valid = supplyNum > 0;

  async function handleLaunch() {
    if (!userId) return;
    setLaunching(true);
    setError(null);
    try {
      const devSecret = isDevMode
        ? localStorage.getItem("tl_dev_secret")
        : undefined;
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId: userId,
          name: name.trim(),
          ticker: ticker.trim(),
          supply: supplyNum,
          transferRatePct: burnFee,
          description: description.trim() || undefined,
          devSecret,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        setStep(4);
      } else {
        setError(data.error ?? "launch failed");
      }
    } catch {
      setError("launch failed");
    } finally {
      setLaunching(false);
    }
  }

  if (step === 4 && result) {
    return (
      <div className="flex flex-col gap-6 py-8">
        <header>
          <h1 className="text-xl font-bold text-mint">[token is live]</h1>
          <p className="text-xs text-muted">issued on xrpl testnet</p>
        </header>

        <div className="rounded-lg bg-mint/10 border border-mint/20 p-5 text-center">
          <p className="text-2xl font-bold text-mint">${result.ticker}</p>
          <p className="text-xs text-muted mt-1">
            {Number(supply).toLocaleString()} tokens in your wallet
          </p>
        </div>

        <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-2 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-muted flex-shrink-0">issuer</span>
            <span className="text-foreground font-mono break-all text-right">
              {result.issuerAddress}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted flex-shrink-0">supply tx</span>
            <a
              href={`https://testnet.xrpl.org/transactions/${result.issueTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-mint font-mono truncate"
            >
              {result.issueTx.slice(0, 12)}...
            </a>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted flex-shrink-0">fee tx</span>
            <a
              href={`https://testnet.xrpl.org/transactions/${result.feeTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-mint font-mono truncate"
            >
              {result.feeTx.slice(0, 12)}...
            </a>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted flex-shrink-0">burn fee</span>
            <span className="text-foreground">{burnFee}% per trade</span>
          </div>
        </div>

        <button
          onClick={onBack}
          className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm"
        >
          [back to launch room]
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-8">
      <button
        onClick={() => (step > 1 ? setStep(step - 1) : onBack())}
        className="text-xs text-muted hover:text-foreground self-start"
      >
        &larr; {step > 1 ? "back" : "cancel"}
      </button>

      <header>
        <h1 className="text-xl font-bold text-mint">[launch a token]</h1>
        <p className="text-xs text-muted">step {step} of 3</p>
      </header>

      <div className="flex gap-1">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 h-1 rounded-full ${s <= step ? "bg-mint" : "bg-white/10"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-muted block mb-1">token name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my token"
              maxLength={40}
              className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">
              ticker (3-20 letters/numbers)
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) =>
                setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
              }
              placeholder="TKN"
              maxLength={20}
              className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">
              description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="what's this token about?"
              rows={3}
              maxLength={300}
              className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30 resize-none"
            />
          </div>
          <button
            onClick={() => step1Valid && setStep(2)}
            disabled={!step1Valid}
            className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
          >
            [next]
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-muted block mb-1">
              total supply
            </label>
            <input
              type="number"
              value={supply}
              onChange={(e) => setSupply(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="1000000000"
              className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
            {supplyNum > 0 && (
              <p className="text-[10px] text-muted mt-1">
                {supplyNum.toLocaleString()} tokens, all delivered to your wallet
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted block mb-2">
              burn fee — every trade burns this % ({burnFee}%)
            </label>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={burnFee}
              onChange={(e) => setBurnFee(parseFloat(e.target.value))}
              className="w-full accent-[#86efac]"
            />
            <div className="flex justify-between text-[10px] text-muted mt-1">
              <span>0%</span>
              <span>5%</span>
            </div>
          </div>
          <div className="rounded-lg bg-mint/5 border border-mint/10 p-3 text-xs text-mint">
            the burn fee is enforced on-ledger (TransferRate) — it shrinks
            supply on every transfer. holder rewards are paid in real xrp by
            the distribution engine.
          </div>
          <button
            onClick={() => step2Valid && setStep(3)}
            disabled={!step2Valid}
            className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
          >
            [next]
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold text-foreground">
            review and mint
          </p>
          <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">token</span>
              <span className="text-foreground">
                {name} (${ticker})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">supply</span>
              <span className="text-foreground">
                {supplyNum.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">burn fee</span>
              <span className="text-foreground">{burnFee}% per trade</span>
            </div>
            <div className="flex justify-between border-t border-white/5 pt-2">
              <span className="text-muted">launch fee</span>
              <span className="text-mint font-bold">10 xrp</span>
            </div>
          </div>
          <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">1</span>
              <span className="text-foreground">create issuer account</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">2</span>
              <span className="text-foreground">
                set burn fee on-ledger
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">3</span>
              <span className="text-foreground">open your trust line</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">4</span>
              <span className="text-foreground">
                deliver full supply to you
              </span>
            </div>
          </div>
          {!userId && (
            <p className="text-xs text-muted text-center">
              connect your wallet in the lobby first
            </p>
          )}
          <button
            onClick={handleLaunch}
            disabled={!userId || launching}
            className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
          >
            {launching ? "minting on testnet (~30s)..." : "[mint it]"}
          </button>
          {error && (
            <p className="text-[10px] text-red-400 text-center">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function SideBView({ onBack }: { onBack: () => void }) {
  const { userId } = useWallet();
  const [rows, setRows] = useState<ParticipationRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [goal, setGoal] = useState("1000");
  const [creating, setCreating] = useState(false);
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

  const load = () => {
    fetch("/api/participate")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setRows(res.data);
      })
      .catch(() => {});
  };

  useEffect(load, []);

  async function handleCreate() {
    if (!userId || !name.trim() || !/^[a-zA-Z0-9]{3,20}$/.test(ticker)) return;
    setCreating(true);
    try {
      const res = await fetch("/api/participate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId: userId,
          name: name.trim(),
          ticker: ticker.trim(),
          xpGoal: parseInt(goal, 10) || 1000,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        setName("");
        setTicker("");
        load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleAction(launchId: string, action: string) {
    if (!userId) return;
    try {
      const res = await fetch(`/api/participate/${launchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const data = await res.json();
      setActionMsg((prev) => ({
        ...prev,
        [launchId]: data.success
          ? `+${data.data.awarded} xp${data.data.thresholdMet ? " — goal hit!" : ""}`
          : data.error,
      }));
      if (data.success) load();
    } catch {
      // leave previous message
    }
  }

  return (
    <div className="flex flex-col gap-6 py-8">
      <button
        onClick={onBack}
        className="text-xs text-muted hover:text-foreground self-start"
      >
        &larr; back
      </button>

      <header>
        <h1 className="text-xl font-bold text-mint">[participation launches]</h1>
        <p className="text-xs text-muted">
          community first, token later. 1 xp = 1 token at tge.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {rows.length === 0 && (
          <div className="rounded-lg bg-card border border-white/5 p-6 text-center text-xs text-muted">
            no participation launches yet — start the first one
          </div>
        )}
        {rows.map((p) => {
          const pct = Math.min(100, (p.total_xp / p.xp_goal) * 100);
          const goalHit = p.total_xp >= p.xp_goal;
          return (
            <div
              key={p.id}
              className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {p.name} <span className="text-mint">${p.ticker}</span>
                </p>
                {goalHit ? (
                  <span className="text-[10px] font-medium text-mint bg-mint/10 px-2 py-0.5 rounded-full">
                    goal hit — tge ready
                  </span>
                ) : (
                  <span className="text-xs text-muted">
                    {p.participants} in
                  </span>
                )}
              </div>
              <div className="w-full bg-white/5 rounded-full h-2">
                <div
                  className="bg-mint h-2 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted">
                <span>
                  {p.total_xp.toLocaleString()} /{" "}
                  {p.xp_goal.toLocaleString()} xp
                </span>
                <span>{Math.round(pct)}%</span>
              </div>

              {goalHit && (
                <div className="rounded-lg bg-mint/5 border border-mint/10 p-3 text-xs text-mint">
                  tge preview: {p.total_xp.toLocaleString()} ${p.ticker} minted,
                  1 xp = 1 token, claim via trust line. execution coming soon.
                </div>
              )}

              {userId && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(p.id, "join")}
                    className="flex-1 py-2 rounded-lg bg-mint/10 text-mint text-xs font-medium hover:bg-mint/20 transition-colors"
                  >
                    [join +100]
                  </button>
                  <button
                    onClick={() => handleAction(p.id, "checkin")}
                    className="flex-1 py-2 rounded-lg bg-white/5 text-mint text-xs font-medium hover:bg-white/10 transition-colors"
                  >
                    [check in +50]
                  </button>
                  <button
                    onClick={() => handleAction(p.id, "share")}
                    className="flex-1 py-2 rounded-lg bg-white/5 text-mint text-xs font-medium hover:bg-white/10 transition-colors"
                  >
                    [share +50]
                  </button>
                </div>
              )}
              {actionMsg[p.id] && (
                <p className="text-[10px] text-mint">{actionMsg[p.id]}</p>
              )}
            </div>
          );
        })}
      </div>

      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full py-3 rounded-lg bg-card border border-white/5 text-mint text-sm font-medium hover:border-mint/20 transition-colors"
        >
          [start a participation launch]
        </button>
      ) : (
        <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-foreground">
            start a participation launch
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="project name"
            maxLength={40}
            className="w-full bg-[#1b1d28] border border-white/5 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={ticker}
              onChange={(e) =>
                setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
              }
              placeholder="TICKER"
              maxLength={20}
              className="flex-1 bg-[#1b1d28] border border-white/5 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
            <input
              type="number"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="xp goal"
              className="flex-1 bg-[#1b1d28] border border-white/5 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="flex-1 py-2.5 rounded-lg bg-white/5 text-muted text-xs font-semibold"
            >
              [cancel]
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim() || !/^[a-zA-Z0-9]{3,20}$/.test(ticker)}
              className="flex-1 py-2.5 rounded-lg bg-mint text-[#1b1d28] text-xs font-semibold disabled:opacity-40"
            >
              {creating ? "creating..." : "[create]"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
