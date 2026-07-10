"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import Sparkline from "@/components/Sparkline";
import { type PoolInfo, xrp, age } from "@/lib/pool-ui";

function PctChange({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const positive = pct >= 0;
  return (
    <span className={`text-[10px] ${positive ? "text-mint" : "text-red-400"}`}>
      {positive ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

export default function PoolsPage() {
  const { userId } = useWallet();
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="flex flex-col gap-5 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-mint">[pools]</h1>
          <p className="text-xs text-muted">
            be the house. provide liquidity. earn trading fees.
          </p>
        </div>
        {userId && availableTokens.length > 0 && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm"
          >
            {showCreate ? "[cancel]" : "[create]"}
          </button>
        )}
      </header>

      {/* Global stats bar */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "total value locked", value: `${xrp(totalTvl)} xrp` },
          { label: "24h volume", value: `${xrp(totalVol)} xrp` },
          { label: "24h fees", value: `${xrp(totalFees)} xrp` },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-card border border-white/5 p-3 text-center"
          >
            <p className="text-sm font-bold text-mint">{s.value}</p>
            <p className="text-[10px] text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {createResult && (
        <div className="rounded-lg bg-mint/10 border border-mint/20 p-3 text-sm text-mint">
          pool created — tx: {createResult.slice(0, 12)}...
        </div>
      )}

      {/* Create pool form */}
      {showCreate && (
        <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-4">
          <p className="text-sm font-semibold text-foreground">
            create a new amm pool
          </p>
          <p className="text-[10px] text-muted">
            10 xrp platform fee — pool is created on-ledger via XRPL native AMM
          </p>

          <div>
            <label className="text-xs text-muted block mb-1">token</label>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">
                token amount
              </label>
              <input
                type="number"
                value={createTokenAmt}
                onChange={(e) => setCreateTokenAmt(e.target.value)}
                placeholder="0"
                className="w-full bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">
                xrp amount
              </label>
              <input
                type="number"
                value={createXrpAmt}
                onChange={(e) => setCreateXrpAmt(e.target.value)}
                placeholder="0"
                className="w-full bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">
              fee tier (basis points)
            </label>
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
          </div>

          {createError && (
            <p className="text-xs text-red-400">{createError}</p>
          )}

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

      {/* Pool table */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">
          active pools ({activePools.length})
        </h2>
        <span className="hidden sm:block text-[10px] text-muted/60">
          sorted by tvl
        </span>
      </div>

      {loading && (
        <p className="text-xs text-muted text-center py-4">
          querying amm pools...
        </p>
      )}

      {!loading && activePools.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted">no pools yet</p>
          <p className="text-xs text-muted/60 mt-1">
            create the first pool for a launched token
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {[...activePools]
          .sort((a, b) => (b.tvlDrops ?? 0) - (a.tvlDrops ?? 0))
          .map((pool) => (
            <Link
              key={pool.launchId}
              href={`/pools/${pool.launchId}`}
              className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3 hover:border-mint/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {pool.ticker} / XRP
                  </p>
                  {pool.tradingFee !== undefined && (
                    <span className="text-[10px] text-mint bg-mint/10 px-1.5 py-0.5 rounded-full">
                      {(pool.tradingFee / 1000).toFixed(2)}%
                    </span>
                  )}
                  <span className="text-[10px] text-muted/60">
                    {age(pool.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-xs font-mono text-foreground">
                      {pool.stats?.priceXrp
                        ? pool.stats.priceXrp.toFixed(6)
                        : "--"}{" "}
                      <span className="text-muted">xrp</span>
                    </p>
                    <PctChange pct={pool.stats?.priceChange24hPct ?? null} />
                  </div>
                  <Sparkline points={pool.stats?.sparkline ?? []} />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center border-t border-white/5 pt-2">
                <div>
                  <p className="text-xs text-foreground">
                    {xrp(pool.tvlDrops)}
                  </p>
                  <p className="text-[9px] text-muted">tvl (xrp)</p>
                </div>
                <div>
                  <p className="text-xs text-foreground">
                    {xrp(pool.stats?.volume24hDrops)}
                  </p>
                  <p className="text-[9px] text-muted">24h vol</p>
                </div>
                <div>
                  <p className="text-xs text-foreground">
                    {xrp(pool.stats?.fees24hDrops)}
                  </p>
                  <p className="text-[9px] text-muted">24h fees</p>
                </div>
                <div>
                  <p className="text-xs text-mint font-semibold">
                    {pool.stats?.aprPct !== null &&
                    pool.stats?.aprPct !== undefined
                      ? `${pool.stats.aprPct.toFixed(2)}%`
                      : "--"}
                  </p>
                  <p className="text-[9px] text-muted">fee apr</p>
                </div>
              </div>
            </Link>
          ))}
      </div>

      {/* Tokens without pools */}
      {availableTokens.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-muted mt-2">
            tokens without pools ({availableTokens.length})
          </h2>
          <div className="flex flex-col gap-2">
            {availableTokens.map((t) => (
              <div
                key={t.launchId}
                className="rounded-lg bg-card border border-white/5 p-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t.ticker} / XRP
                  </p>
                  <p className="text-[10px] text-muted">no pool — be first</p>
                </div>
                {userId && (
                  <button
                    onClick={() => {
                      setCreateLaunchId(t.launchId);
                      setShowCreate(true);
                    }}
                    className="text-xs text-mint hover:text-mint/70"
                  >
                    [create pool]
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-[10px] text-muted/50 text-center">
        live — xrpl native amm (XLS-30) · all stats from validated on-ledger data
      </p>
    </div>
  );
}
