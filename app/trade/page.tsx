"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import PriceChart from "@/components/PriceChart";
import DexScreenerEmbed from "@/components/DexScreenerEmbed";

type LaunchRow = {
  id: string;
  name: string;
  ticker: string;
  supply: string;
  transfer_rate_pct: number;
  issuer_address: string;
  currency_hex: string;
};

type BookRow = { price: number; tokenAmount: number; xrpAmount: number };

type Book = {
  ticker: string;
  asks: BookRow[];
  bids: BookRow[];
  lastPrice: number | null;
};

type MyOffer = {
  sequence: number;
  side: "buy" | "sell";
  tokenAmount: number;
  xrpAmount: number;
  price: number;
};

type Holders = {
  holderCount: number;
  topHolders: { address: string; balance: number; pct: number }[];
};

export default function TradePage() {
  const { userId, isDevMode } = useWallet();
  const [launches, setLaunches] = useState<LaunchRow[]>([]);
  const [selected, setSelected] = useState<LaunchRow | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [book, setBook] = useState<Book | null>(null);
  const [bookLoading, setBookLoading] = useState(false);

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [tokenAmount, setTokenAmount] = useState("");
  const [xrpAmount, setXrpAmount] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/launch")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setLaunches(res.data);
          if (res.data.length > 0) setSelected(res.data[0]);
        }
      })
      .catch(() => {});
  }, []);

  const [myOffers, setMyOffers] = useState<MyOffer[]>([]);
  const [holders, setHolders] = useState<Holders | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const refreshBook = useCallback(() => {
    if (!selected) return;
    setBookLoading(true);
    fetch(`/api/trade/book?launchId=${selected.id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setBook(res.data);
      })
      .catch(() => {})
      .finally(() => setBookLoading(false));

    fetch(`/api/launch/${selected.id}/holders`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setHolders(res.data);
      })
      .catch(() => {});

    if (userId) {
      fetch(`/api/trade/offers?userId=${userId}&launchId=${selected.id}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.success) setMyOffers(res.data);
        })
        .catch(() => {});
    }
  }, [selected, userId]);

  useEffect(() => {
    refreshBook();
  }, [refreshBook]);

  async function handleCancelOffer(sequence: number) {
    if (!userId) return;
    setCancelling(sequence);
    try {
      const devSecret = isDevMode
        ? localStorage.getItem("tl_dev_secret")
        : undefined;
      const res = await fetch("/api/trade/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, offerSequence: sequence, devSecret }),
      });
      const data = await res.json();
      if (data.success) refreshBook();
    } finally {
      setCancelling(null);
    }
  }

  const feeInfo = useMemo(() => {
    const xrp = parseFloat(xrpAmount);
    if (isNaN(xrp) || xrp <= 0) return null;
    const fee = xrp * 0.003;
    return {
      fee: fee.toFixed(4),
      total: side === "buy" ? (xrp + fee).toFixed(4) : (xrp - fee).toFixed(4),
    };
  }, [xrpAmount, side]);

  async function handlePlaceOffer() {
    if (!userId || !selected) return;
    const tokens = parseFloat(tokenAmount);
    const xrp = parseFloat(xrpAmount);
    if (!(tokens > 0) || !(xrp > 0)) return;

    setPlacing(true);
    setError(null);
    setLastTx(null);
    try {
      const devSecret = isDevMode
        ? localStorage.getItem("tl_dev_secret")
        : undefined;
      const res = await fetch("/api/trade/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          launchId: selected.id,
          side,
          tokenAmount: tokens,
          xrpAmount: xrp,
          devSecret,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLastTx(data.data.offerTx);
        setTokenAmount("");
        setXrpAmount("");
        refreshBook();
      } else {
        setError(data.error ?? "offer failed");
      }
    } catch {
      setError("offer failed");
    } finally {
      setPlacing(false);
    }
  }

  if (launches.length === 0) {
    return (
      <div className="flex flex-col gap-5 py-8">
        <header>
          <h1 className="text-xl font-bold text-mint">[trade]</h1>
          <p className="text-xs text-muted">
            buy, sell, and actually know if you're up or down.
          </p>
        </header>
        <div className="rounded-lg bg-card border border-white/5 p-8 text-center flex flex-col gap-3">
          <p className="text-sm text-muted">nothing to trade yet</p>
          <Link href="/launch" className="text-xs text-mint">
            [launch the first token] &rarr;
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 py-8">
      <header>
        <h1 className="text-xl font-bold text-mint">[trade]</h1>
        <p className="text-xs text-muted">
          live order book on the xrpl dex — testnet
        </p>
      </header>

      {/* Token picker */}
      {selected && (
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="rounded-lg bg-card border border-white/5 p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-mint/20 flex items-center justify-center text-xs font-bold text-mint">
              {selected.ticker[0]}
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">
                ${selected.ticker}
              </p>
              <p className="text-[10px] text-muted">{selected.name}</p>
            </div>
          </div>
          <span className="text-xs text-muted">
            {showPicker ? "close" : "change"}
          </span>
        </button>
      )}

      {showPicker && (
        <div className="flex flex-col gap-1 -mt-3">
          {launches.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setSelected(l);
                setShowPicker(false);
              }}
              className={`rounded-lg p-3 flex items-center justify-between text-sm ${
                l.id === selected?.id
                  ? "bg-mint/5 border border-mint/10"
                  : "bg-card border border-white/5"
              }`}
            >
              <span className="font-medium text-foreground">${l.ticker}</span>
              <span className="text-xs text-muted">
                {l.transfer_rate_pct}% burn
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Last price */}
      <div className="text-center py-2">
        <p className="text-3xl font-bold text-foreground">
          {book?.lastPrice != null ? book.lastPrice.toFixed(6) : "--"}{" "}
          <span className="text-lg text-muted">xrp</span>
        </p>
        <p className="text-[10px] text-muted mt-1">best ask price</p>
      </div>

      {/* Price chart — real candles from on-ledger trades; on mainnet the
          dexscreener embed takes over */}
      {selected && (
        <>
          <DexScreenerEmbed
            currencyHex={selected.currency_hex}
            issuerAddress={selected.issuer_address}
          />
          <PriceChart launchId={selected.id} ticker={selected.ticker} />
        </>
      )}

      {/* Order book */}
      <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">order book</p>
          <button
            onClick={refreshBook}
            className="text-[10px] text-muted hover:text-mint"
          >
            {bookLoading ? "loading..." : "[refresh]"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] text-mint mb-1">bids (buying)</p>
            {(book?.bids ?? []).length === 0 && (
              <p className="text-[10px] text-muted">no bids</p>
            )}
            {(book?.bids ?? []).map((b, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-mint">{b.price.toFixed(6)}</span>
                <span className="text-muted">
                  {b.tokenAmount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[10px] text-red-400 mb-1">asks (selling)</p>
            {(book?.asks ?? []).length === 0 && (
              <p className="text-[10px] text-muted">no asks</p>
            )}
            {(book?.asks ?? []).map((a, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-red-400">{a.price.toFixed(6)}</span>
                <span className="text-muted">
                  {a.tokenAmount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* My open offers */}
      {userId && myOffers.length > 0 && (
        <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground">my open offers</p>
          {myOffers.map((o) => (
            <div
              key={o.sequence}
              className="flex items-center justify-between border-t border-white/5 pt-2 first:border-0 first:pt-0"
            >
              <div className="text-xs">
                <span
                  className={o.side === "sell" ? "text-red-400" : "text-mint"}
                >
                  {o.side}
                </span>{" "}
                <span className="text-foreground">
                  {o.tokenAmount.toLocaleString()}
                </span>{" "}
                <span className="text-muted">
                  @ {o.price.toFixed(6)} xrp
                </span>
              </div>
              <button
                onClick={() => handleCancelOffer(o.sequence)}
                disabled={cancelling === o.sequence}
                className="text-[10px] text-muted hover:text-red-400 disabled:opacity-40"
              >
                {cancelling === o.sequence ? "cancelling..." : "[cancel]"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Holders */}
      {holders && (
        <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">holders</p>
            <span className="text-xs text-mint font-bold">
              {holders.holderCount}
            </span>
          </div>
          {holders.topHolders.map((h, i) => (
            <div
              key={h.address}
              className="flex items-center justify-between text-xs border-t border-white/5 pt-2 first:border-0 first:pt-0"
            >
              <span className="text-muted font-mono">
                {i + 1}. {h.address.slice(0, 8)}...{h.address.slice(-4)}
              </span>
              <span className="text-foreground">
                {h.balance.toLocaleString()}{" "}
                <span className="text-muted">({h.pct.toFixed(1)}%)</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Buy / Sell form */}
      <div className="flex flex-col gap-3">
        <div className="flex rounded-lg bg-card border border-white/5 p-1">
          <button
            onClick={() => setSide("buy")}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
              side === "buy"
                ? "bg-mint text-[#1b1d28]"
                : "text-muted hover:text-foreground"
            }`}
          >
            buy
          </button>
          <button
            onClick={() => setSide("sell")}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
              side === "sell"
                ? "bg-red-400 text-[#1b1d28]"
                : "text-muted hover:text-foreground"
            }`}
          >
            sell
          </button>
        </div>

        <input
          type="number"
          value={tokenAmount}
          onChange={(e) => setTokenAmount(e.target.value)}
          placeholder={`amount of ${selected?.ticker ?? "tokens"}`}
          className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
        />
        <input
          type="number"
          value={xrpAmount}
          onChange={(e) => setXrpAmount(e.target.value)}
          placeholder={side === "buy" ? "total xrp to spend" : "total xrp to receive"}
          className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
        />

        {feeInfo && (
          <div className="rounded-lg bg-card border border-white/5 p-3 flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted">routing fee (0.3%)</span>
              <span className="text-foreground">{feeInfo.fee} xrp</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">
                {side === "buy" ? "total cost" : "net after fee"}
              </span>
              <span className="text-mint font-semibold">
                {feeInfo.total} xrp
              </span>
            </div>
          </div>
        )}

        {!userId && (
          <p className="text-xs text-muted text-center">
            connect your wallet in the lobby to trade
          </p>
        )}

        <button
          onClick={handlePlaceOffer}
          disabled={!userId || placing || !(parseFloat(tokenAmount) > 0) || !(parseFloat(xrpAmount) > 0)}
          className={`w-full py-3 rounded-lg font-semibold text-sm disabled:opacity-40 ${
            side === "buy"
              ? "bg-mint text-[#1b1d28]"
              : "bg-red-400 text-[#1b1d28]"
          }`}
        >
          {placing
            ? "placing offer on testnet..."
            : `[place ${side} offer]`}
        </button>

        {lastTx && (
          <p className="text-[10px] text-mint text-center font-mono">
            offer live: {lastTx.slice(0, 12)}...
          </p>
        )}
        {error && (
          <p className="text-[10px] text-red-400 text-center">{error}</p>
        )}
      </div>

      <div className="rounded-lg bg-white/5 p-3 flex justify-between text-xs">
        <span className="text-muted">platform fees</span>
        <div className="flex gap-3 text-muted">
          <span>
            trading: <span className="text-foreground">0.3%</span>
          </span>
          <span>
            market: <span className="text-foreground">3%</span>
          </span>
        </div>
      </div>
    </div>
  );
}
