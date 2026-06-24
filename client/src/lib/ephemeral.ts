// ─── Ephemeral events: cursor / reactions / laser pointer ─────────
// Replaces server's socket broadcasts. NOT persisted to DB.
// Supabase Realtime "broadcast" sends a typed event to all subscribers
// of the same channel — perfect for fire-and-forget signals.

import { supabase } from "./supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Reaction, LaserPointer } from "../types";

export interface Author {
  userId: string;
  username: string;
  color: string;
}

export const ALLOWED_REACTION_EMOJIS = ["🎉", "👍", "❤️", "💡", "🚀", "🔥", "👏", "😮"];

// ─── One channel per board, multiplexed by event type ─────────────
// We attach broadcast listeners for cursors, reactions, laser on the
// SAME channel. App.tsx wires callbacks. Returning the channel gives
// the caller a handle to call .send() on.

export type EphemeralHandlers = {
  onCursor: (data: { author: Author; cursor: { x: number; y: number } }) => void;
  onReaction: (reaction: Reaction) => void;
  onLaser: (data: LaserPointer & { username: string; color: string }) => void;
};

export function joinEphemeralChannel(
  boardId: string,
  handlers: EphemeralHandlers
): RealtimeChannel {
  const channel = supabase.channel(`ephemeral:${boardId}`, {
    config: { broadcast: { self: false } }, // don't echo back to sender
  });

  channel
    .on("broadcast", { event: "cursor" }, ({ payload }) => {
      if (payload?.author && payload?.cursor) handlers.onCursor(payload);
    })
    .on("broadcast", { event: "reaction" }, ({ payload }) => {
      if (payload) handlers.onReaction(payload as Reaction);
    })
    .on("broadcast", { event: "laser" }, ({ payload }) => {
      if (payload) handlers.onLaser(payload as LaserPointer & { username: string; color: string });
    })
    .subscribe();

  return channel;
}

// ─── Outbound helpers ─────────────────────────────────────────────
// Throttling is the caller's responsibility (DrawingBoard already
// throttles cursor emits to ~30 fps).

export function sendCursor(
  channel: RealtimeChannel,
  author: Author,
  cursor: { x: number; y: number }
): void {
  channel.send({
    type: "broadcast",
    event: "cursor",
    payload: { author, cursor },
  });
}

export function sendReaction(
  channel: RealtimeChannel,
  author: Author,
  reaction: { emoji: string; x: number; y: number }
): void {
  if (!ALLOWED_REACTION_EMOJIS.includes(reaction.emoji)) return;
  channel.send({
    type: "broadcast",
    event: "reaction",
    payload: {
      id: crypto.randomUUID(),
      userId: author.userId,
      username: author.username,
      userColor: author.color,
      emoji: reaction.emoji,
      x: reaction.x,
      y: reaction.y,
      createdAt: Date.now(),
    },
  });
}

export function sendLaser(
  channel: RealtimeChannel,
  author: Author,
  data: { x: number; y: number; active: boolean }
): void {
  channel.send({
    type: "broadcast",
    event: "laser",
    payload: {
      userId: author.userId,
      username: author.username,
      color: author.color,
      x: data.x,
      y: data.y,
      active: data.active,
    },
  });
}
