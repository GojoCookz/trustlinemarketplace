"use client";

import { useWallet } from "./WalletProvider";

export default function WalletBar() {
  const { address, isConnecting, isDevMode, connect, disconnect } = useWallet();

  if (address) {
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div className="flex items-center justify-between rounded-lg bg-card border border-white/5 p-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-mint animate-pulse" />
          <span className="text-xs text-foreground font-mono">{short}</span>
          {isDevMode && (
            <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
              testnet
            </span>
          )}
        </div>
        <button
          onClick={disconnect}
          className="text-[10px] text-muted hover:text-red-400 transition-colors"
        >
          disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={isConnecting}
      className="w-full rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm py-3 disabled:opacity-40"
    >
      {isConnecting ? "connecting..." : "[connect wallet]"}
    </button>
  );
}
