"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";

type PoolInfo = {
  launchId: string;
  ticker: string;
  currencyHex: string;
  issuerAddress: string;
  exists: boolean;
  ammAccount?: string;
  tokenBalance?: string;
  xrpBalance?: string;
  lpToken?: { currency: string; issuer: string; value: string };
  tradingFee?: number;
};

function formatNum(v: string | undefined): string {
  if (!v) return "0";
  const n = parseFloat(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(6);
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

  const [depositPool, setDepositPool] = useState<string | null>(null);
  const [depositTokenAmt, setDepositTokenAmt] = useState("");
  const [depositXrpAmt, setDepositXrpAmt] = useState("");
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositResult, setDepositResult] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);

  const [withdrawPool, setWithdrawPool] = useState<string | null>(null);
  const [withdrawTokenAmt, setWithdrawTokenAmt] = useState("");
  const [withdrawXrpAmt, setWithdrawXrpAmt] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

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

  async function handleDeposit(launchId: string) {
    if (!userId || depositBusy) return;
    const tokenAmt = parseFloat(depositTokenAmt);
    const xrpAmt = parseFloat(depositXrpAmt);
    if (!tokenAmt || !xrpAmt) return;

    setDepositBusy(true);
    setDepositError(null);
    setDepositResult(null);
    try {
      const devSecret = localStorage.getItem("tl_dev_secret") ?? "";
      const res = await fetch("/api/pools/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          launchId,
          tokenAmount: tokenAmt,
          xrpAmount: xrpAmt,
          devSecret,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setDepositResult(json.data.depositTx);
        setDepositPool(null);
        setDepositTokenAmt("");
        setDepositXrpAmt("");
        fetchPools();
      } else {
        setDepositError(json.error ?? "deposit failed");
      }
    } catch {
      setDepositError("network error");
    } finally {
      setDepositBusy(false);
    }
  }

  async function handleWithdraw(launchId: string) {
    if (!userId || withdrawBusy) return;
    const tokenAmt = parseFloat(withdrawTokenAmt);
    const xrpAmt = parseFloat(withdrawXrpAmt);
    if (!tokenAmt || !xrpAmt) return;

    setWithdrawBusy(true);
    setWithdrawError(null);
    setWithdrawResult(null);
    try {
      const devSecret = localStorage.getItem("tl_dev_secret") ?? "";
      const res = await fetch("/api/pools/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          launchId,
          tokenAmount: tokenAmt,
          xrpAmount: xrpAmt,
          devSecret,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setWithdrawResult(json.data.withdrawTx);
        setWithdrawPool(null);
        setWithdrawTokenAmt("");
        setWithdrawXrpAmt("");
        fetchPools();
      } else {
        setWithdrawError(json.error ?? "withdraw failed");
      }
    } catch {
      setWithdrawError("network error");
    } finally {
      setWithdrawBusy(false);
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

      {createResult && (
        <div className="rounded-lg bg-mint/10 border border-mint/20 p-3 text-sm text-mint">
          pool created — tx: {createResult.slice(0, 12)}...
        </div>
      )}

      {depositResult && (
        <div className="rounded-lg bg-mint/10 border border-mint/20 p-3 text-sm text-mint">
          liquidity added — tx: {depositResult.slice(0, 12)}...
        </div>
      )}

      {withdrawResult && (
        <div className="rounded-lg bg-mint/10 border border-mint/20 p-3 text-sm text-mint">
          liquidity removed — tx: {withdrawResult.slice(0, 12)}...
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

      {/* Active pools */}
      <h2 className="text-sm font-semibold text-muted">
        active pools ({activePools.length})
      </h2>

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
        {activePools.map((pool) => (
          <div
            key={pool.launchId}
            className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {pool.ticker} / XRP
              </p>
              {pool.tradingFee !== undefined && (
                <span className="text-xs text-mint font-medium">
                  {(pool.tradingFee / 1000).toFixed(2)}% fee
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted">token: </span>
                <span className="text-foreground">
                  {formatNum(pool.tokenBalance)}
                </span>
              </div>
              <div>
                <span className="text-muted">xrp: </span>
                <span className="text-foreground">
                  {formatNum(pool.xrpBalance)}
                </span>
              </div>
            </div>
            {pool.lpToken && (
              <div className="text-[10px] text-muted">
                LP supply: {formatNum(pool.lpToken.value)}
              </div>
            )}
            {pool.ammAccount && (
              <div className="text-[10px] text-muted font-mono">
                amm: {pool.ammAccount.slice(0, 8)}...
                {pool.ammAccount.slice(-4)}
              </div>
            )}

            {userId && (
              <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
                {depositPool === pool.launchId ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-foreground font-medium">
                      add liquidity
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={depositTokenAmt}
                        onChange={(e) => setDepositTokenAmt(e.target.value)}
                        placeholder={`${pool.ticker} amount`}
                        className="bg-[#1b1d28] border border-white/10 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
                      />
                      <input
                        type="number"
                        value={depositXrpAmt}
                        onChange={(e) => setDepositXrpAmt(e.target.value)}
                        placeholder="xrp amount"
                        className="bg-[#1b1d28] border border-white/10 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
                      />
                    </div>
                    {depositError && (
                      <p className="text-[10px] text-red-400">{depositError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeposit(pool.launchId)}
                        disabled={
                          depositBusy || !depositTokenAmt || !depositXrpAmt
                        }
                        className="flex-1 py-1.5 rounded bg-mint text-[#1b1d28] text-xs font-semibold disabled:opacity-40"
                      >
                        {depositBusy ? "..." : "[deposit]"}
                      </button>
                      <button
                        onClick={() => {
                          setDepositPool(null);
                          setDepositError(null);
                        }}
                        className="px-3 py-1.5 rounded bg-white/5 text-muted text-xs"
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                ) : withdrawPool === pool.launchId ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-foreground font-medium">
                      remove liquidity
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={withdrawTokenAmt}
                        onChange={(e) => setWithdrawTokenAmt(e.target.value)}
                        placeholder={`${pool.ticker} amount`}
                        className="bg-[#1b1d28] border border-white/10 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
                      />
                      <input
                        type="number"
                        value={withdrawXrpAmt}
                        onChange={(e) => setWithdrawXrpAmt(e.target.value)}
                        placeholder="xrp amount"
                        className="bg-[#1b1d28] border border-white/10 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
                      />
                    </div>
                    {withdrawError && (
                      <p className="text-[10px] text-red-400">
                        {withdrawError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleWithdraw(pool.launchId)}
                        disabled={
                          withdrawBusy || !withdrawTokenAmt || !withdrawXrpAmt
                        }
                        className="flex-1 py-1.5 rounded bg-red-500/80 text-white text-xs font-semibold disabled:opacity-40"
                      >
                        {withdrawBusy ? "..." : "[withdraw]"}
                      </button>
                      <button
                        onClick={() => {
                          setWithdrawPool(null);
                          setWithdrawError(null);
                        }}
                        className="px-3 py-1.5 rounded bg-white/5 text-muted text-xs"
                      >
                        cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setDepositPool(pool.launchId);
                        setWithdrawPool(null);
                      }}
                      className="py-2 rounded-lg bg-white/5 text-mint text-xs font-medium hover:bg-white/10 transition-colors"
                    >
                      [add liquidity]
                    </button>
                    <button
                      onClick={() => {
                        setWithdrawPool(pool.launchId);
                        setDepositPool(null);
                      }}
                      className="py-2 rounded-lg bg-white/5 text-red-400 text-xs font-medium hover:bg-white/10 transition-colors"
                    >
                      [withdraw]
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
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
        live — xrpl native amm (XLS-30)
      </p>
    </div>
  );
}
