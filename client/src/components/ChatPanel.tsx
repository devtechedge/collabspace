import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChatMessage } from "../types";

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (text: string) => void;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function ChatPanel({ messages, currentUserId, onSend }: ChatPanelProps) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  // Focus input when panel becomes visible
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, []);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group consecutive messages by same user (within 2 minutes)
  const grouped = useMemo(() => {
    const groups: { userId: string; messages: ChatMessage[] }[] = [];
    let last: { userId: string; ts: number } | null = null;
    for (const msg of messages) {
      const ts = new Date(msg.createdAt).getTime();
      if (last && last.userId === msg.userId && ts - last.ts < 120_000) {
        groups[groups.length - 1].messages.push(msg);
      } else {
        groups.push({ userId: msg.userId, messages: [msg] });
      }
      last = { userId: msg.userId, ts };
    }
    return groups;
  }, [messages]);

  return (
    <div className="chat-panel">
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="empty-emoji">💬</div>
            <div>
              No messages yet.
              <br />
              Start the conversation!
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {grouped.map((group, gi) => {
              const first = group.messages[0];
              const isOwn = first.userId === currentUserId;
              return (
                <motion.div
                  key={first.id + "-" + gi}
                  className="chat-message"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="chat-message-header">
                    <div className="chat-message-avatar" style={{ background: first.userColor }}>
                      {first.username.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="chat-message-username">
                      {isOwn ? "You" : first.username}
                    </span>
                    <span className="chat-message-time">{formatTime(first.createdAt)}</span>
                  </div>
                  {group.messages.map((m, i) => (
                    <div
                      key={m.id}
                      className={`chat-message-bubble ${isOwn ? "own" : ""}${i > 0 ? " stacked" : ""}`}
                    >
                      {m.text}
                    </div>
                  ))}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <div className="chat-input-container">
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          maxLength={1000}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!text.trim()}
          aria-label="Send message"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
