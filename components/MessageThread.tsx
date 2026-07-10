"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWallet } from "@/components/WalletProvider";

type Message = {
  id: number;
  thread_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
  sender_code: string;
};

export default function MessageThread({
  threadId,
  recipientId,
  recipientName,
  onClose,
}: {
  threadId: string;
  recipientId: string;
  recipientName: string;
  onClose: () => void;
}) {
  const { userId } = useWallet();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(() => {
    if (!userId) return;
    fetch(`/api/messages?threadId=${threadId}&userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setMessages(data.data);
      })
      .catch(() => {});
  }, [threadId, userId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    if (!userId || !input.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          senderId: userId,
          recipientId,
          body: input.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setInput("");
        fetchMessages();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#1b1d28]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="text-xs text-muted hover:text-foreground"
          >
            &larr;
          </button>
          <div className="w-6 h-6 rounded-full bg-mint/10 flex items-center justify-center text-mint font-bold text-[10px]">
            {recipientName[0]?.toUpperCase() ?? "?"}
          </div>
          <p className="text-sm font-medium text-foreground">{recipientName}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted text-center py-8">
            start a conversation
          </p>
        )}
        {messages.map((m) => {
          const isMine = m.sender_id === userId;
          return (
            <div
              key={m.id}
              className={`max-w-[80%] ${isMine ? "self-end" : "self-start"}`}
            >
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  isMine
                    ? "bg-mint text-[#1b1d28]"
                    : "bg-card border border-white/5 text-foreground"
                }`}
              >
                {m.body}
              </div>
              <p
                className={`text-[9px] text-muted mt-0.5 ${
                  isMine ? "text-right" : ""
                }`}
              >
                {new Date(m.created_at + "Z").toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-white/5 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="type a message..."
          maxLength={1000}
          className="flex-1 bg-card border border-white/5 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-mint/30"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="px-4 py-2 rounded-lg bg-mint text-[#1b1d28] font-semibold text-xs disabled:opacity-40"
        >
          {sending ? "..." : "[send]"}
        </button>
      </div>
    </div>
  );
}
