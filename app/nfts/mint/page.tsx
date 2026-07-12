"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";

type Collection = {
  id: string;
  name: string;
  issuerAddress: string;
  taxon: number;
  royaltyPct: number;
};

export default function MintPage() {
  const { userId, address } = useWallet();
  const router = useRouter();

  const [myCollections, setMyCollections] = useState<Collection[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [collectionId, setCollectionId] = useState("");

  const [colName, setColName] = useState("");
  const [colDesc, setColDesc] = useState("");
  const [royalty, setRoyalty] = useState(0);

  const [nftName, setNftName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileUpload(file: File | undefined) {
    if (!file || !userId || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("userId", userId);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const json = await res.json();
      if (json.success) {
        setImageUrl(`${window.location.origin}${json.data.url}`);
      } else {
        setError(json.error ?? "upload failed");
      }
    } catch {
      setError("upload failed");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (!address) return;
    fetch("/api/collections")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const mine = (res.data as Collection[]).filter(
            (c) => c.issuerAddress === address
          );
          setMyCollections(mine);
          if (mine.length > 0) {
            setMode("existing");
            setCollectionId(mine[0].id);
          }
        }
      })
      .catch(() => {});
  }, [address]);

  async function handleMint() {
    if (!userId || busy || !nftName) return;
    if (mode === "existing" && !collectionId) return;
    if (mode === "new" && !colName) return;

    setBusy(true);
    setError(null);
    try {
      const devSecret = localStorage.getItem("tl_dev_secret") ?? "";
      const payload: Record<string, unknown> = {
        userId,
        name: nftName,
        devSecret,
      };
      if (imageUrl) payload.imageUrl = imageUrl;
      if (mode === "existing") {
        payload.collectionId = collectionId;
      } else {
        payload.newCollection = {
          name: colName,
          description: colDesc || undefined,
          royaltyPct: royalty,
        };
      }

      const res = await fetch("/api/nfts/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        router.push(`/nfts/collection/${json.data.collectionId}`);
      } else {
        setError(json.error ?? "mint failed");
      }
    } catch {
      setError("network error");
    } finally {
      setBusy(false);
    }
  }

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-muted">connect a wallet to mint</p>
        <Link href="/" className="text-xs text-mint">
          &larr; back to lobby
        </Link>
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
        <h1 className="text-xl font-bold text-mint">[mint an nft]</h1>
        <p className="text-xs text-muted">
          minted on-ledger via NFTokenMint — 1 xrp platform fee
        </p>
      </header>

      {/* Collection choice */}
      <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-foreground">collection</p>
        <div className="flex gap-2">
          {myCollections.length > 0 && (
            <button
              onClick={() => setMode("existing")}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                mode === "existing"
                  ? "bg-mint/10 border border-mint/30 text-mint"
                  : "bg-[#1b1d28] border border-white/10 text-muted"
              }`}
            >
              existing
            </button>
          )}
          <button
            onClick={() => setMode("new")}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              mode === "new"
                ? "bg-mint/10 border border-mint/30 text-mint"
                : "bg-[#1b1d28] border border-white/10 text-muted"
            }`}
          >
            new collection
          </button>
        </div>

        {mode === "existing" ? (
          <select
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
            className="w-full bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-mint/30"
          >
            {myCollections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (taxon {c.taxon})
              </option>
            ))}
          </select>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={colName}
              onChange={(e) => setColName(e.target.value)}
              placeholder="collection name"
              maxLength={60}
              className="w-full bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
            <textarea
              value={colDesc}
              onChange={(e) => setColDesc(e.target.value)}
              placeholder="description (optional)"
              maxLength={500}
              rows={2}
              className="w-full bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
            />
            <div>
              <label className="text-xs text-muted block mb-1">
                royalty on resales: {royalty}%
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[0, 2.5, 5, 7.5, 10].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoyalty(r)}
                    className={`rounded-lg border py-1.5 text-xs transition-colors ${
                      royalty === r
                        ? "bg-mint/10 border-mint/30 text-mint"
                        : "bg-[#1b1d28] border-white/10 text-foreground"
                    }`}
                  >
                    {r}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* NFT details */}
      <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">the nft</p>
        <input
          type="text"
          value={nftName}
          onChange={(e) => setNftName(e.target.value)}
          placeholder="nft name"
          maxLength={80}
          className="w-full bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
        />
        <label className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-dashed border-white/15 text-xs text-muted hover:border-mint/30 hover:text-foreground transition-colors cursor-pointer">
          {uploading ? "uploading..." : "[upload artwork — png, jpg, gif, webp · max 2mb]"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(e) => handleFileUpload(e.target.files?.[0])}
            className="hidden"
          />
        </label>
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="or paste an image url"
          maxLength={200}
          className="w-full bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
        />
        {imageUrl && (
          <div className="w-24 h-24 rounded-md bg-white/5 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="preview"
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        onClick={handleMint}
        disabled={
          busy ||
          !nftName ||
          (mode === "existing" ? !collectionId : !colName)
        }
        className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
      >
        {busy ? "minting on testnet..." : "[mint — 1 xrp]"}
      </button>
    </div>
  );
}
