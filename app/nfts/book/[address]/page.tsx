"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";

type TokenBalance = {
  currency: string;
  issuer: string;
  value: string;
};

type NftToken = {
  nftokenId: string;
  issuer: string;
  taxon: number;
  uri: string | null;
  flags: number;
  serial: number;
};

type WalletData = {
  address: string;
  accountFound: boolean;
  xrpBalance: string;
  tokens: TokenBalance[];
  nfts: NftToken[];
};

function shortAddr(a: string) {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export default function BookPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const { userId, address: myAddress } = useWallet();

  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [offerNft, setOfferNft] = useState<string | null>(null);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerResult, setOfferResult] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);

  const [sellNft, setSellNft] = useState<string | null>(null);
  const [sellAmount, setSellAmount] = useState("");
  const [sellBusy, setSellBusy] = useState(false);
  const [sellResult, setSellResult] = useState<string | null>(null);
  const [sellError, setSellError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/nfts/${address}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setData(res.data);
        } else {
          setError(res.error ?? "failed to load wallet");
        }
      })
      .catch(() => setError("network error"))
      .finally(() => setLoading(false));
  }, [address]);

  async function handleOffer(nftokenId: string) {
    if (!userId || !offerAmount || offerBusy) return;
    const xrp = parseFloat(offerAmount);
    if (!xrp || xrp <= 0) return;

    setOfferBusy(true);
    setOfferError(null);
    setOfferResult(null);
    try {
      const devSecret = localStorage.getItem("tl_dev_secret") ?? "";
      const res = await fetch("/api/nfts/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          nftokenId,
          owner: address,
          xrpAmount: xrp,
          devSecret,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setOfferResult(json.data.offerTx);
        setOfferNft(null);
        setOfferAmount("");
      } else {
        setOfferError(json.error ?? "offer failed");
      }
    } catch {
      setOfferError("network error");
    } finally {
      setOfferBusy(false);
    }
  }

  async function handleSell(nftokenId: string) {
    if (!userId || !sellAmount || sellBusy) return;
    const xrp = parseFloat(sellAmount);
    if (!xrp || xrp <= 0) return;

    setSellBusy(true);
    setSellError(null);
    setSellResult(null);
    try {
      const devSecret = localStorage.getItem("tl_dev_secret") ?? "";
      const res = await fetch("/api/nfts/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          nftokenId,
          xrpAmount: xrp,
          devSecret,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSellResult(json.data.offerTx);
        setSellNft(null);
        setSellAmount("");
      } else {
        setSellError(json.error ?? "sell offer failed");
      }
    } catch {
      setSellError("network error");
    } finally {
      setSellBusy(false);
    }
  }

  const isOwnWallet = myAddress === address;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted">loading wallet...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 py-8">
      <Link
        href="/nfts"
        className="text-xs text-muted hover:text-foreground self-start"
      >
        &larr; back to nfts
      </Link>

      <header>
        <h1 className="text-xl font-bold text-mint">[the book]</h1>
        <p className="text-sm font-mono text-foreground">{shortAddr(address)}</p>
        {isOwnWallet && (
          <span className="text-[10px] text-mint">(your wallet)</span>
        )}
        <p className="text-xs text-muted">
          everything this wallet holds on-ledger
        </p>
      </header>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {data && !data.accountFound && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-400">
          account not found on ledger — may be unfunded
        </div>
      )}

      {offerResult && (
        <div className="rounded-lg bg-mint/10 border border-mint/20 p-3 text-sm text-mint">
          buy offer submitted — tx: {offerResult.slice(0, 12)}...
        </div>
      )}

      {sellResult && (
        <div className="rounded-lg bg-mint/10 border border-mint/20 p-3 text-sm text-mint">
          sell offer created — tx: {sellResult.slice(0, 12)}...
        </div>
      )}

      {data && data.accountFound && (
        <>
          {/* XRP balance */}
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted">xrp balance</h2>
            <div className="rounded-lg bg-card border border-white/5 p-4 flex items-center justify-between">
              <span className="text-lg font-bold text-foreground">
                {parseFloat(data.xrpBalance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                xrp
              </span>
            </div>
          </section>

          {/* Token trust lines */}
          {data.tokens.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted">
                tokens ({data.tokens.length})
              </h2>
              {data.tokens.map((t) => (
                <div
                  key={`${t.currency}-${t.issuer}`}
                  className="rounded-lg bg-card border border-white/5 p-3 flex items-center justify-between"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {t.currency}
                    </span>
                    <span className="text-[10px] text-muted font-mono">
                      {shortAddr(t.issuer)}
                    </span>
                  </div>
                  <span className="text-sm text-foreground">
                    {parseFloat(t.value).toLocaleString()}
                  </span>
                </div>
              ))}
            </section>
          )}

          {/* NFTs */}
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted">
              nfts ({data.nfts.length})
            </h2>
            {data.nfts.length === 0 && (
              <p className="text-xs text-muted py-4 text-center">
                no nfts in this wallet
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {data.nfts.map((nft) => (
                <div
                  key={nft.nftokenId}
                  className="rounded-lg bg-card border border-white/5 p-3 flex flex-col gap-2"
                >
                  <div className="w-full aspect-square rounded-md bg-white/5 flex items-center justify-center text-muted text-xs overflow-hidden">
                    {nft.uri ? (
                      <span className="text-[9px] text-muted/60 break-all p-1">
                        {nft.uri.length > 80
                          ? nft.uri.slice(0, 80) + "..."
                          : nft.uri}
                      </span>
                    ) : (
                      <span className="text-muted/40">no uri</span>
                    )}
                  </div>
                  <p className="text-[10px] text-foreground font-mono truncate">
                    {nft.nftokenId.slice(0, 8)}...{nft.nftokenId.slice(-6)}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-muted">
                    <span>taxon: {nft.taxon}</span>
                    <span>#{nft.serial}</span>
                  </div>
                  <p className="text-[10px] text-muted font-mono">
                    issuer: {shortAddr(nft.issuer)}
                  </p>

                  {userId && !isOwnWallet && (
                    <>
                      {offerNft === nft.nftokenId ? (
                        <div className="flex flex-col gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={offerAmount}
                            onChange={(e) => setOfferAmount(e.target.value)}
                            placeholder="xrp amount"
                            className="w-full bg-[#1b1d28] border border-white/10 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleOffer(nft.nftokenId)}
                              disabled={offerBusy || !offerAmount}
                              className="flex-1 py-1.5 rounded bg-mint text-[#1b1d28] text-xs font-semibold disabled:opacity-40"
                            >
                              {offerBusy ? "..." : "[send offer]"}
                            </button>
                            <button
                              onClick={() => {
                                setOfferNft(null);
                                setOfferError(null);
                              }}
                              className="px-2 py-1.5 rounded bg-white/5 text-muted text-xs"
                            >
                              x
                            </button>
                          </div>
                          {offerError && (
                            <p className="text-[10px] text-red-400">
                              {offerError}
                            </p>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => setOfferNft(nft.nftokenId)}
                          className="w-full py-1.5 rounded-md bg-white/5 text-mint text-xs font-medium hover:bg-white/10 transition-colors"
                        >
                          [make offer]
                        </button>
                      )}
                    </>
                  )}

                  {userId && isOwnWallet && (
                    <>
                      {sellNft === nft.nftokenId ? (
                        <div className="flex flex-col gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={sellAmount}
                            onChange={(e) => setSellAmount(e.target.value)}
                            placeholder="asking price (xrp)"
                            className="w-full bg-[#1b1d28] border border-white/10 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSell(nft.nftokenId)}
                              disabled={sellBusy || !sellAmount}
                              className="flex-1 py-1.5 rounded bg-mint text-[#1b1d28] text-xs font-semibold disabled:opacity-40"
                            >
                              {sellBusy ? "..." : "[list for sale]"}
                            </button>
                            <button
                              onClick={() => {
                                setSellNft(null);
                                setSellError(null);
                              }}
                              className="px-2 py-1.5 rounded bg-white/5 text-muted text-xs"
                            >
                              x
                            </button>
                          </div>
                          {sellError && (
                            <p className="text-[10px] text-red-400">
                              {sellError}
                            </p>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => setSellNft(nft.nftokenId)}
                          className="w-full py-1.5 rounded-md bg-white/5 text-mint text-xs font-medium hover:bg-white/10 transition-colors"
                        >
                          [list for sale]
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <p className="text-[10px] text-muted/50 text-center">
        live data from xrpl {data?.accountFound ? "testnet" : ""}
      </p>
    </div>
  );
}
