"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";

type Item = {
  nftokenId: string;
  name: string;
  imageUrl: string | null;
  ownerAddress: string;
  serial: number | null;
  mintTx: string;
  createdAt: string;
};

type Activity = {
  nftokenId: string;
  itemName: string | null;
  type: "mint" | "sell_offer" | "buy_offer" | "sale";
  priceDrops: number | null;
  txHash: string;
  createdAt: string;
};

type CollectionData = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  issuerAddress: string;
  taxon: number;
  royaltyPct: number;
  stats: {
    items: number;
    owners: number;
    floorDrops: number | null;
    volumeDrops: number;
    sales: number;
    lastSaleDrops: number | null;
  };
  items: Item[];
  activity: Activity[];
};

function xrpFmt(drops: number | null | undefined): string {
  if (drops === null || drops === undefined) return "--";
  const v = drops / 1_000_000;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const t = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const s = Math.floor((Date.now() - t.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const ACTIVITY_LABEL: Record<Activity["type"], string> = {
  mint: "minted",
  sell_offer: "listed",
  buy_offer: "offer",
  sale: "sale",
};

export default function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { userId, address } = useWallet();

  const [data, setData] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"items" | "activity">("items");

  const [offerNft, setOfferNft] = useState<string | null>(null);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerResult, setOfferResult] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/collections/${id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleOffer(item: Item) {
    if (!userId || !offerAmount || offerBusy) return;
    const amt = parseFloat(offerAmount);
    if (!amt || amt <= 0) return;

    setOfferBusy(true);
    setOfferError(null);
    setOfferResult(null);
    try {
      const devSecret = localStorage.getItem("tl_dev_secret") ?? "";
      const res = await fetch("/api/nfts/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          nftokenId: item.nftokenId,
          owner: item.ownerAddress,
          xrpAmount: amt,
          devSecret,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setOfferResult(json.data.offerTx);
        setOfferNft(null);
        setOfferAmount("");
        load();
      } else {
        setOfferError(json.error ?? "offer failed");
      }
    } catch {
      setOfferError("network error");
    } finally {
      setOfferBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted">loading collection...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-muted">collection not found</p>
        <Link href="/nfts" className="text-xs text-mint">
          &larr; back to nfts
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 py-8">
      <Link
        href="/nfts"
        className="text-xs text-muted hover:text-foreground self-start"
      >
        &larr; back to nfts
      </Link>

      {/* Collection header */}
      <header className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-lg bg-white/5 overflow-hidden flex-shrink-0">
          {data.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.imageUrl}
              alt={data.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-mint text-xl font-bold">
              {data.name[0]}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">
            {data.name}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted font-mono">
              by {shortAddr(data.issuerAddress)}
            </span>
            <span className="text-[10px] text-mint bg-mint/10 px-1.5 py-0.5 rounded-full">
              taxon {data.taxon}
            </span>
            {data.royaltyPct > 0 && (
              <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                {data.royaltyPct}% royalty
              </span>
            )}
          </div>
          {data.description && (
            <p className="text-xs text-muted">{data.description}</p>
          )}
        </div>
      </header>

      {/* Headline stats — floor / volume / items / owners */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "floor", value: `${xrpFmt(data.stats.floorDrops)} xrp` },
          {
            label: "total volume",
            value: `${xrpFmt(data.stats.volumeDrops)} xrp`,
          },
          { label: "items", value: String(data.stats.items) },
          { label: "owners", value: String(data.stats.owners) },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-card border border-white/5 p-3 text-center"
          >
            <p className="text-sm font-bold text-foreground">{s.value}</p>
            <p className="text-[9px] text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {offerResult && (
        <div className="rounded-lg bg-mint/10 border border-mint/20 p-3 text-sm text-mint">
          buy offer submitted — tx: {offerResult.slice(0, 12)}...
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-white/5 pb-1">
        {(["items", "activity"] as const).map((t) => (
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

      {/* Items grid */}
      {tab === "items" && (
        <div className="grid grid-cols-2 gap-3">
          {data.items.length === 0 && (
            <p className="text-xs text-muted col-span-2 text-center py-6">
              nothing minted yet
            </p>
          )}
          {data.items.map((item) => {
            const lastSale = data.activity.find(
              (a) => a.nftokenId === item.nftokenId && a.type === "sale"
            );
            const listed = data.activity.find(
              (a) => a.nftokenId === item.nftokenId && a.type === "sell_offer"
            );
            const mine = address === item.ownerAddress;
            return (
              <div
                key={item.nftokenId}
                className="rounded-lg bg-card border border-white/5 p-3 flex flex-col gap-2"
              >
                <div className="w-full aspect-square rounded-md bg-white/5 overflow-hidden flex items-center justify-center">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-muted/40 text-xs">no image</span>
                  )}
                </div>
                <p className="text-xs font-medium text-foreground truncate">
                  {item.name}
                </p>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted font-mono">
                    {shortAddr(item.ownerAddress)}
                    {mine && <span className="text-mint"> (you)</span>}
                  </span>
                  {listed?.priceDrops != null && (
                    <span className="text-mint">
                      {xrpFmt(listed.priceDrops)} xrp
                    </span>
                  )}
                </div>
                {lastSale?.priceDrops != null && (
                  <p className="text-[9px] text-muted">
                    last sale {xrpFmt(lastSale.priceDrops)} xrp
                  </p>
                )}

                {userId && !mine && (
                  <>
                    {offerNft === item.nftokenId ? (
                      <div className="flex flex-col gap-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={offerAmount}
                          onChange={(e) => setOfferAmount(e.target.value)}
                          placeholder="xrp amount"
                          className="w-full bg-[#1b1d28] border border-white/10 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleOffer(item)}
                            disabled={offerBusy || !offerAmount}
                            className="flex-1 py-1.5 rounded bg-mint text-[#1b1d28] text-xs font-semibold disabled:opacity-40"
                          >
                            {offerBusy ? "..." : "[send offer]"}
                          </button>
                          <button
                            onClick={() => {
                              setOfferNft(null);
                              setOfferError(null);
                            }}
                            className="px-2 py-1.5 rounded bg-white/5 text-muted text-xs"
                          >
                            x
                          </button>
                        </div>
                        {offerError && (
                          <p className="text-[10px] text-red-400">
                            {offerError}
                          </p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => setOfferNft(item.nftokenId)}
                        className="w-full py-1.5 rounded-md bg-white/5 text-mint text-xs font-medium hover:bg-white/10 transition-colors"
                      >
                        [make offer]
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Activity feed */}
      {tab === "activity" && (
        <div className="flex flex-col gap-1.5">
          {data.activity.length === 0 && (
            <p className="text-xs text-muted text-center py-6">
              no activity yet
            </p>
          )}
          {data.activity.map((a, i) => (
            <div
              key={`${a.txHash}-${i}`}
              className="rounded-lg bg-card border border-white/5 p-3 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    a.type === "sale"
                      ? "text-mint bg-mint/10"
                      : a.type === "mint"
                        ? "text-blue-400 bg-blue-400/10"
                        : "text-amber-400 bg-amber-400/10"
                  }`}
                >
                  {ACTIVITY_LABEL[a.type]}
                </span>
                <span className="text-foreground truncate">
                  {a.itemName ?? `${a.nftokenId.slice(0, 8)}...`}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {a.priceDrops != null && (
                  <span className="text-foreground">
                    {xrpFmt(a.priceDrops)} xrp
                  </span>
                )}
                <span className="text-muted">{timeAgo(a.createdAt)}</span>
                <span className="text-muted/60 font-mono text-[10px]">
                  {a.txHash.slice(0, 6)}...
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted/50 text-center">
        live — every stat derives from on-ledger transactions
      </p>
    </div>
  );
}
