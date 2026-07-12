"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/components/WalletProvider";

type CommentRow = {
  id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  handle: string;
  score: number;
  my_vote: number;
};

type CommentNode = CommentRow & { children: CommentNode[] };

type Sort = "top" | "new";

function timeAgo(iso: string): string {
  const t = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const s = Math.floor((Date.now() - t.getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function buildTree(rows: CommentRow[], sort: Sort): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });
  const roots: CommentNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const cmp =
    sort === "top"
      ? (a: CommentNode, b: CommentNode) => b.score - a.score
      : (a: CommentNode, b: CommentNode) =>
          b.created_at.localeCompare(a.created_at);
  const sortRec = (nodes: CommentNode[]) => {
    nodes.sort(cmp);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export default function CommentThread({
  subjectType,
  subjectId,
}: {
  subjectType: "listing" | "launch" | "collection";
  subjectId: string;
}) {
  const { userId } = useWallet();
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [sort, setSort] = useState<Sort>("top");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const viewer = userId ? `&userId=${userId}` : "";
    fetch(
      `/api/comments?subjectType=${subjectType}&subjectId=${subjectId}${viewer}`
    )
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setRows(res.data);
      })
      .catch(() => {});
  }, [subjectType, subjectId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(text: string, parentId: string | null) {
    if (!userId || !text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          subjectType,
          subjectId,
          parentId,
          body: text.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setBody("");
        setReplyBody("");
        setReplyTo(null);
        load();
      } else {
        setError(json.error ?? "post failed");
      }
    } catch {
      setError("network error");
    } finally {
      setBusy(false);
    }
  }

  async function vote(commentId: string, dir: 1 | -1) {
    if (!userId) return;
    // optimistic flip
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== commentId) return r;
        const removed = r.my_vote === dir;
        const newVote = removed ? 0 : dir;
        return { ...r, score: r.score - r.my_vote + newVote, my_vote: newVote };
      })
    );
    try {
      await fetch("/api/comments/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, commentId, vote: dir }),
      });
    } catch {
      load(); // resync on failure
    }
  }

  function Node({ node, depth }: { node: CommentNode; depth: number }) {
    return (
      <div
        className={depth > 0 ? "ml-4 pl-3 border-l border-white/10" : ""}
      >
        <div className="flex gap-2.5 py-2">
          {/* vote column */}
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-0.5">
            <button
              onClick={() => vote(node.id, 1)}
              disabled={!userId}
              className={`text-[11px] leading-none transition-colors ${
                node.my_vote === 1
                  ? "text-mint"
                  : "text-muted hover:text-mint"
              } disabled:opacity-30`}
            >
              ▲
            </button>
            <span
              className={`text-[10px] font-semibold ${
                node.score > 0
                  ? "text-mint"
                  : node.score < 0
                    ? "text-red-400"
                    : "text-muted"
              }`}
            >
              {node.score}
            </span>
            <button
              onClick={() => vote(node.id, -1)}
              disabled={!userId}
              className={`text-[11px] leading-none transition-colors ${
                node.my_vote === -1
                  ? "text-red-400"
                  : "text-muted hover:text-red-400"
              } disabled:opacity-30`}
            >
              ▼
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted">
              <span className="text-mint/80 font-mono">u/{node.handle}</span>{" "}
              · {timeAgo(node.created_at)}
            </p>
            <p className="text-xs text-foreground whitespace-pre-wrap break-words mt-0.5">
              {node.body}
            </p>
            {userId && (
              <button
                onClick={() =>
                  setReplyTo(replyTo === node.id ? null : node.id)
                }
                className="text-[10px] text-muted hover:text-foreground mt-1"
              >
                [reply]
              </button>
            )}
            {replyTo === node.id && (
              <div className="flex gap-2 mt-1.5">
                <input
                  type="text"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && post(replyBody, node.id)
                  }
                  placeholder="your reply"
                  maxLength={2000}
                  autoFocus
                  className="flex-1 bg-[#1b1d28] border border-white/10 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
                />
                <button
                  onClick={() => post(replyBody, node.id)}
                  disabled={busy || !replyBody.trim()}
                  className="px-3 py-1.5 rounded bg-mint text-[#1b1d28] text-xs font-semibold disabled:opacity-40"
                >
                  {busy ? "..." : "[post]"}
                </button>
              </div>
            )}
          </div>
        </div>
        {node.children.map((c) => (
          <Node key={c.id} node={c} depth={depth + 1} />
        ))}
      </div>
    );
  }

  const tree = buildTree(rows, sort);

  return (
    <div className="rounded-lg bg-card border border-white/5 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          comments ({rows.length})
        </p>
        <div className="flex gap-2 text-[10px]">
          {(["top", "new"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={
                sort === s ? "text-mint font-semibold" : "text-muted"
              }
            >
              [{s}]
            </button>
          ))}
        </div>
      </div>

      {userId ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && post(body, null)}
            placeholder="say something"
            maxLength={2000}
            className="flex-1 bg-[#1b1d28] border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
          />
          <button
            onClick={() => post(body, null)}
            disabled={busy || !body.trim()}
            className="px-4 py-2 rounded-lg bg-mint text-[#1b1d28] text-xs font-semibold disabled:opacity-40"
          >
            {busy ? "..." : "[post]"}
          </button>
        </div>
      ) : (
        <p className="text-[10px] text-muted">connect a wallet to join in</p>
      )}

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      {tree.length === 0 && (
        <p className="text-[10px] text-muted/60 text-center py-3">
          nothing yet — be first
        </p>
      )}
      <div className="flex flex-col">
        {tree.map((n) => (
          <Node key={n.id} node={n} depth={0} />
        ))}
      </div>
    </div>
  );
}
