"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import PixelEditor from "@/components/PixelEditor";

type Trait = {
  id: string;
  name: string;
  url: string;
  weight: number; // 1-100 relative within its layer
};

type Layer = {
  id: string;
  name: string;
  traits: Trait[];
};

const SIZE = 500;
const MAX_GENERATE = 50;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function pickWeighted(traits: Trait[]): Trait {
  const total = traits.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of traits) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return traits[traits.length - 1];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export default function StudioPage() {
  const { userId } = useWallet();
  const router = useRouter();

  const [layers, setLayers] = useState<Layer[]>([
    { id: uid(), name: "background", traits: [] },
    { id: uid(), name: "body", traits: [] },
  ]);
  const [collectionName, setCollectionName] = useState("");
  const [royalty, setRoyalty] = useState(5);
  const [count, setCount] = useState(10);
  const [uploadingLayer, setUploadingLayer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"generator" | "pixel" | "pro">(
    "generator"
  );
  const [pixelExporting, setPixelExporting] = useState(false);

  type GenProject = {
    id: string;
    name: string;
    data: {
      layers: Layer[];
      collectionName: string;
      royalty: number;
      count: number;
    };
  };
  const [genProjects, setGenProjects] = useState<GenProject[]>([]);
  const [genProjectId, setGenProjectId] = useState<string | null>(null);
  const [genSaving, setGenSaving] = useState(false);
  const [genSavedAt, setGenSavedAt] = useState<string | null>(null);

  const proFrameRef = useRef<HTMLIFrameElement>(null);
  const [proPulling, setProPulling] = useState(false);
  const [proResult, setProResult] = useState<string | null>(null);

  const loadGenProjects = useCallback(() => {
    if (!userId) return;
    fetch(`/api/studio/projects?userId=${userId}&kind=generator`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setGenProjects(res.data);
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    loadGenProjects();
  }, [loadGenProjects]);

  async function saveGenProject() {
    if (!userId || genSaving) return;
    setGenSaving(true);
    try {
      const res = await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          id: genProjectId ?? undefined,
          kind: "generator",
          name: collectionName || "untitled collection",
          data: { layers, collectionName, royalty, count },
        }),
      });
      const json = await res.json();
      if (json.success) {
        setGenProjectId(json.data.id);
        setGenSavedAt(new Date().toLocaleTimeString());
        loadGenProjects();
      }
    } finally {
      setGenSaving(false);
    }
  }

  function openGenProject(p: GenProject) {
    setLayers(p.data.layers);
    setCollectionName(p.data.collectionName);
    setRoyalty(p.data.royalty);
    setCount(p.data.count);
    setGenProjectId(p.id);
  }

  // photopea outbound export: post a script, receive the png bytes back
  async function pullFromPhotopea() {
    const frame = proFrameRef.current;
    if (!frame?.contentWindow || !userId || proPulling) return;
    setProPulling(true);
    setProResult(null);
    setError(null);

    const bytes = await new Promise<ArrayBuffer | null>((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve(null);
      }, 15_000);
      function onMsg(e: MessageEvent) {
        if (e.source !== frame!.contentWindow) return;
        if (e.data instanceof ArrayBuffer) {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(e.data);
        }
      }
      window.addEventListener("message", onMsg);
      frame!.contentWindow!.postMessage(
        'app.activeDocument.saveToOE("png");',
        "*"
      );
    });

    if (!bytes) {
      setError(
        "nothing came back — open or create a document in photopea first"
      );
      setProPulling(false);
      return;
    }

    try {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "image/png" }), "pro.png");
      form.append("userId", userId);
      const up = await fetch("/api/uploads", {
        method: "POST",
        body: form,
      }).then((r) => r.json());
      if (up.success) setProResult(up.data.url);
      else setError(up.error ?? "upload failed");
    } catch {
      setError("upload failed");
    } finally {
      setProPulling(false);
    }
  }

  const [generating, setGenerating] = useState(false);
  const [minted, setMinted] = useState(0);
  const [phase, setPhase] = useState<"idle" | "compose" | "mint" | "done">(
    "idle"
  );
  const [collectionId, setCollectionId] = useState<string | null>(null);

  const previewRef = useRef<HTMLCanvasElement>(null);

  const readyLayers = layers.filter((l) => l.traits.length > 0);
  const comboSpace = readyLayers.reduce((s, l) => s * l.traits.length, 1);

  const drawCombo = useCallback(
    async (canvas: HTMLCanvasElement, combo: Trait[]) => {
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, SIZE, SIZE);
      for (const trait of combo) {
        const img = await loadImage(trait.url);
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
      }
    },
    []
  );

  async function preview() {
    if (readyLayers.length === 0 || !previewRef.current) return;
    const combo = readyLayers.map((l) => pickWeighted(l.traits));
    await drawCombo(previewRef.current, combo);
  }

  async function handleTraitUpload(layerId: string, files: FileList | null) {
    if (!files || !userId) return;
    setUploadingLayer(layerId);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("userId", userId);
        const res = await fetch("/api/uploads", {
          method: "POST",
          body: form,
        });
        const json = await res.json();
        if (!json.success) {
          setError(json.error ?? "upload failed");
          continue;
        }
        const traitName = file.name.replace(/\.[^.]+$/, "").toLowerCase();
        setLayers((prev) =>
          prev.map((l) =>
            l.id === layerId
              ? {
                  ...l,
                  traits: [
                    ...l.traits,
                    {
                      id: uid(),
                      name: traitName,
                      url: json.data.url,
                      weight: 50,
                    },
                  ],
                }
              : l
          )
        );
      }
    } finally {
      setUploadingLayer(null);
    }
  }

  function moveLayer(idx: number, dir: -1 | 1) {
    setLayers((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function generateAndMint() {
    if (!userId || generating || readyLayers.length === 0 || !collectionName)
      return;
    const n = Math.min(count, MAX_GENERATE, comboSpace);
    const devSecret = localStorage.getItem("tl_dev_secret") ?? "";
    if (!devSecret) {
      setError("connect a dev wallet to mint on testnet");
      return;
    }

    setGenerating(true);
    setError(null);
    setMinted(0);
    setPhase("compose");

    try {
      // 1. compose unique combos client-side
      const seen = new Set<string>();
      const outputs: { name: string; blob: Blob; traits: string }[] = [];
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      let guard = 0;
      while (outputs.length < n && guard < n * 30) {
        guard++;
        const combo = readyLayers.map((l) => pickWeighted(l.traits));
        const key = combo.map((t) => t.id).join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        await drawCombo(canvas, combo);
        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), "image/png")
        );
        outputs.push({
          name: `${collectionName} #${outputs.length + 1}`,
          blob,
          traits: combo
            .map((t, i) => `${readyLayers[i].name}: ${t.name}`)
            .join(" · "),
        });
      }

      // 2. upload each render, then mint on-ledger one by one
      setPhase("mint");
      let colId: string | null = null;
      for (const out of outputs) {
        const form = new FormData();
        form.append("file", out.blob, "render.png");
        form.append("userId", userId);
        const up = await fetch("/api/uploads", {
          method: "POST",
          body: form,
        }).then((r) => r.json());
        if (!up.success) throw new Error(up.error ?? "render upload failed");

        const payload: Record<string, unknown> = {
          userId,
          name: out.name,
          imageUrl: `${window.location.origin}${up.data.url}`,
          devSecret,
        };
        if (colId) payload.collectionId = colId;
        else
          payload.newCollection = {
            name: collectionName,
            description: `generated in the trustline studio · ${readyLayers.length} layers`,
            royaltyPct: royalty,
          };

        const mint = await fetch("/api/nfts/mint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then((r) => r.json());
        if (!mint.success) throw new Error(mint.error ?? "mint failed");
        colId = mint.data.collectionId;
        setCollectionId(colId);
        setMinted((m) => m + 1);
      }
      setPhase("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "generation failed");
      setPhase(minted > 0 ? "done" : "idle");
    } finally {
      setGenerating(false);
    }
  }

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-sm text-muted">connect a wallet to use the studio</p>
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
        <h1 className="text-xl font-bold text-mint">[studio]</h1>
        <p className="text-xs text-muted">
          draw it, layer it, generate it, mint it — one stop
        </p>
      </header>

      {/* Studio tabs */}
      <div className="flex gap-1 rounded-lg bg-card border border-white/5 p-1 self-start">
        {(
          [
            ["generator", "layer generator"],
            ["pixel", "pixel editor"],
            ["pro", "pro editor"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              view === key
                ? "bg-mint text-[#1b1d28]"
                : "text-muted hover:text-foreground"
            }`}
          >
            [{label}]
          </button>
        ))}
      </div>

      {view === "pixel" && (
        <>
          <PixelEditor
            exporting={pixelExporting}
            onExport={async (blob) => {
              if (!userId || pixelExporting) return;
              setPixelExporting(true);
              setError(null);
              try {
                const form = new FormData();
                form.append("file", blob, "pixel.png");
                form.append("userId", userId);
                const res = await fetch("/api/uploads", {
                  method: "POST",
                  body: form,
                });
                const json = await res.json();
                if (json.success) {
                  router.push(
                    `/nfts/mint?img=${encodeURIComponent(
                      `${window.location.origin}${json.data.url}`
                    )}`
                  );
                } else {
                  setError(json.error ?? "upload failed");
                }
              } catch {
                setError("upload failed");
              } finally {
                setPixelExporting(false);
              }
            }}
          />
          {error && <p className="text-[10px] text-red-400">{error}</p>}
        </>
      )}

      {view === "pro" && (
        <div className="flex flex-col gap-2">
          {/* photopea is an external free web editor that permits embedding
              and exposes a postMessage export api */}
          <iframe
            ref={proFrameRef}
            src="https://www.photopea.com"
            title="photopea editor"
            className="w-full rounded-lg border border-white/10"
            style={{ height: 640 }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={pullFromPhotopea}
              disabled={proPulling || !userId}
              className="px-4 py-2 rounded-lg bg-mint text-[#1b1d28] text-xs font-semibold disabled:opacity-40"
            >
              {proPulling
                ? "pulling artwork..."
                : "[pull artwork into trustline]"}
            </button>
            {proResult && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proResult}
                  alt="pulled artwork"
                  className="w-9 h-9 rounded-md border border-mint/30 object-cover"
                />
                <button
                  onClick={() =>
                    router.push(
                      `/nfts/mint?img=${encodeURIComponent(
                        `${window.location.origin}${proResult}`
                      )}`
                    )
                  }
                  className="text-xs text-mint font-semibold"
                >
                  [mint it →]
                </button>
              </>
            )}
            {error && <p className="text-[10px] text-red-400">{error}</p>}
          </div>
          <p className="text-[10px] text-muted/60 text-center">
            photopea (photoshop-grade, free, runs in your browser — an
            external service). draw, then one click pulls your canvas
            straight into trustline.
          </p>
        </div>
      )}

      {view === "generator" && (
        <>
      {/* Layers */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-muted">
            layers (bottom first)
          </h2>
          <div className="flex items-center gap-2">
            {genSavedAt && (
              <span className="text-[9px] text-muted/60">
                saved {genSavedAt}
              </span>
            )}
            <button
              onClick={saveGenProject}
              disabled={!userId || genSaving}
              className="text-xs text-mint disabled:opacity-40"
            >
              {genSaving
                ? "saving..."
                : genProjectId
                  ? "[save]"
                  : "[save project]"}
            </button>
            {genProjects.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const p = genProjects.find((x) => x.id === e.target.value);
                  if (p) openGenProject(p);
                }}
                className="bg-card border border-white/10 rounded px-2 py-1 text-[10px] text-muted focus:outline-none"
              >
                <option value="">open…</option>
                {genProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() =>
                setLayers((p) => [
                  ...p,
                  { id: uid(), name: `layer ${p.length + 1}`, traits: [] },
                ])
              }
              className="text-xs text-mint"
            >
              [+ add layer]
            </button>
          </div>
        </div>

        {layers.map((layer, idx) => (
          <div
            key={layer.id}
            className="rounded-lg bg-card border border-white/5 p-3 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  onClick={() => moveLayer(idx, -1)}
                  className="text-[9px] text-muted hover:text-mint leading-none"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveLayer(idx, 1)}
                  className="text-[9px] text-muted hover:text-mint leading-none"
                >
                  ▼
                </button>
              </div>
              <input
                type="text"
                value={layer.name}
                onChange={(e) =>
                  setLayers((p) =>
                    p.map((l) =>
                      l.id === layer.id ? { ...l, name: e.target.value } : l
                    )
                  )
                }
                maxLength={30}
                className="bg-transparent text-sm font-semibold text-foreground focus:outline-none flex-1"
              />
              <span className="text-[10px] text-muted">
                {layer.traits.length} traits
              </span>
              <label className="text-[10px] text-mint cursor-pointer">
                {uploadingLayer === layer.id ? "uploading..." : "[+ traits]"}
                <input
                  type="file"
                  accept="image/png,image/webp"
                  multiple
                  onChange={(e) => handleTraitUpload(layer.id, e.target.files)}
                  className="hidden"
                />
              </label>
              {layers.length > 1 && (
                <button
                  onClick={() =>
                    setLayers((p) => p.filter((l) => l.id !== layer.id))
                  }
                  className="text-[10px] text-muted hover:text-red-400"
                >
                  x
                </button>
              )}
            </div>

            {layer.traits.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {layer.traits.map((trait) => (
                  <div
                    key={trait.id}
                    className="rounded-md bg-[#1b1d28] border border-white/10 p-1.5 flex flex-col gap-1"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={trait.url}
                      alt={trait.name}
                      className="w-full aspect-square object-contain rounded bg-white/5"
                    />
                    <p className="text-[9px] text-foreground truncate">
                      {trait.name}
                    </p>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={trait.weight}
                      onChange={(e) =>
                        setLayers((p) =>
                          p.map((l) =>
                            l.id === layer.id
                              ? {
                                  ...l,
                                  traits: l.traits.map((t) =>
                                    t.id === trait.id
                                      ? {
                                          ...t,
                                          weight: parseInt(e.target.value, 10),
                                        }
                                      : t
                                  ),
                                }
                              : l
                          )
                        )
                      }
                      className="w-full accent-[#86efac] h-1"
                    />
                    <p className="text-[8px] text-muted text-center">
                      rarity weight: {trait.weight}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Preview + generate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg bg-card border border-white/5 p-3 flex flex-col gap-2 items-center">
          <canvas
            ref={previewRef}
            width={SIZE}
            height={SIZE}
            className="w-full max-w-[280px] aspect-square rounded-md bg-white/5"
          />
          <button
            onClick={preview}
            disabled={readyLayers.length === 0}
            className="w-full py-2 rounded-lg bg-white/5 text-mint text-xs font-medium disabled:opacity-40"
          >
            [roll a preview]
          </button>
          <p className="text-[10px] text-muted">
            {comboSpace > 1
              ? `${comboSpace.toLocaleString()} possible combinations`
              : "upload traits to at least one layer"}
          </p>
        </div>

        <div className="rounded-lg bg-card border border-white/5 p-3 flex flex-col gap-3">
          <p className="text-sm font-semibold text-foreground">
            generate + mint
          </p>
          <input
            type="text"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            placeholder="collection name"
            maxLength={60}
            className="w-full bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
          />
          <div>
            <label className="text-[10px] text-muted block mb-1">
              how many: {Math.min(count, MAX_GENERATE, comboSpace)}
            </label>
            <input
              type="range"
              min={1}
              max={Math.max(1, Math.min(MAX_GENERATE, comboSpace))}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10))}
              className="w-full accent-[#86efac]"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-1">
              royalty: {royalty}%
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {[0, 2.5, 5, 7.5, 10].map((r) => (
                <button
                  key={r}
                  onClick={() => setRoyalty(r)}
                  className={`rounded border py-1 text-[10px] transition-colors ${
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
          <p className="text-[10px] text-muted">
            cost: {Math.min(count, MAX_GENERATE, comboSpace)} xrp (1 xrp per
            mint) — each nft is a real on-ledger NFTokenMint
          </p>

          {phase === "mint" || phase === "compose" ? (
            <div className="flex flex-col gap-1.5">
              <div className="w-full bg-white/5 rounded-full h-2">
                <div
                  className="bg-mint h-2 rounded-full transition-all"
                  style={{
                    width: `${(minted / Math.min(count, MAX_GENERATE, comboSpace)) * 100}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-muted text-center">
                {phase === "compose"
                  ? "composing artwork..."
                  : `minting on testnet — ${minted}/${Math.min(count, MAX_GENERATE, comboSpace)}`}
              </p>
            </div>
          ) : (
            <button
              onClick={generateAndMint}
              disabled={
                generating ||
                readyLayers.length === 0 ||
                !collectionName ||
                comboSpace < 1
              }
              className="w-full py-3 rounded-lg bg-mint text-[#1b1d28] font-semibold text-sm disabled:opacity-40"
            >
              [generate + mint collection]
            </button>
          )}

          {phase === "done" && collectionId && (
            <button
              onClick={() => router.push(`/nfts/collection/${collectionId}`)}
              className="w-full py-2 rounded-lg bg-mint/10 border border-mint/30 text-mint text-xs font-semibold"
            >
              [view your collection — {minted} minted]
            </button>
          )}
          {error && <p className="text-[10px] text-red-400">{error}</p>}
        </div>
      </div>

      <p className="text-[10px] text-muted/50 text-center">
        tip: traits should be same-size transparent pngs — they stack bottom
        layer up
      </p>
        </>
      )}
    </div>
  );
}
