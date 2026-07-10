"use client";

import { useState } from "react";
import { useWallet } from "./WalletProvider";

export default function WalletBar() {
  const {
    address,
    isConnecting,
    isDevMode,
    connect,
    connectExtension,
    devLogin,
    disconnect,
  } = useWallet();
  const [extError, setExtError] = useState<string | null>(null);

  async function handleExtension() {
    setExtError(null);
    const err = await connectExtension();
    if (err) setExtError(err);
  }

  if (address) {
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between rounded-lg bg-card border border-white/5 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-mint animate-pulse" />
            <span className="text-xs text-foreground font-mono">{short}</span>
            {isDevMode ? (
              <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                dev · testnet
              </span>
            ) : (
              <span className="text-[10px] text-mint bg-mint/10 px-1.5 py-0.5 rounded">
                xaman
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
        {!isDevMode && (
          <p className="text-[10px] text-muted/60 px-1">
            connected via xaman — browsing is live; transaction signing through
            xaman is rolling out, use a dev wallet to transact on testnet
            meanwhile
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={connect}
          disabled={isConnecting}
          className="flex-1 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm py-3 disabled:opacity-40"
        >
          {isConnecting ? "connecting..." : "[xaman — phone]"}
        </button>
        <button
          onClick={handleExtension}
          disabled={isConnecting}
          className="flex-1 rounded-lg bg-card border border-white/10 text-mint font-semibold text-sm py-3 disabled:opacity-40 hover:border-mint/30 transition-colors"
        >
          [extension — gem / crossmark]
        </button>
        <button
          onClick={devLogin}
          disabled={isConnecting}
          className="flex-1 rounded-lg bg-card border border-white/10 text-foreground font-semibold text-sm py-3 disabled:opacity-40 hover:border-mint/30 transition-colors"
        >
          [dev wallet — testnet]
        </button>
      </div>
      {extError && <p className="text-[10px] text-red-400 px-1">{extError}</p>}
    </div>
  );
}
