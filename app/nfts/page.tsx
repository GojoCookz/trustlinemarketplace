"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";

export default function NftsPage() {
  const router = useRouter();
  const { address: myAddress } = useWallet();
  const [address, setAddress] = useState("");
  const [recentError, setRecentError] = useState<string | null>(null);

  function handleBrowse() {
    const addr = address.trim();
    if (!addr.startsWith("r") || addr.length < 25) {
      setRecentError("enter a valid xrpl address (starts with r)");
      return;
    }
    setRecentError(null);
    router.push(`/nfts/book/${addr}`);
  }

  function browseOwn() {
    if (myAddress) {
      router.push(`/nfts/book/${myAddress}`);
    }
  }

  return (
    <div className="flex flex-col gap-5 py-8">
      <header>
        <h1 className="text-xl font-bold text-mint">[nfts]</h1>
        <p className="text-xs text-muted">
          walk up to anyone's wallet and see what they hold. make offers on
          anything.
        </p>
      </header>

      {/* The book — browse any wallet */}
      <div className="rounded-lg bg-mint/5 border border-mint/10 p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-mint">[the book]</p>
        <p className="text-xs text-muted">
          enter any xrpl address to see their tokens, nfts, and balances —
          then make offers directly on-ledger
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setRecentError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleBrowse()}
            placeholder="r..."
            className="flex-1 bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30 font-mono"
          />
          <button
            onClick={handleBrowse}
            className="px-4 py-2.5 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm flex-shrink-0"
          >
            [look]
          </button>
        </div>
        {recentError && (
          <p className="text-[10px] text-red-400">{recentError}</p>
        )}
      </div>

      {/* Browse own wallet shortcut */}
      {myAddress && (
        <button
          onClick={browseOwn}
          className="rounded-lg bg-card border border-white/5 p-4 text-left hover:border-mint/20 transition-colors"
        >
          <p className="text-sm font-semibold text-foreground">
            [browse your wallet]
          </p>
          <p className="text-xs text-muted font-mono mt-1">
            {myAddress.slice(0, 8)}...{myAddress.slice(-6)}
          </p>
          <p className="text-[10px] text-muted mt-1">
            see your tokens, nfts, and xrp balance
          </p>
        </button>
      )}

      {/* How it works */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted">how it works</h2>
        <div className="grid grid-cols-1 gap-2">
          {[
            {
              step: "1",
              title: "look up any wallet",
              desc: "paste any xrpl address to see everything they hold",
            },
            {
              step: "2",
              title: "browse their collection",
              desc: "xrp balance, trust line tokens, and nfts — all live from the ledger",
            },
            {
              step: "3",
              title: "make an offer",
              desc: "send an on-ledger buy offer for any nft you like — 3% platform fee",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-lg bg-card border border-white/5 p-3 flex gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-mint/10 flex items-center justify-center text-mint font-bold text-sm flex-shrink-0">
                {item.step}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {item.title}
                </p>
                <p className="text-[10px] text-muted">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted/50 text-center">
        live — reads directly from xrpl testnet
      </p>
    </div>
  );
}
