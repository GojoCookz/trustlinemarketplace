"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "lobby" },
  { href: "/hub", label: "hub" },
  { href: "/market", label: "market" },
  { href: "/launch", label: "launch" },
  { href: "/trade", label: "trade" },
  { href: "/nfts", label: "nfts" },
  { href: "/pools", label: "pools" },
] as const;

export default function BottomBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#1b1d28] border-t border-white/5">
      <div className="max-w-3xl mx-auto flex items-center justify-between px-0 h-14 overflow-x-auto">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-shrink-0 flex items-center justify-center px-1.5 py-2 text-[11px] font-medium transition-colors ${
                active
                  ? "text-mint"
                  : "text-muted hover:text-foreground"
              }`}
            >
              [{tab.label}]
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
