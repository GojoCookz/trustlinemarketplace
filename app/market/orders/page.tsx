"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";

type OrderRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  price_drops: number;
  platform_fee_drops: number;
  seller_payout_drops: number;
  status: string;
  escrow_tx: string | null;
  release_tx: string | null;
  created_at: string;
  confirmed_at: string | null;
  listing_title: string;
  listing_category: string;
};

type ExistingRating = {
  stars: number;
  comment: string | null;
  created_at: string;
};

function dropsToXrp(d: number) {
  return (d / 1_000_000).toFixed(2);
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400 bg-yellow-400/10",
  escrowed: "text-blue-400 bg-blue-400/10",
  delivered: "text-purple-400 bg-purple-400/10",
  confirmed: "text-mint bg-mint/10",
  disputed: "text-red-400 bg-red-400/10",
  cancelled: "text-muted bg-white/5",
  refunded: "text-orange-400 bg-orange-400/10",
};

export default function OrdersPage() {
  const { userId, isDevMode } = useWallet();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "buying" | "selling">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!userId) return;
    const role = tab === "buying" ? "buyer" : tab === "selling" ? "seller" : "all";
    fetch(`/api/orders/list?userId=${userId}&role=${role}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setOrders(data.data);
      })
      .finally(() => setLoading(false));
  }, [userId, tab]);

  async function handleDeliver(orderId: string) {
    if (!userId) return;
    setActionLoading(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: userId }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: "delivered" } : o))
        );
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRelease(orderId: string) {
    if (!userId) return;
    setActionLoading(orderId);
    try {
      const devSecret = isDevMode
        ? localStorage.getItem("tl_dev_secret")
        : undefined;
      const res = await fetch(`/api/orders/${orderId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerId: userId, devSecret }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: "confirmed" } : o))
        );
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel(orderId: string) {
    if (!userId) return;
    setActionLoading(orderId);
    setActionError((prev) => ({ ...prev, [orderId]: "" }));
    try {
      const devSecret = isDevMode
        ? localStorage.getItem("tl_dev_secret")
        : undefined;
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, devSecret }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: "cancelled" } : o))
        );
      } else {
        const msg = data.error?.includes("tecNO_PERMISSION")
          ? "escrow timeout not reached yet — funds unlock automatically after the deadline"
          : data.error ?? "cancel failed";
        setActionError((prev) => ({ ...prev, [orderId]: msg }));
      }
    } finally {
      setActionLoading(null);
    }
  }

  const refreshOrders = useCallback(() => {
    if (!userId) return;
    const role = tab === "buying" ? "buyer" : tab === "selling" ? "seller" : "all";
    setLoading(true);
    fetch(`/api/orders/list?userId=${userId}&role=${role}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setOrders(data.data);
      })
      .finally(() => setLoading(false));
  }, [userId, tab]);

  if (!userId) {
    return (
      <div className="flex flex-col gap-5 py-8">
        <Link href="/market" className="text-xs text-muted hover:text-foreground">
          &larr; back to market
        </Link>
        <p className="text-sm text-muted text-center py-12">
          connect wallet to view orders
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-mint">[orders]</h1>
          <p className="text-xs text-muted">track your purchases and sales</p>
        </div>
        <Link
          href="/market"
          className="px-3 py-2 rounded-lg bg-card border border-white/5 text-foreground text-sm hover:border-mint/20 transition-colors"
        >
          [market]
        </Link>
      </header>

      <div className="flex gap-2">
        {(["all", "buying", "selling"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setLoading(true); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              tab === t
                ? "bg-mint text-[#1b1d28]"
                : "bg-card text-muted hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted text-center py-8">loading...</p>
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted">no orders yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => {
            const isBuyer = order.buyer_id === userId;
            const isSeller = order.seller_id === userId;
            const isLoading = actionLoading === order.id;

            return (
              <div
                key={order.id}
                className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-foreground">
                      {order.listing_title}
                    </p>
                    <p className="text-[10px] text-muted">
                      {isBuyer ? "you're buying" : "you're selling"} / {order.listing_category}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      STATUS_COLORS[order.status] ?? "text-muted bg-white/5"
                    }`}
                  >
                    {order.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-mint font-bold">
                    {dropsToXrp(order.price_drops)} xrp
                  </span>
                  <span className="text-muted">
                    {new Date(order.created_at + "Z").toLocaleDateString()}
                  </span>
                </div>

                {order.escrow_tx && (
                  <p className="text-[10px] text-muted font-mono">
                    escrow: {order.escrow_tx.slice(0, 8)}...{order.escrow_tx.slice(-6)}
                  </p>
                )}

                {isSeller && order.status === "escrowed" && (
                  <button
                    onClick={() => handleDeliver(order.id)}
                    disabled={isLoading}
                    className="w-full py-2 rounded-lg bg-purple-500 text-white font-semibold text-xs disabled:opacity-40"
                  >
                    {isLoading ? "marking..." : "[mark as delivered]"}
                  </button>
                )}

                {isBuyer && order.status === "delivered" && (
                  <button
                    onClick={() => handleRelease(order.id)}
                    disabled={isLoading}
                    className="w-full py-2 rounded-lg bg-mint text-[#1b1d28] font-semibold text-xs disabled:opacity-40"
                  >
                    {isLoading ? "releasing escrow..." : "[confirm delivery — release funds]"}
                  </button>
                )}

                {order.status === "confirmed" && order.release_tx && (
                  <p className="text-[10px] text-mint font-mono">
                    released: {order.release_tx.slice(0, 8)}...{order.release_tx.slice(-6)}
                  </p>
                )}

                {isBuyer && order.status === "confirmed" && (
                  <RatingWidget orderId={order.id} />
                )}

                {(isBuyer || isSeller) &&
                  (order.status === "escrowed" || order.status === "delivered") && (
                    <DisputeWidget
                      orderId={order.id}
                      onDisputed={() =>
                        setOrders((prev) =>
                          prev.map((o) =>
                            o.id === order.id ? { ...o, status: "disputed" } : o
                          )
                        )
                      }
                    />
                  )}

                {order.status === "disputed" && (
                  <div className="rounded-lg bg-red-400/5 border border-red-400/20 p-3 flex flex-col gap-2">
                    <p className="text-[10px] text-red-400">
                      dispute open — funds stay locked in escrow. work it out in
                      messages, or cancel after the escrow timeout to refund the
                      buyer.
                    </p>
                    <button
                      onClick={() => handleCancel(order.id)}
                      disabled={isLoading}
                      className="w-full py-2 rounded-lg bg-red-400/20 text-red-400 font-semibold text-xs disabled:opacity-40"
                    >
                      {isLoading ? "cancelling..." : "[cancel escrow — refund buyer]"}
                    </button>
                    {actionError[order.id] && (
                      <p className="text-[10px] text-muted">
                        {actionError[order.id]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DisputeWidget({
  orderId,
  onDisputed,
}: {
  orderId: string;
  onDisputed: () => void;
}) {
  const { userId } = useWallet();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start text-[10px] text-muted hover:text-red-400 transition-colors"
      >
        something wrong? [open a dispute]
      </button>
    );
  }

  async function handleSubmit() {
    if (!userId || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, reason: reason.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        onDisputed();
      } else {
        setError(data.error ?? "dispute failed");
      }
    } catch {
      setError("dispute failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg bg-card border border-red-400/20 p-3 flex flex-col gap-2">
      <p className="text-xs text-foreground font-medium">open a dispute</p>
      <p className="text-[10px] text-muted">
        this pauses the order and notifies the other party. the reason is
        posted to the order's message thread.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="what went wrong?"
        rows={2}
        maxLength={500}
        className="w-full bg-[#1b1d28] border border-white/5 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-red-400/30 resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 py-2 rounded-lg bg-white/5 text-muted font-semibold text-xs"
        >
          [never mind]
        </button>
        <button
          onClick={handleSubmit}
          disabled={!reason.trim() || submitting}
          className="flex-1 py-2 rounded-lg bg-red-400 text-[#1b1d28] font-semibold text-xs disabled:opacity-40"
        >
          {submitting ? "opening..." : "[open dispute]"}
        </button>
      </div>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

function RatingWidget({ orderId }: { orderId: string }) {
  const { userId } = useWallet();
  const [existing, setExisting] = useState<ExistingRating | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/orders/${orderId}/rate`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setExisting(data.data);
          setStars(data.data.stars);
        }
      })
      .finally(() => setLoaded(true));
  }, [orderId]);

  if (!loaded) return null;

  if (existing || submitted) {
    const s = existing?.stars ?? stars;
    return (
      <div className="rounded-lg bg-mint/5 border border-mint/10 p-3 flex items-center gap-3">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`text-sm ${i <= s ? "text-amber-400" : "text-white/10"}`}
            >
              *
            </span>
          ))}
        </div>
        <p className="text-[10px] text-muted flex-1">
          {existing?.comment ?? comment ?? "rated"}
        </p>
      </div>
    );
  }

  async function handleSubmit() {
    if (!userId || stars === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerId: userId,
          stars,
          comment: comment.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg bg-card border border-amber-400/20 p-3 flex flex-col gap-2">
      <p className="text-xs text-foreground font-medium">rate this seller</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setStars(i)}
            className={`w-8 h-8 rounded-md text-sm font-bold transition-colors ${
              i <= (hover || stars)
                ? "bg-amber-400/20 text-amber-400"
                : "bg-white/5 text-white/20"
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="optional comment..."
        maxLength={500}
        className="w-full bg-[#1b1d28] border border-white/5 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-amber-400/30"
      />
      <button
        onClick={handleSubmit}
        disabled={stars === 0 || submitting}
        className="w-full py-2 rounded-lg bg-amber-400 text-[#1b1d28] font-semibold text-xs disabled:opacity-40"
      >
        {submitting ? "submitting..." : "[submit rating]"}
      </button>
    </div>
  );
}
