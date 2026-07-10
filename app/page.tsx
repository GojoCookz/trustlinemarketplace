import Link from "next/link";
import WalletBar from "@/components/WalletBar";
import PlatformStats from "@/components/PlatformStats";
import RecentLaunches from "@/components/RecentLaunches";

const ROOMS = [
  {
    href: "/hub",
    name: "hub",
    tagline: "check in. stack xp. climb the board.",
    status: "live",
  },
  {
    href: "/market",
    name: "market",
    tagline: "buy and sell anything. escrow-protected.",
    status: "live",
  },
  {
    href: "/launch",
    name: "launch",
    tagline: "you get paid every trade. that's the whole thing.",
    status: "live",
  },
  {
    href: "/trade",
    name: "trade",
    tagline: "buy, sell, and actually know if you're up or down.",
    status: "live",
  },
  {
    href: "/nfts",
    name: "nfts",
    tagline: "walk up to anyone's wallet and make an offer.",
    status: "live",
  },
  {
    href: "/pools",
    name: "pools",
    tagline: "be the house. earn the fees.",
    status: "live",
  },
] as const;

export default function Lobby() {
  return (
    <div className="flex flex-col gap-8 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-mint">[trustline]</h1>
        <p className="text-lg text-foreground">the everything floor for xrp</p>
        <p className="text-sm text-muted">
          launch. trade. collect. get paid.
        </p>
      </header>

      <WalletBar />

      <PlatformStats />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ROOMS.map((room) => (
          <Link
            key={room.href}
            href={room.href}
            className="group flex flex-col gap-2 rounded-lg bg-card p-4 border border-white/5 hover:border-mint/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-mint">
                [{room.name}]
              </span>
              {room.status === "live" ? (
                <span className="text-[10px] font-medium text-mint bg-mint/10 px-2 py-0.5 rounded-full">
                  live
                </span>
              ) : (
                <span className="text-[10px] font-medium text-muted bg-white/5 px-2 py-0.5 rounded-full">
                  coming soon
                </span>
              )}
            </div>
            <p className="text-xs text-muted group-hover:text-foreground transition-colors">
              {room.tagline}
            </p>
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted">recent launches</h2>
        <RecentLaunches />
      </section>
    </div>
  );
}
