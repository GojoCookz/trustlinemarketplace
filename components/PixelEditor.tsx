"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useWallet } from "@/components/WalletProvider";

type Tool = "pencil" | "eraser" | "fill" | "pick";

type PixelProject = {
  id: string;
  name: string;
  data: { size: number; grid: (string | null)[][] };
  updatedAt: string;
};

const AUTOSAVE_KEY = "tl_pixel_autosave";

const PALETTE = [
  "#1b1d28",
  "#ffffff",
  "#86efac",
  "#f87171",
  "#fbbf24",
  "#60a5fa",
  "#c084fc",
  "#f472b6",
  "#34d399",
  "#fb923c",
  "#a3a3a3",
  "#78350f",
];

const SIZES = [16, 32, 64] as const;
const DISPLAY = 448; // css pixels of the drawing surface
const EXPORT_SIZE = 512;
const MAX_UNDO = 50;

type Grid = (string | null)[][];

function emptyGrid(n: number): Grid {
  return Array.from({ length: n }, () => Array<string | null>(n).fill(null));
}

function cloneGrid(g: Grid): Grid {
  return g.map((row) => [...row]);
}

export default function PixelEditor({
  onExport,
  exporting,
}: {
  onExport: (blob: Blob) => void;
  exporting: boolean;
}) {
  const { userId } = useWallet();
  const [size, setSize] = useState<(typeof SIZES)[number]>(32);
  const [grid, setGrid] = useState<Grid>(() => emptyGrid(32));
  const [color, setColor] = useState(PALETTE[2]);
  const [tool, setTool] = useState<Tool>("pencil");
  const [showGrid, setShowGrid] = useState(true);
  const undoStack = useRef<Grid[]>([]);
  const drawing = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [projects, setProjects] = useState<PixelProject[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("untitled");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // crash safety: restore the last unsaved drawing on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        size: number;
        grid: Grid;
        projectId?: string | null;
        projectName?: string;
      };
      if (SIZES.includes(saved.size as (typeof SIZES)[number])) {
        setSize(saved.size as (typeof SIZES)[number]);
        setGrid(saved.grid);
        if (saved.projectId) setProjectId(saved.projectId);
        if (saved.projectName) setProjectName(saved.projectName);
      }
    } catch {
      localStorage.removeItem(AUTOSAVE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounced autosave on every change
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          AUTOSAVE_KEY,
          JSON.stringify({ size, grid, projectId, projectName })
        );
      } catch {
        // storage full — drawing continues, autosave silently off
      }
    }, 400);
    return () => clearTimeout(t);
  }, [grid, size, projectId, projectName]);

  const loadProjects = useCallback(() => {
    if (!userId) return;
    fetch(`/api/studio/projects?userId=${userId}&kind=pixel`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setProjects(res.data);
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  async function saveProject() {
    if (!userId || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          id: projectId ?? undefined,
          kind: "pixel",
          name: projectName || "untitled",
          data: { size, grid },
        }),
      });
      const json = await res.json();
      if (json.success) {
        setProjectId(json.data.id);
        setSavedAt(new Date().toLocaleTimeString());
        loadProjects();
      }
    } finally {
      setSaving(false);
    }
  }

  function openProject(p: PixelProject) {
    if (!SIZES.includes(p.data.size as (typeof SIZES)[number])) return;
    undoStack.current = [];
    setSize(p.data.size as (typeof SIZES)[number]);
    setGrid(p.data.grid);
    setProjectId(p.id);
    setProjectName(p.name);
  }

  // import any png/jpg: downsample onto the current grid size
  function importImage(file: File | undefined) {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const off = document.createElement("canvas");
      off.width = size;
      off.height = size;
      const ctx = off.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const next = emptyGrid(size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          if (data[i + 3] < 32) continue; // keep transparency
          const hex = `#${[data[i], data[i + 1], data[i + 2]]
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("")}`;
          next[y][x] = hex;
        }
      }
      pushUndo();
      setGrid(next);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const cell = DISPLAY / size;
    ctx.clearRect(0, 0, DISPLAY, DISPLAY);
    // checkerboard = transparency
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? "#23263a" : "#1e2130";
        ctx.fillRect(x * cell, y * cell, cell, cell);
        const c = grid[y][x];
        if (c) {
          ctx.fillStyle = c;
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    }
    if (showGrid && size <= 32) {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let i = 1; i < size; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, DISPLAY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cell);
        ctx.lineTo(DISPLAY, i * cell);
        ctx.stroke();
      }
    }
  }, [grid, size, showGrid]);

  useEffect(() => {
    render();
  }, [render]);

  function pushUndo() {
    undoStack.current.push(cloneGrid(grid));
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
  }

  function undo() {
    const prev = undoStack.current.pop();
    if (prev) setGrid(prev);
  }

  function cellFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scale = rect.width / size;
    const x = Math.floor((e.clientX - rect.left) / scale);
    const y = Math.floor((e.clientY - rect.top) / scale);
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return { x, y };
  }

  function applyAt(x: number, y: number) {
    setGrid((prev) => {
      const next = cloneGrid(prev);
      if (tool === "pencil") next[y][x] = color;
      else if (tool === "eraser") next[y][x] = null;
      else if (tool === "fill") {
        const target = prev[y][x];
        if (target === color) return prev;
        const stack = [[x, y]];
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue;
          if (next[cy][cx] !== target) continue;
          next[cy][cx] = color;
          stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
      }
      return next;
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const cell = cellFromEvent(e);
    if (!cell) return;
    if (tool === "pick") {
      const c = grid[cell.y][cell.x];
      if (c) setColor(c);
      setTool("pencil");
      return;
    }
    pushUndo();
    drawing.current = true;
    applyAt(cell.x, cell.y);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || tool === "fill") return;
    const cell = cellFromEvent(e);
    if (cell) applyAt(cell.x, cell.y);
  }

  function exportPng() {
    const out = document.createElement("canvas");
    out.width = EXPORT_SIZE;
    out.height = EXPORT_SIZE;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const cell = EXPORT_SIZE / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = grid[y][x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(
          Math.floor(x * cell),
          Math.floor(y * cell),
          Math.ceil(cell),
          Math.ceil(cell)
        );
      }
    }
    out.toBlob((blob) => {
      if (blob) onExport(blob);
    }, "image/png");
  }

  function downloadPng() {
    const out = document.createElement("canvas");
    out.width = EXPORT_SIZE;
    out.height = EXPORT_SIZE;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const cell = EXPORT_SIZE / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = grid[y][x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "pixel.png";
    a.click();
  }

  const TOOLS: { key: Tool; label: string }[] = [
    { key: "pencil", label: "pencil" },
    { key: "eraser", label: "eraser" },
    { key: "fill", label: "fill" },
    { key: "pick", label: "pick" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">
      {/* canvas */}
      <div className="flex flex-col gap-2 items-center">
        <canvas
          ref={canvasRef}
          width={DISPLAY}
          height={DISPLAY}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => (drawing.current = false)}
          onPointerLeave={() => (drawing.current = false)}
          className="w-full max-w-[448px] aspect-square rounded-lg border border-white/10 touch-none cursor-crosshair"
        />
      </div>

      {/* controls */}
      <div className="flex flex-col gap-3">
        {/* project bar: name, save, open, import */}
        <div className="flex gap-1.5 flex-wrap items-center">
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            maxLength={60}
            className="flex-1 min-w-[120px] bg-card border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-mint/30"
          />
          <button
            onClick={saveProject}
            disabled={!userId || saving}
            className="px-3 py-1.5 rounded-lg text-xs bg-card border border-mint/30 text-mint disabled:opacity-40"
          >
            {saving ? "saving..." : projectId ? "[save]" : "[save project]"}
          </button>
          {projects.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const p = projects.find((x) => x.id === e.target.value);
                if (p) openProject(p);
              }}
              className="bg-card border border-white/10 rounded-lg px-2 py-1.5 text-xs text-muted focus:outline-none"
            >
              <option value="">open…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <label className="px-3 py-1.5 rounded-lg text-xs bg-card border border-white/10 text-muted hover:text-foreground cursor-pointer">
            [import png]
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => importImage(e.target.files?.[0])}
              className="hidden"
            />
          </label>
          {savedAt && (
            <span className="text-[9px] text-muted/60">saved {savedAt}</span>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTool(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tool === t.key
                  ? "bg-mint text-[#1b1d28]"
                  : "bg-card border border-white/10 text-foreground"
              }`}
            >
              [{t.label}]
            </button>
          ))}
          <button
            onClick={undo}
            className="px-3 py-1.5 rounded-lg text-xs bg-card border border-white/10 text-muted hover:text-foreground"
          >
            [undo]
          </button>
          <button
            onClick={() => {
              pushUndo();
              setGrid(emptyGrid(size));
            }}
            className="px-3 py-1.5 rounded-lg text-xs bg-card border border-white/10 text-muted hover:text-red-400"
          >
            [clear]
          </button>
        </div>

        <div>
          <p className="text-[10px] text-muted mb-1.5">palette</p>
          <div className="flex gap-1.5 flex-wrap items-center">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-7 h-7 rounded-md border-2 transition-transform ${
                  color === c
                    ? "border-mint scale-110"
                    : "border-white/10"
                }`}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-7 h-7 rounded-md bg-transparent border border-white/10 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-[10px] text-muted">canvas</p>
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => {
                if (s !== size) {
                  setSize(s);
                  setGrid(emptyGrid(s));
                  undoStack.current = [];
                }
              }}
              className={`px-2.5 py-1 rounded text-[10px] ${
                size === s
                  ? "bg-mint/10 border border-mint/30 text-mint"
                  : "bg-card border border-white/10 text-muted"
              }`}
            >
              {s}×{s}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-[10px] text-muted ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
              className="accent-[#86efac]"
            />
            grid
          </label>
        </div>

        <div className="flex gap-2 mt-auto">
          <button
            onClick={exportPng}
            disabled={exporting}
            className="flex-1 py-2.5 rounded-lg bg-mint text-[#1b1d28] text-xs font-semibold disabled:opacity-40"
          >
            {exporting ? "uploading..." : "[mint this →]"}
          </button>
          <button
            onClick={downloadPng}
            className="px-4 py-2.5 rounded-lg bg-card border border-white/10 text-xs text-foreground"
          >
            [download]
          </button>
        </div>
      </div>
    </div>
  );
}
