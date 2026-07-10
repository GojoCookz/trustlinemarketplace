"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type FeeRow = {
  id: number;
  fee_type: string;
  amount_drops: number;
  source_id: string | null;
  tx_hash: string | null;
  created_at: string;
};

type DisputedOrder = {
  id: string;
  listing_title: string;
  price_drops: number;
  buyer_id: string;
  seller_id: string;
  disputed_at: string | null;
};

type AdminStats = {
  users: number;
  sellers: number;
  listings: number;
  orders: number;
  volumeDrops: number;
  ordersByStatus: { status: string; count: number }[];
  feesByType: { type: string; total: number; count: number }[];
  totalFeesDrops: number;
  recentFees: FeeRow[];
  disputedOrders: DisputedOrder[];
};

function xrp(drops: number) {
  const v = drops / 1_000_000;
  if (v === 0) return "0.00";
  if (v >= 1000) return `${(v / 1000).toFixed(2)}k`;
  return v.toFixed(v >= 1 ? 2 : 6);
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-muted",
  escrowed: "text-blue-400",
  delivered: "text-amber-400",
  confirmed: "text-mint",
  disputed: "text-red-400",
  cancelled: "text-muted",
  refunded: "text-muted",
};

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [needsKey, setNeedsKey] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback((key?: string) => {
    setLoading(true);
    fetch("/api/admin/stats", {
      headers: key ? { "x-admin-key": key } : {},
    })
      .then((r) => {
        if (r.status === 401) {
          setNeedsKey(true);
          return null;
        }
        return r.json();
      })
      .then((res) => {
        if (res?.success) {
          setStats(res.data);
          setNeedsKey(false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted">loading...</p>
      </div>
    );
  }

  if (needsKey) {
    return (
      <div className="flex flex-col gap-4 py-12 max-w-sm mx-auto">
        <h1 className="text-xl font-bold text-mint">[admin]</h1>
        <input
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(adminKey)}
          placeholder="admin key"
          className="w-full bg-card border border-white/5 rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
        />
        <button
          onClick={() => load(adminKey)}
          className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm"
        >
          [unlock]
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted">failed to load stats</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 py-8">
      <Link
        href="/"
        className="text-xs text-muted hover:text-foreground self-start"
      >
        &larr; lobby
      </Link>

      <header>
        <h1 className="text-xl font-bold text-mint">[admin]</h1>
        <p className="text-xs text-muted">platform stats — testnet</p>
      </header>

      <div className="rounded-lg bg-mint/5 border border-mint/20 p-4 text-center">
        <p className="text-2xl font-bold text-mint">
          {xrp(stats.totalFeesDrops)} xrp
        </p>
        <p className="text-xs text-muted">total fees collected</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "users", value: stats.users },
          { label: "sellers", value: stats.sellers },
          { label: "active listings", value: stats.listings },
          { label: "orders", value: stats.orders },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-card border border-white/5 p-3 text-center"
          >
            <p className="text-lg font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">
          escrow volume
        </p>
        <p className="text-lg font-bold text-mint">
          {xrp(stats.volumeDrops)} xrp
        </p>
        <p className="text-[10px] text-muted">
          escrowed + delivered + confirmed orders
        </p>
      </div>

      <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-foreground">fees by type</p>
        {stats.feesByType.length === 0 && (
          <p className="text-xs text-muted">no fees collected yet</p>
        )}
        {stats.feesByType.map((f) => (
          <div key={f.type} className="flex items-center justify-between">
            <div>
              <p className="text-xs text-foreground">{f.type}</p>
              <p className="text-[10px] text-muted">{f.count} payments</p>
            </div>
            <span className="text-sm font-bold text-mint">
              {xrp(f.total)} xrp
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-foreground">
          orders by status
        </p>
        {stats.ordersByStatus.length === 0 && (
          <p className="text-xs text-muted">no orders yet</p>
        )}
        {stats.ordersByStatus.map((o) => (
          <div key={o.status} className="flex items-center justify-between">
            <span
              className={`text-xs ${STATUS_COLORS[o.status] ?? "text-muted"}`}
            >
              {o.status}
            </span>
            <span className="text-sm font-bold text-foreground">
              {o.count}
            </span>
          </div>
        ))}
      </div>

      {stats.disputedOrders.length > 0 && (
        <div className="rounded-lg bg-red-400/5 border border-red-400/20 p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-red-400">
            open disputes ({stats.disputedOrders.length})
          </p>
          {stats.disputedOrders.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between border-t border-white/5 pt-2 first:border-0 first:pt-0"
            >
              <div>
                <p className="text-xs text-foreground">{d.listing_title}</p>
                <p className="text-[10px] text-muted">
                  {d.disputed_at
                    ? new Date(d.disputed_at + "Z").toLocaleString()
                    : "--"}{" "}
                  · order {d.id.slice(0, 8)}
                </p>
              </div>
              <span className="text-xs font-bold text-red-400">
                {xrp(d.price_drops)} xrp
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-foreground">
          recent fee ledger
        </p>
        {stats.recentFees.length === 0 && (
          <p className="text-xs text-muted">empty ledger</p>
        )}
        {stats.recentFees.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between border-t border-white/5 pt-2 first:border-0 first:pt-0"
          >
            <div>
              <p className="text-xs text-foreground">{f.fee_type}</p>
              <p className="text-[10px] text-muted">
                {new Date(f.created_at + "Z").toLocaleString()}
                {f.tx_hash && (
                  <span className="ml-2 text-mint/60">
                    tx: {f.tx_hash.slice(0, 8)}...
                  </span>
                )}
              </p>
            </div>
            <span className="text-xs font-bold text-mint">
              {xrp(f.amount_drops)} xrp
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
