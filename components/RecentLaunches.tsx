"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type LaunchRow = {
  id: string;
  name: string;
  ticker: string;
  supply: string;
  transfer_rate_pct: number;
};

export default function RecentLaunches() {
  const [launches, setLaunches] = useState<LaunchRow[] | null>(null);

  useEffect(() => {
    fetch("/api/launch")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setLaunches(res.data.slice(0, 3));
      })
      .catch(() => setLaunches([]));
  }, []);

  if (launches === null) return null;

  if (launches.length === 0) {
    return (
      <div className="rounded-lg bg-card border border-white/5 p-6 text-center text-xs text-muted">
        no launches yet —{" "}
        <Link href="/launch" className="text-mint">
          be the first
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {launches.map((l) => (
        <Link
          key={l.id}
          href="/trade"
          className="rounded-lg bg-card border border-white/5 p-3 flex items-center justify-between hover:border-mint/20 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-mint/20 flex items-center justify-center text-xs font-bold text-mint">
              {l.ticker[0]}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                ${l.ticker}
              </p>
              <p className="text-[10px] text-muted">{l.name}</p>
            </div>
          </div>
          <div className="text-right text-[10px] text-muted">
            <p>{Number(l.supply).toLocaleString()} supply</p>
            <p>{l.transfer_rate_pct}% burn</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
