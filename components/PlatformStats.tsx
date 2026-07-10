"use client";

import { useState, useEffect } from "react";

type Stats = {
  users: number;
  sellers: number;
  listings: number;
  orders: number;
  volumeDrops: number;
};

function xrp(drops: number) {
  const v = drops / 1_000_000;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(v >= 1 ? 1 : 2);
}

export default function PlatformStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setStats(res.data);
      })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const items = [
    { label: "users", value: String(stats.users) },
    { label: "listings", value: String(stats.listings) },
    { label: "orders", value: String(stats.orders) },
    { label: "xrp volume", value: xrp(stats.volumeDrops) },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((s) => (
        <div
          key={s.label}
          className="rounded-lg bg-card border border-white/5 p-2 text-center"
        >
          <p className="text-sm font-bold text-mint">{s.value}</p>
          <p className="text-[10px] text-muted">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
