"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import Sparkline from "@/components/Sparkline";
import { type PoolInfo, xrp, age } from "@/lib/pool-ui";

type PositionPnl = {
  depositedDrops: number;
  withdrawnDrops: number;
  pnlDrops: number | null;
  pnlPct: number | null;
  feesEarnedDrops: number | null;
  impermanentLossDrops: number | null;
  eventCount: number;
  approx: boolean;
};

type Position = {
  launchId: string;
  ticker: string;
  ammAccount: string;
  tradingFee: number;
  lpBalance: number;
  lpSupply: number;
  sharePct: number;
  yourTokens: number;
  yourXrpDrops: number;
  poolTvlDrops: number;
  pnl?: PositionPnl;
};

type View = "discover" | "portfolio";
type Category = "all" | "top" | "new";
type SortKey = "tvl" | "volume" | "fees" | "apr" | "age" | "trades";

function PctChange({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return null;
  const positive = pct >= 0;
  return (
    <span
      className={`block text-[10px] ${positive ? "text-mint" : "text-red-400"}`}
    >
      {positive ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

function num(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export default function PoolsPage() {
  const { userId, address } = useWallet();
  const router = useRouter();

  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("discover");
  const [category, setCategory] = useState<Category>("all");
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tvl");
  const [sortDesc, setSortDesc] = useState(true);

  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createLaunchId, setCreateLaunchId] = useState("");
  const [createTokenAmt, setCreateTokenAmt] = useState("");
  const [createXrpAmt, setCreateXrpAmt] = useState("");
  const [createFee, setCreateFee] = useState(100);
  const [createBusy, setCreateBusy] = useState(false);
  const [createResult, setCreateResult] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  function fetchPools() {
    setLoading(true);
    fetch("/api/pools")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setPools(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchPools();
  }, []);

  const fetchPositions = useCallback(() => {
    if (!address) return;
    setPositionsLoading(true);
    fetch(`/api/pools/positions?address=${address}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setPositions(res.data.positions);
      })
      .catch(() => {})
      .finally(() => setPositionsLoading(false));
  }, [address]);

  useEffect(() => {
    if (view === "portfolio") fetchPositions();
  }, [view, fetchPositions]);

  const activePools = pools.filter((p) => p.exists);
  const availableTokens = pools.filter((p) => !p.exists);

  const totalTvl = activePools.reduce((s, p) => s + (p.tvlDrops ?? 0), 0);
  const totalVol = activePools.reduce(
    (s, p) => s + (p.stats?.volume24hDrops ?? 0),
    0
  );
  const totalFees = activePools.reduce(
    (s, p) => s + (p.stats?.fees24hDrops ?? 0),
    0
  );

  const sortVal = useCallback(
    (p: PoolInfo, key: SortKey): number => {
      switch (key) {
        case "tvl":
          return p.tvlDrops ?? 0;
        case "volume":
          return p.stats?.volume24hDrops ?? 0;
        case "fees":
          return p.stats?.fees24hDrops ?? 0;
        case "apr":
          return p.stats?.aprPct ?? -1;
        case "trades":
          return p.stats?.trades24h ?? 0;
        case "age":
          return -new Date(
            p.createdAt.includes("T")
              ? p.createdAt
              : p.createdAt.replace(" ", "T") + "Z"
          ).getTime();
      }
    },
    []
  );

  const visiblePools = useMemo(() => {
    let list = activePools;
    if (filter) {
      const f = filter.toLowerCase();
      list = list.filter(
        (p) =>
          p.ticker.toLowerCase().includes(f) ||
          p.name.toLowerCase().includes(f)
      );
    }
    let key = sortKey;
    let desc = sortDesc;
    if (category === "top") {
      key = "apr";
      desc = true;
    } else if (category === "new") {
      key = "age";
      desc = false;
    }
    return [...list].sort((a, b) => {
      const d = sortVal(a, key) - sortVal(b, key);
      return desc ? -d : d;
    });
  }, [activePools, filter, category, sortKey, sortDesc, sortVal]);

  function headerSort(key: SortKey) {
    setCategory("all");
    if (sortKey === key) setSortDesc(!sortDesc);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  async function handleCreate() {
    if (!userId || createBusy) return;
    const tokenAmt = parseFloat(createTokenAmt);
    const xrpAmt = parseFloat(createXrpAmt);
    if (!tokenAmt || !xrpAmt || !createLaunchId) return;

    setCreateBusy(true);
    setCreateError(null);
    setCreateResult(null);
    try {
      const devSecret = localStorage.getItem("tl_dev_secret") ?? "";
      const res = await fetch("/api/pools/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          launchId: createLaunchId,
          tokenAmount: tokenAmt,
          xrpAmount: xrpAmt,
          tradingFee: createFee,
          devSecret,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setCreateResult(json.data.ammTx);
        setShowCreate(false);
        setCreateLaunchId("");
        setCreateTokenAmt("");
        setCreateXrpAmt("");
        fetchPools();
      } else {
        setCreateError(json.error ?? "pool creation failed");
      }
    } catch {
      setCreateError("network error");
    } finally {
      setCreateBusy(false);
    }
  }

  const totalPositionDrops = positions.reduce(
    (s, p) => s + p.yourXrpDrops * 2,
    0
  );

  const SORT_COLS: { key: SortKey; label: string }[] = [
    { key: "age", label: "age" },
    { key: "tvl", label: "tvl" },
    { key: "volume", label: "24h volume" },
    { key: "fees", label: "24h fees" },
    { key: "apr", label: "fee apr" },
    { key: "trades", label: "trades" },
  ];

  return (
    <div className="relative left-1/2 -translate-x-1/2 w-[min(100vw,1280px)] px-4 flex flex-col gap-5 py-8">
      {/* Header: title left, global stats right (meteora-style) */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-mint">[pools]</h1>
          <p className="text-xs text-muted">
            be the house. provide liquidity. earn trading fees.
          </p>
        </div>
        <div className="flex gap-8">
          {[
            { label: "total value locked", value: `${xrp(totalTvl)} xrp` },
            { label: "24h volume", value: `${xrp(totalVol)} xrp` },
            { label: "24h fees", value: `${xrp(totalFees)} xrp` },
          ].map((s) => (
            <div key={s.label} className="text-right">
              <p className="text-[10px] text-muted">{s.label}</p>
              <p className="text-lg font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      </header>

      {/* View switcher + toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-card border border-white/5 p-1">
          {(["discover", "portfolio"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === v
                  ? "bg-mint text-[#1b1d28]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              [{v}]
            </button>
          ))}
        </div>

        {view === "discover" && (
          <>
            <div className="flex gap-3 text-xs">
              {(
                [
                  ["all", "all"],
                  ["top", "top performers"],
                  ["new", "new"],
                ] as [Category, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCategory(key)}
                  className={`transition-colors ${
                    category === key
                      ? "text-mint font-semibold"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter token"
              className="flex-1 min-w-0 sm:max-w-xs bg-card border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
            <span className="hidden sm:inline text-[10px] text-muted bg-card border border-white/5 rounded-lg px-2.5 py-2">
              24h
            </span>
            {userId && availableTokens.length > 0 && (
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="px-4 py-2 rounded-lg bg-mint text-[#1b1d28] font-semibold text-xs flex-shrink-0"
              >
                {showCreate ? "[cancel]" : "[create pool]"}
              </button>
            )}
          </>
        )}
      </div>

      {createResult && (
        <div className="rounded-lg bg-mint/10 border border-mint/20 p-3 text-sm text-mint">
          pool created — tx: {createResult.slice(0, 12)}...
        </div>
      )}

      {/* Create pool form */}
      {view === "discover" && showCreate && (
        <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-4 max-w-xl">
          <p className="text-sm font-semibold text-foreground">
            create a new amm pool
          </p>
          <p className="text-[10px] text-muted">
            10 xrp platform fee — pool is created on-ledger via xrpl native amm
          </p>
          <select
            value={createLaunchId}
            onChange={(e) => setCreateLaunchId(e.target.value)}
            className="w-full bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-mint/30"
          >
            <option value="">select a token</option>
            {availableTokens.map((t) => (
              <option key={t.launchId} value={t.launchId}>
                {t.ticker} / XRP
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              value={createTokenAmt}
              onChange={(e) => setCreateTokenAmt(e.target.value)}
              placeholder="token amount"
              className="bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
            <input
              type="number"
              value={createXrpAmt}
              onChange={(e) => setCreateXrpAmt(e.target.value)}
              placeholder="xrp amount"
              className="bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "0.3%", value: 30 },
              { label: "0.5%", value: 50 },
              { label: "1.0%", value: 100 },
            ].map((fee) => (
              <button
                key={fee.value}
                onClick={() => setCreateFee(fee.value)}
                className={`rounded-lg border p-2 text-sm transition-colors ${
                  createFee === fee.value
                    ? "bg-mint/10 border-mint/30 text-mint"
                    : "bg-[#1b1d28] border-white/10 text-foreground hover:border-mint/20"
                }`}
              >
                {fee.label}
              </button>
            ))}
          </div>
          {createError && <p className="text-xs text-red-400">{createError}</p>}
          <button
            onClick={handleCreate}
            disabled={
              createBusy || !createLaunchId || !createTokenAmt || !createXrpAmt
            }
            className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
          >
            {createBusy ? "creating pool..." : "[create pool — 10 xrp]"}
          </button>
        </div>
      )}

      {/* ================= DISCOVER ================= */}
      {view === "discover" && (
        <>
          <div className="rounded-lg bg-card border border-white/5 overflow-x-auto">
            <table className="w-full min-w-[960px] text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] text-muted">
                  <th className="text-left font-medium px-3 py-2.5 w-8">#</th>
                  <th className="text-left font-medium px-3 py-2.5">pool</th>
                  <th className="text-left font-medium px-3 py-2.5">
                    price trend
                  </th>
                  <th className="text-right font-medium px-3 py-2.5">price</th>
                  {SORT_COLS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => headerSort(c.key)}
                      className={`text-right font-medium px-3 py-2.5 cursor-pointer select-none hover:text-foreground transition-colors ${
                        sortKey === c.key && category === "all"
                          ? "text-mint"
                          : ""
                      }`}
                    >
                      {c.label}
                      {sortKey === c.key && category === "all" && (
                        <span className="ml-0.5">{sortDesc ? "↓" : "↑"}</span>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={11}
                      className="text-center py-10 text-muted text-xs"
                    >
                      querying amm pools on-ledger...
                    </td>
                  </tr>
                )}
                {!loading && visiblePools.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-10">
                      <p className="text-sm text-muted">no pools yet</p>
                      <p className="text-[10px] text-muted/60 mt-1">
                        create the first pool for a launched token
                      </p>
                    </td>
                  </tr>
                )}
                {visiblePools.map((pool, i) => (
                  <tr
                    key={pool.launchId}
                    onClick={() => router.push(`/pools/${pool.launchId}`)}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-3 text-muted">#{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-mint/15 flex items-center justify-center text-[10px] font-bold text-mint flex-shrink-0">
                          {pool.ticker[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">
                            {pool.ticker}-XRP
                          </p>
                          <p className="text-[10px] text-muted">
                            fee:{" "}
                            {pool.tradingFee !== undefined
                              ? `${(pool.tradingFee / 1000).toFixed(2)}%`
                              : "--"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Sparkline points={pool.stats?.sparkline ?? []} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-foreground font-mono">
                        {pool.stats?.priceXrp != null
                          ? pool.stats.priceXrp.toFixed(6)
                          : "--"}
                      </span>
                      <PctChange pct={pool.stats?.priceChange24hPct} />
                    </td>
                    <td className="px-3 py-3 text-right text-muted">
                      {age(pool.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {xrp(pool.tvlDrops)} xrp
                    </td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {xrp(pool.stats?.volume24hDrops)} xrp
                    </td>
                    <td className="px-3 py-3 text-right text-foreground">
                      {xrp(pool.stats?.fees24hDrops)} xrp
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span
                        className={
                          (pool.stats?.aprPct ?? 0) > 0
                            ? "text-mint font-semibold"
                            : "text-muted"
                        }
                      >
                        {pool.stats?.aprPct != null
                          ? `${pool.stats.aprPct.toFixed(1)}%`
                          : "--"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-muted">
                      {pool.stats?.trades24h ?? 0}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-mint/10 text-mint hover:bg-mint/20 transition-colors">
                        ⚡
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tokens without pools */}
          {availableTokens.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold text-muted">
                tokens without pools ({availableTokens.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                {availableTokens.map((t) => (
                  <button
                    key={t.launchId}
                    onClick={() => {
                      setCreateLaunchId(t.launchId);
                      setShowCreate(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="rounded-lg bg-card border border-white/5 px-3 py-2 text-xs text-foreground hover:border-mint/30 transition-colors"
                  >
                    {t.ticker} / XRP{" "}
                    <span className="text-mint">[create pool]</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ================= PORTFOLIO ================= */}
      {view === "portfolio" && (
        <>
          {!address && (
            <p className="text-xs text-muted text-center py-10">
              connect your wallet in the lobby to see your positions
            </p>
          )}

          {address && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-2xl">
                {[
                  {
                    label: "total position value",
                    value: `${xrp(totalPositionDrops)} xrp`,
                  },
                  {
                    label: "live positions",
                    value: String(positions.length),
                  },
                  {
                    label: "wallet",
                    value: `${address.slice(0, 6)}...${address.slice(-4)}`,
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-lg bg-card border border-white/5 p-3"
                  >
                    <p className="text-[10px] text-muted">{s.label}</p>
                    <p className="text-base font-bold text-foreground">
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-card border border-white/5 overflow-x-auto">
                <table className="w-full min-w-[1080px] text-xs">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] text-muted">
                      <th className="text-left font-medium px-3 py-2.5">
                        pool
                      </th>
                      <th className="text-right font-medium px-3 py-2.5">
                        your liquidity
                      </th>
                      <th className="text-right font-medium px-3 py-2.5">
                        deposited
                      </th>
                      <th className="text-right font-medium px-3 py-2.5">
                        pnl
                      </th>
                      <th className="text-right font-medium px-3 py-2.5">
                        fees earned
                      </th>
                      <th className="text-right font-medium px-3 py-2.5">
                        impermanent loss
                      </th>
                      <th className="text-right font-medium px-3 py-2.5">
                        pool share
                      </th>
                      <th className="text-right font-medium px-3 py-2.5">
                        fee tier
                      </th>
                      <th className="px-3 py-2.5 w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {positionsLoading && (
                      <tr>
                        <td
                          colSpan={9}
                          className="text-center py-10 text-muted"
                        >
                          reading your lp positions from the ledger...
                        </td>
                      </tr>
                    )}
                    {!positionsLoading && positions.length === 0 && (
                      <tr>
                        <td colSpan={9} className="text-center py-10">
                          <p className="text-sm text-muted">
                            no positions yet
                          </p>
                          <p className="text-[10px] text-muted/60 mt-1">
                            deposit into a pool to start earning fees
                          </p>
                        </td>
                      </tr>
                    )}
                    {positions.map((pos) => {
                      const pnl = pos.pnl;
                      const hasPnl = pnl && pnl.pnlDrops !== null;
                      return (
                        <tr
                          key={pos.launchId}
                          className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors"
                        >
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-mint/15 flex items-center justify-center text-[10px] font-bold text-mint">
                                {pos.ticker[0]}
                              </div>
                              <span className="font-semibold text-foreground">
                                {pos.ticker}-XRP
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="block text-foreground">
                              {num(pos.yourTokens)} {pos.ticker.toLowerCase()}
                            </span>
                            <span className="block text-muted text-[10px]">
                              {xrp(pos.yourXrpDrops)} xrp ·{" "}
                              {xrp(pos.yourXrpDrops * 2)} xrp total
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right text-foreground">
                            {hasPnl ? `${xrp(pnl.depositedDrops)} xrp` : "--"}
                            {hasPnl && pnl.withdrawnDrops > 0 && (
                              <span className="block text-[10px] text-muted">
                                −{xrp(pnl.withdrawnDrops)} withdrawn
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {hasPnl ? (
                              <>
                                <span
                                  className={`font-semibold ${
                                    (pnl.pnlDrops ?? 0) >= 0
                                      ? "text-mint"
                                      : "text-red-400"
                                  }`}
                                >
                                  {(pnl.pnlDrops ?? 0) >= 0 ? "+" : ""}
                                  {xrp(pnl.pnlDrops)} xrp
                                </span>
                                {pnl.pnlPct !== null && (
                                  <span
                                    className={`block text-[10px] ${
                                      pnl.pnlPct >= 0
                                        ? "text-mint/70"
                                        : "text-red-400/70"
                                    }`}
                                  >
                                    {pnl.pnlPct >= 0 ? "+" : ""}
                                    {pnl.pnlPct.toFixed(2)}%
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-muted">--</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {hasPnl && pnl.feesEarnedDrops !== null ? (
                              <span className="text-mint">
                                +{xrp(Math.max(0, pnl.feesEarnedDrops))} xrp
                                {pnl.approx && (
                                  <span className="text-muted text-[9px]">
                                    {" "}
                                    ~
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted">--</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {hasPnl && pnl.impermanentLossDrops !== null ? (
                              <span
                                className={
                                  pnl.impermanentLossDrops >= 0
                                    ? "text-muted"
                                    : "text-amber-400"
                                }
                              >
                                {xrp(pnl.impermanentLossDrops)} xrp
                              </span>
                            ) : (
                              <span className="text-muted">--</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right text-mint font-semibold">
                            {pos.sharePct.toFixed(2)}%
                          </td>
                          <td className="px-3 py-3 text-right text-muted">
                            {(pos.tradingFee / 1000).toFixed(2)}%
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() =>
                                router.push(`/pools/${pos.launchId}`)
                              }
                              className="text-mint hover:text-mint/70 text-[10px] font-medium"
                            >
                              [manage →]
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <p className="text-[10px] text-muted/50 text-center">
        live — xrpl native amm (xls-30) · all stats from validated on-ledger
        data
      </p>
    </div>
  );
}
