"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import MessageThread from "@/components/MessageThread";

type ThreadRow = {
  thread_id: string;
  last_message_at: string;
  unread: number;
  last_body: string;
  other_user_id: string;
};

export default function MessagesPage() {
  const { userId } = useWallet();
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeThread, setActiveThread] = useState<{
    threadId: string;
    recipientId: string;
    recipientName: string;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/messages?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setThreads(data.data);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) {
    return (
      <div className="flex flex-col gap-5 py-8">
        <Link href="/market" className="text-xs text-muted hover:text-foreground">
          &larr; back to market
        </Link>
        <p className="text-sm text-muted text-center py-12">
          connect wallet to view messages
        </p>
      </div>
    );
  }

  if (activeThread) {
    return (
      <MessageThread
        threadId={activeThread.threadId}
        recipientId={activeThread.recipientId}
        recipientName={activeThread.recipientName}
        onClose={() => setActiveThread(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-mint">[messages]</h1>
          <p className="text-xs text-muted">buyer-seller conversations</p>
        </div>
        <Link
          href="/market"
          className="px-3 py-2 rounded-lg bg-card border border-white/5 text-foreground text-sm hover:border-mint/20 transition-colors"
        >
          [market]
        </Link>
      </header>

      {loading ? (
        <p className="text-sm text-muted text-center py-8">loading...</p>
      ) : threads.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted">no messages yet</p>
          <p className="text-xs text-muted/60 mt-1">
            message a seller from their listing page
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {threads.map((t) => (
            <button
              key={t.thread_id}
              onClick={() =>
                setActiveThread({
                  threadId: t.thread_id,
                  recipientId: t.other_user_id,
                  recipientName: t.other_user_id.slice(0, 8),
                })
              }
              className="rounded-lg bg-card border border-white/5 p-4 flex items-center gap-3 text-left hover:border-mint/20 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-mint/10 flex items-center justify-center text-mint font-bold text-sm flex-shrink-0">
                {t.other_user_id[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground truncate">
                    {t.other_user_id.slice(0, 8)}...
                  </p>
                  <span className="text-[10px] text-muted flex-shrink-0">
                    {new Date(t.last_message_at + "Z").toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-muted truncate mt-0.5">
                  {t.last_body}
                </p>
              </div>
              {t.unread > 0 && (
                <span className="w-5 h-5 rounded-full bg-mint text-[#1b1d28] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {t.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
