"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import Sparkline from "@/components/Sparkline";
import { type PoolInfo, xrp, age, formatNum } from "@/lib/pool-ui";

type Position = {
  lpBalance: number;
  lpSupply: number;
  sharePct: number;
  valueDrops: number;
  ammAccount: string;
};

type Trade = {
  tx_hash: string;
  side: "buy" | "sell";
  token_amount: number;
  xrp_drops: number;
  price: number;
  executed_at: string;
};

export default function PoolDetailPage({
  params,
}: {
  params: Promise<{ launchId: string }>;
}) {
  const { launchId } = use(params);
  const { userId, address } = useWallet();

  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [tokenAmt, setTokenAmt] = useState("");
  const [xrpAmt, setXrpAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const fetchAll = useCallback(() => {
    fetch("/api/pools")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const p = (res.data as PoolInfo[]).find(
            (x) => x.launchId === launchId
          );
          setPool(p ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(`/api/charts/${launchId}?interval=5m`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setTrades(res.data.trades ?? []);
      })
      .catch(() => {});

    if (address) {
      fetch(`/api/pools/position?launchId=${launchId}&address=${address}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.success) setPosition(res.data);
        })
        .catch(() => {});
    }
  }, [launchId, address]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function submit() {
    if (!userId || busy) return;
    const t = parseFloat(tokenAmt);
    const x = parseFloat(xrpAmt);
    if (!t || !x) return;

    setBusy(true);
    setTxError(null);
    setTxResult(null);
    try {
      const devSecret = localStorage.getItem("tl_dev_secret") ?? "";
      const res = await fetch(`/api/pools/${tab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          launchId,
          tokenAmount: t,
          xrpAmount: x,
          devSecret,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setTxResult(json.data.depositTx ?? json.data.withdrawTx);
        setTokenAmt("");
        setXrpAmt("");
        fetchAll();
      } else {
        setTxError(json.error ?? `${tab} failed`);
      }
    } catch {
      setTxError("network error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted">loading pool...</p>
      </div>
    );
  }

  if (!pool || !pool.exists) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-muted">no pool found for this token</p>
        <Link href="/pools" className="text-xs text-mint">
          &larr; back to pools
        </Link>
      </div>
    );
  }

  const stats = pool.stats;
  const tokenBal = parseFloat(pool.tokenBalance ?? "0");
  const xrpBal = parseFloat(pool.xrpBalance ?? "0");

  return (
    <div className="flex flex-col gap-5 py-8">
      <Link
        href="/pools"
        className="text-xs text-muted hover:text-foreground self-start"
      >
        &larr; back to pools
      </Link>

      {/* Header: pair + APR headline */}
      <header className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">
              {pool.ticker} / XRP
            </h1>
            {pool.tradingFee !== undefined && (
              <span className="text-[10px] text-mint bg-mint/10 px-2 py-0.5 rounded-full">
                {(pool.tradingFee / 1000).toFixed(2)}% fee
              </span>
            )}
          </div>
          <p className="text-xs text-muted">
            {pool.name} · pool age {age(pool.createdAt)}
          </p>
        </div>
        <div className="rounded-lg border border-mint/30 px-3 py-2 text-center">
          <p className="text-lg font-bold text-mint">
            {stats?.aprPct !== null && stats?.aprPct !== undefined
              ? `${stats.aprPct.toFixed(2)}%`
              : "--"}
          </p>
          <p className="text-[9px] text-muted">24h fee apr</p>
        </div>
      </header>

      {txResult && (
        <div className="rounded-lg bg-mint/10 border border-mint/20 p-3 text-sm text-mint">
          {tab === "deposit" ? "liquidity added" : "liquidity removed"} — tx:{" "}
          {txResult.slice(0, 12)}...
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Left: pool stats */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
            <div>
              <p className="text-xs text-muted">total value locked</p>
              <p className="text-2xl font-bold text-foreground">
                {xrp(pool.tvlDrops)} xrp
              </p>
            </div>

            <div className="border-t border-white/5 pt-3">
              <p className="text-xs font-semibold text-muted mb-2">
                liquidity allocation
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">{pool.ticker}</span>
                  <span className="text-foreground">
                    {formatNum(tokenBal)}{" "}
                    <span className="text-muted">(50%)</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">XRP</span>
                  <span className="text-foreground">
                    {formatNum(xrpBal)}{" "}
                    <span className="text-muted">(50%)</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-white/5 pt-3 grid grid-cols-2 gap-y-2 text-xs">
              <span className="text-muted">current price</span>
              <span className="text-right font-mono text-foreground">
                {stats?.priceXrp ? stats.priceXrp.toFixed(6) : "--"} xrp
              </span>
              <span className="text-muted">24h volume</span>
              <span className="text-right text-foreground">
                {xrp(stats?.volume24hDrops)} xrp
              </span>
              <span className="text-muted">24h fees</span>
              <span className="text-right text-foreground">
                {xrp(stats?.fees24hDrops)} xrp
              </span>
              <span className="text-muted">24h trades</span>
              <span className="text-right text-foreground">
                {stats?.trades24h ?? 0}
              </span>
              <span className="text-muted">lp supply</span>
              <span className="text-right text-foreground">
                {formatNum(parseFloat(pool.lpToken?.value ?? "0"))}
              </span>
            </div>

            {stats && stats.sparkline.length > 0 && (
              <div className="border-t border-white/5 pt-3 flex items-center justify-between">
                <p className="text-xs text-muted">24h trend</p>
                <Sparkline points={stats.sparkline} width={160} height={36} />
              </div>
            )}

            {pool.ammAccount && (
              <p className="text-[10px] text-muted font-mono border-t border-white/5 pt-3">
                amm: {pool.ammAccount}
              </p>
            )}
          </div>
        </div>

        {/* Right: your position + deposit/withdraw */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-card border border-white/5 p-4">
            <p className="text-xs font-semibold text-muted mb-2">
              your position
            </p>
            {!address ? (
              <p className="text-xs text-muted/60">
                connect a wallet to see your position
              </p>
            ) : position ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {formatNum(position.lpBalance)}
                  </p>
                  <p className="text-[9px] text-muted">lp tokens</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {position.sharePct.toFixed(2)}%
                  </p>
                  <p className="text-[9px] text-muted">pool share</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-mint">
                    {xrp(position.valueDrops)} xrp
                  </p>
                  <p className="text-[9px] text-muted">value</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted/60">loading position...</p>
            )}
          </div>

          {userId && (
            <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
              <div className="flex gap-4 border-b border-white/5 pb-2">
                {(["deposit", "withdraw"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTab(t);
                      setTxError(null);
                    }}
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

              <div className="flex flex-col gap-2">
                <input
                  type="number"
                  value={tokenAmt}
                  onChange={(e) => setTokenAmt(e.target.value)}
                  placeholder={`${pool.ticker} amount`}
                  className="w-full bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
                />
                <input
                  type="number"
                  value={xrpAmt}
                  onChange={(e) => setXrpAmt(e.target.value)}
                  placeholder="xrp amount"
                  className="w-full bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
                />
              </div>

              {txError && <p className="text-xs text-red-400">{txError}</p>}

              <button
                onClick={submit}
                disabled={busy || !tokenAmt || !xrpAmt}
                className={`w-full py-3 rounded-lg font-semibold text-sm disabled:opacity-40 ${
                  tab === "deposit"
                    ? "bg-mint text-[#1b1d28]"
                    : "bg-red-500/80 text-white"
                }`}
              >
                {busy ? "..." : `[${tab}]`}
              </button>
            </div>
          )}

          {/* Recent trades — straight from the ledger */}
          <div className="rounded-lg bg-card border border-white/5 p-4">
            <p className="text-xs font-semibold text-muted mb-2">
              recent trades
            </p>
            {trades.length === 0 ? (
              <p className="text-xs text-muted/60">no swaps recorded yet</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {trades.slice(0, 10).map((t) => (
                  <div
                    key={t.tx_hash}
                    className="flex items-center justify-between text-[10px]"
                  >
                    <span
                      className={
                        t.side === "buy" ? "text-mint" : "text-red-400"
                      }
                    >
                      {t.side}
                    </span>
                    <span className="text-foreground">
                      {formatNum(t.token_amount)} {pool.ticker}
                    </span>
                    <span className="text-muted">
                      @ {t.price.toFixed(6)}
                    </span>
                    <span className="text-muted font-mono">
                      {t.tx_hash.slice(0, 6)}...
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted/50 text-center">
        live — xrpl native amm (XLS-30) · all stats from validated on-ledger data
      </p>
    </div>
  );
}
