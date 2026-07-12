"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import MessageThread from "@/components/MessageThread";
import CommentThread from "@/components/CommentThread";

const CATEGORIES = ["all", "digital", "physical", "services", "tokens"] as const;
type Category = (typeof CATEGORIES)[number];

type ListingRow = {
  id: string;
  title: string;
  description: string;
  price_drops: number;
  currency: string;
  category: string;
  image_urls: string;
  total_sold: number;
  seller_name: string | null;
  verification_tier: string | null;
  seller_rating: number | null;
  seller_id: string;
  is_featured: number;
};

type ReviewRow = {
  stars: number;
  comment: string | null;
  created_at: string;
  buyer_code: string;
};

function dropsToXrp(d: number) {
  return d / 1_000_000;
}

function formatPrice(drops: number) {
  const xrp = dropsToXrp(drops);
  if (xrp >= 1000) return `${(xrp / 1000).toFixed(1)}k`;
  if (xrp >= 1) return xrp.toFixed(2);
  return xrp.toFixed(6);
}

export default function MarketPage() {
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    const params = new URLSearchParams();
    if (category !== "all") params.set("category", category);
    if (search.trim()) params.set("q", search.trim());
    try {
      const res = await fetch(`/api/listings?${params}`);
      const data = await res.json();
      if (data.success) setListings(data.data);
    } catch {
      // keep existing listings on error
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    setLoading(true);
    const debounce = setTimeout(fetchListings, search ? 300 : 0);
    return () => clearTimeout(debounce);
  }, [fetchListings, search]);

  if (selectedId) {
    const listing = listings.find((l) => l.id === selectedId);
    if (listing) {
      return (
        <ListingDetail
          listing={listing}
          onBack={() => setSelectedId(null)}
        />
      );
    }
  }

  return (
    <div className="flex flex-col gap-5 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-mint">[market]</h1>
          <p className="text-xs text-muted">
            buy and sell anything. escrow-protected.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/market/messages"
            className="px-3 py-2 rounded-lg bg-card border border-white/5 text-foreground text-sm hover:border-mint/20 transition-colors"
          >
            [msgs]
          </Link>
          <Link
            href="/market/orders"
            className="px-3 py-2 rounded-lg bg-card border border-white/5 text-foreground text-sm hover:border-mint/20 transition-colors"
          >
            [orders]
          </Link>
          <Link
            href="/market/seller"
            className="px-3 py-2 rounded-lg bg-card border border-white/5 text-foreground text-sm hover:border-mint/20 transition-colors"
          >
            [my store]
          </Link>
          <Link
            href="/market/sell"
            className="px-4 py-2 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm"
          >
            [sell]
          </Link>
        </div>
      </header>

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search listings..."
          className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              category === cat
                ? "bg-mint text-[#1b1d28]"
                : "bg-card text-muted hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted text-center py-8">loading...</p>
      ) : listings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted mb-2">no listings yet</p>
          <p className="text-xs text-muted/60">
            be the first to sell something
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {listings.map((listing) => {
            const images = JSON.parse(listing.image_urls || "[]") as string[];
            return (
              <button
                key={listing.id}
                onClick={() => setSelectedId(listing.id)}
                className="flex flex-col gap-2 rounded-lg bg-card border border-white/5 p-3 text-left hover:border-mint/20 transition-colors"
              >
                <div className="w-full aspect-square rounded-md bg-white/5 flex items-center justify-center text-muted text-xs overflow-hidden">
                  {images.length > 0 ? (
                    <img
                      src={images[0]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-muted/40">no image</span>
                  )}
                </div>
                <p className="text-sm text-foreground font-medium leading-tight line-clamp-2">
                  {listing.title}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-mint">
                    {formatPrice(listing.price_drops)} xrp
                  </span>
                  {listing.is_featured === 1 ? (
                    <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                      featured
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted">
                      {listing.total_sold} sold
                    </span>
                  )}
                </div>
                {listing.seller_name && (
                  <p className="text-[10px] text-muted truncate">
                    {listing.seller_name}
                    {listing.verification_tier && listing.verification_tier !== "anon" && (
                      <span className="text-blue-400 ml-1">
                        [{listing.verification_tier}]
                      </span>
                    )}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type BuyStep = "idle" | "creating" | "signing" | "confirming" | "done" | "error";

function ListingDetail({
  listing,
  onBack,
}: {
  listing: ListingRow;
  onBack: () => void;
}) {
  const { address, userId, isDevMode } = useWallet();
  const priceXrp = formatPrice(listing.price_drops);
  const feePct = listing.verification_tier === "elite" ? "2.0" : listing.verification_tier === "trusted" ? "2.5" : listing.verification_tier === "verified" ? "2.8" : "3.0";

  const [buyStep, setBuyStep] = useState<BuyStep>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [featuring, setFeaturing] = useState(false);
  const [featured, setFeatured] = useState(listing.is_featured === 1);
  const [featureError, setFeatureError] = useState<string | null>(null);

  const isSeller = listing.seller_id === userId;

  async function handleFeature() {
    if (!userId) return;
    setFeaturing(true);
    setFeatureError(null);
    try {
      const devSecret = isDevMode
        ? localStorage.getItem("tl_dev_secret")
        : undefined;
      const res = await fetch(`/api/listings/${listing.id}/feature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, devSecret }),
      });
      const data = await res.json();
      if (data.success) {
        setFeatured(true);
      } else {
        setFeatureError(data.error ?? "feature payment failed");
      }
    } catch {
      setFeatureError("feature payment failed");
    } finally {
      setFeaturing(false);
    }
  }

  useEffect(() => {
    fetch(`/api/seller/${listing.seller_id}/reviews`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setReviews(data.data);
      })
      .catch(() => {});
  }, [listing.seller_id]);

  async function handleBuy() {
    if (!userId || !address) return;
    if (isSeller) return;

    setBuyStep("creating");
    setErrorMsg(null);

    try {
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, buyerId: userId }),
      });
      const orderData = await orderRes.json();
      if (!orderData.success) {
        throw new Error(orderData.error ?? "failed to create order");
      }

      const orderId = orderData.data.order.id;
      setBuyStep("signing");

      if (isDevMode) {
        const devSecret = localStorage.getItem("tl_dev_secret");
        if (!devSecret) throw new Error("dev wallet secret not found — reconnect wallet");

        const escrowRes = await fetch(`/api/orders/${orderId}/escrow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ devSecret }),
        });
        const escrowData = await escrowRes.json();
        if (!escrowData.success) {
          throw new Error(escrowData.error ?? "escrow submission failed");
        }

        setTxHash(escrowData.data.txHash);
        setBuyStep("done");
      } else {
        throw new Error("xaman escrow signing coming soon — connect in dev mode to test");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "something went wrong";
      setErrorMsg(msg);
      setBuyStep("error");
    }
  }

  return (
    <div className="flex flex-col gap-5 py-8">
      <button
        onClick={onBack}
        className="text-xs text-muted hover:text-foreground self-start"
      >
        &larr; back to listings
      </button>

      <div className="w-full aspect-video rounded-lg bg-card border border-white/5 flex items-center justify-center text-muted text-sm">
        {(() => {
          const images = JSON.parse(listing.image_urls || "[]") as string[];
          return images.length > 0 ? (
            <img src={images[0]} alt="" className="w-full h-full object-cover rounded-lg" />
          ) : (
            "no image"
          );
        })()}
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-bold text-foreground">{listing.title}</h1>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>{listing.seller_name ?? "unknown seller"}</span>
          {listing.seller_rating !== null && listing.seller_rating > 0 && (
            <span>{listing.seller_rating.toFixed(1)} stars</span>
          )}
          <span>{listing.total_sold} sold</span>
        </div>
        {listing.description && (
          <p className="text-sm text-muted leading-relaxed mt-1">
            {listing.description}
          </p>
        )}
      </div>

      <div className="rounded-lg bg-card border border-white/5 p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">price</p>
          <p className="text-xl font-bold text-mint">{priceXrp} xrp</p>
        </div>
        {buyStep === "done" ? (
          <div className="text-right">
            <p className="text-sm font-semibold text-mint">escrowed</p>
            {txHash && (
              <p className="text-[10px] text-muted font-mono mt-1">
                {txHash.slice(0, 8)}...{txHash.slice(-6)}
              </p>
            )}
          </div>
        ) : !address ? (
          <p className="text-xs text-muted">connect wallet to buy</p>
        ) : isSeller ? (
          featured ? (
            <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full">
              featured
            </span>
          ) : (
            <button
              onClick={handleFeature}
              disabled={featuring}
              className="px-4 py-2 rounded-lg bg-amber-400 text-[#1b1d28] font-semibold text-xs disabled:opacity-40"
            >
              {featuring ? "paying 10 xrp..." : "[feature — 10 xrp / 7 days]"}
            </button>
          )
        ) : (
          <button
            onClick={handleBuy}
            disabled={buyStep !== "idle" && buyStep !== "error"}
            className="px-6 py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
          >
            {buyStep === "creating"
              ? "creating order..."
              : buyStep === "signing"
                ? "signing escrow..."
                : buyStep === "confirming"
                  ? "confirming..."
                  : "[buy now]"}
          </button>
        )}
      </div>

      {featureError && (
        <p className="text-[10px] text-red-400">{featureError}</p>
      )}

      {errorMsg && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-xs text-red-400">{errorMsg}</p>
          <button
            onClick={() => {
              setBuyStep("idle");
              setErrorMsg(null);
            }}
            className="text-[10px] text-red-400/60 mt-1 hover:text-red-400"
          >
            try again
          </button>
        </div>
      )}

      <div className="rounded-lg bg-mint/5 border border-mint/10 p-3 text-center">
        <p className="text-xs text-mint font-medium">
          {buyStep === "done"
            ? "funds locked in escrow — seller will deliver, then you confirm"
            : "payment protection — funds held in escrow until delivery"}
        </p>
      </div>

      {buyStep === "done" && (
        <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-2">
          <p className="text-xs text-muted">escrow status</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-mint animate-pulse" />
            <p className="text-sm text-foreground font-medium">
              waiting for seller delivery
            </p>
          </div>
          <p className="text-[10px] text-muted">
            funds auto-refund if seller doesn't deliver within{" "}
            {listing.category === "physical" ? "14" : "7"} days
          </p>
        </div>
      )}

      <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-mint/10 flex items-center justify-center text-mint font-bold text-xs">
              {(listing.seller_name ?? "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {listing.seller_name ?? "anon"}
              </p>
              <p className="text-[10px] text-muted">
                {listing.verification_tier ?? "anon"} seller / {feePct}% fee
              </p>
            </div>
          </div>
          {userId && !isSeller && (
            <button
              onClick={() => setShowChat(true)}
              className="text-xs text-mint"
            >
              [message]
            </button>
          )}
        </div>
      </div>

      {showChat && userId && (
        <MessageThread
          threadId={listing.id}
          recipientId={listing.seller_id}
          recipientName={listing.seller_name ?? "seller"}
          onClose={() => setShowChat(false)}
        />
      )}

      {reviews.length > 0 && (
        <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-foreground">
            reviews ({reviews.length})
          </p>
          {reviews.map((r, i) => (
            <div
              key={i}
              className="flex flex-col gap-1 border-t border-white/5 pt-2 first:border-0 first:pt-0"
            >
              <div className="flex items-center justify-between">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span
                      key={s}
                      className={`text-xs ${s <= r.stars ? "text-amber-400" : "text-white/10"}`}
                    >
                      *
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-muted">
                  {new Date(r.created_at + "Z").toLocaleDateString()}
                </span>
              </div>
              {r.comment && (
                <p className="text-xs text-muted">{r.comment}</p>
              )}
              <p className="text-[10px] text-muted/60">buyer #{r.buyer_code}</p>
            </div>
          ))}
        </div>
      )}

      <CommentThread subjectType="listing" subjectId={listing.id} />
    </div>
  );
}
