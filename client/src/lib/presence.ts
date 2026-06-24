// ─── Presence: who's online in this board ──────────────────────────
// Replaces the server's `roomPresence` Map + `presence-update` event.
// Supabase Realtime Presence is built for this: each client registers
// a "state" (their identity + cursor), and the channel keeps the
// union across all subscribers.
//
// IMPORTANT: Supabase's `channel.track()` REPLACES the full state
// every time. So we keep `state` in module scope and re-send the
// whole object on each cursor update.

import { supabase } from "./supabase";
import { UserPresence } from "../types";
import { Author } from "./ephemeral";

export interface PresenceSession {
  /** Update our own cursor in the presence payload (so other peers see it in sidebar). */
  updateCursor: (cursor: { x: number; y: number } | null) => void;
  /** Unsubscribe from the presence channel. */
  leave: () => void;
}

export function joinPresenceChannel(
  boardId: string,
  author: Author,
  onChange: (users: UserPresence[]) => void
): PresenceSession {
  // Mutable full state — always re-sent in its entirety on each track().
  let state = {
    userId: author.userId,
    username: author.username,
    color: author.color,
    cursor: null as { x: number; y: number } | null,
  };

  const channel = supabase.channel(`presence:${boardId}`, {
    config: { presence: { key: author.userId } },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      const raw = channel.presenceState<typeof state>();
      const users: UserPresence[] = Object.values(raw)
        .flat()
        .map((p) => ({
          userId: p.userId,
          username: p.username,
          color: p.color,
          cursor: p.cursor ?? null,
        }))
        // De-dupe (Supabase can report the same user under multiple keys in edge cases).
        .filter((u, i, arr) => arr.findIndex((x) => x.userId === u.userId) === i);
      onChange(users);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track(state);
      }
    });

  return {
    updateCursor: (cursor) => {
      state = { ...state, cursor };
      // track() rejects if not subscribed yet — safe to ignore.
      channel.track(state).catch(() => {});
    },
    leave: () => {
      try {
        channel.unsubscribe();
      } catch {
        // ignore
      }
    },
  };
}
