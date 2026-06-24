// ─── Per-board realtime session ────────────────────────────────────
// One function call to "join" a board. Returns a `leave()` cleanup
// that unsubscribes everything. App.tsx calls joinBoard() whenever
// activeBoardId changes and calls leave() on the previous session first.
//
// What this wires up per board:
//   1. fetchElements + subscribeCanvas (Postgres Changes on elements)
//   2. fetchMessages + subscribeChat   (Postgres Changes on messages)
//   3. joinEphemeralChannel            (Broadcast: cursor / reaction / laser)
//   4. joinPresenceChannel             (Presence: online users + cursors)
//
// Original server did all of this inside one socket.on("join-room") handler.

import {
  CanvasElement,
  ChatMessage,
  Reaction,
  LaserPointer,
  UserPresence,
} from "../types";
import {
  Author,
  joinEphemeralChannel,
  sendReaction,
  sendLaser,
} from "./ephemeral";
import { fetchElements, subscribeCanvas } from "./canvasSync";
import { fetchMessages, subscribeChat } from "./chatSync";
import { joinPresenceChannel } from "./presence";

export interface BoardSession {
  boardId: string;
  initialElements: CanvasElement[];
  initialMessages: ChatMessage[];
  /** Broadcast a reaction burst (client-side validates emoji). */
  sendReaction: (r: { emoji: string; x: number; y: number }) => void;
  /** Broadcast laser pointer position. */
  sendLaser: (data: { x: number; y: number; active: boolean }) => void;
  /** Update our own cursor in the presence payload. */
  updateOwnCursor: (cursor: { x: number; y: number } | null) => void;
  /** Tear down all subscriptions. */
  leave: () => void;
}

export interface JoinCallbacks {
  onElementUpsert: (el: CanvasElement) => void;
  onElementDelete: (id: string) => void;
  onChatMessage: (msg: ChatMessage) => void;
  onReaction: (r: Reaction) => void;
  onLaser: (p: LaserPointer) => void;
  onPresenceChange: (users: UserPresence[]) => void;
}

/**
 * Joins a board and wires up all realtime subscriptions.
 * Resolves once initial state (elements + messages) is fetched.
 */
export async function joinBoard(
  boardId: string,
  author: Author,
  cb: JoinCallbacks
): Promise<BoardSession> {
  // 1. Initial fetch for persistent state.
  const [initialElements, initialMessages] = await Promise.all([
    fetchElements(boardId),
    fetchMessages(boardId),
  ]);

  // 2. Live subscriptions: canvas + chat (Postgres Changes auto-fan-out).
  const unsubCanvas = subscribeCanvas(boardId, {
    onUpsert: cb.onElementUpsert,
    onDelete: cb.onElementDelete,
  });
  const unsubChat = subscribeChat(boardId, cb.onChatMessage);

  // 3. Ephemeral channel: reaction / laser broadcasts.
  //    (Cursors go through presence; broadcast cursor is kept available
  //    via sendCursor() in ephemeral.ts but not wired here.)
  const ephemeral = joinEphemeralChannel(boardId, {
    onCursor: () => {}, // unused — cursors ride on presence
    onReaction: cb.onReaction,
    onLaser: (p) => cb.onLaser({
      userId: p.userId,
      username: p.username,
      color: p.color,
      x: p.x,
      y: p.y,
      active: p.active,
    }),
  });

  // 4. Presence channel: online users list (carries their cursor too).
  const presence = joinPresenceChannel(boardId, author, cb.onPresenceChange);

  return {
    boardId,
    initialElements,
    initialMessages,
    sendReaction: (r) => sendReaction(ephemeral, author, r),
    sendLaser: (data) => sendLaser(ephemeral, author, data),
    updateOwnCursor: (cursor) => presence.updateCursor(cursor),
    leave: () => {
      unsubCanvas();
      unsubChat();
      try { ephemeral.unsubscribe(); } catch {}
      presence.leave();
    },
  };
}
