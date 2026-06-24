// ─── Chat: send + history + live stream ───────────────────────────
// Mirrors canvasSync.ts pattern. New messages are inserted via REST,
// Postgres Changes fans them out to all subscribers (scoped by filter).
//
// We trim + length-check client-side (the original server did this too).

import { supabase } from "./supabase";
import { ChatMessage } from "../types";

interface MessageRow {
  id: string;
  board_id: string;
  user_id: string;
  username: string;
  user_color: string;
  text: string;
  created_at: string;
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    boardId: row.board_id,
    userId: row.user_id,
    username: row.username,
    userColor: row.user_color,
    text: row.text,
    createdAt: row.created_at,
  };
}

const MAX_TEXT = 1000;

// ─── Initial fetch (last 200) ─────────────────────────────────────
export async function fetchMessages(boardId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("board_id", boardId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data ?? []).map(rowToMessage);
}

// ─── Send ─────────────────────────────────────────────────────────
export async function sendMessage(
  boardId: string,
  author: { userId: string; username: string; color: string },
  text: string
): Promise<void> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_TEXT) return;

  const { error } = await supabase.from("messages").insert({
    board_id: boardId,
    user_id: author.userId,
    username: author.username,
    user_color: author.color,
    text: trimmed,
  });
  if (error) throw error;
}

// ─── Subscribe ────────────────────────────────────────────────────
export function subscribeChat(
  boardId: string,
  onMessage: (msg: ChatMessage) => void
): () => void {
  const boardFilter = `board_id=eq.${boardId}`;

  const channel = supabase
    .channel(`chat:${boardId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: boardFilter },
      (payload) => onMessage(rowToMessage(payload.new as MessageRow))
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
