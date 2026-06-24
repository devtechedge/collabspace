// ─── Client-side identity ──────────────────────────────────────────
// Replaces the server's `socket.emit("identity", ...)` handshake.
// We generate a stable userId + a friendly username + a colour once,
// then keep them in localStorage so reloads keep the same identity.

import { v4 as uuidv4 } from "uuid";

const STORAGE_KEY = "collabspace.identity.v1";

const USER_COLORS = [
  "#6366f1", "#f43f5e", "#10b981", "#f59e0b",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#fb923c", "#a855f7",
];

const ADJECTIVES = ["Swift", "Cosmic", "Quiet", "Bold", "Crimson", "Azure", "Lunar", "Solar", "Hidden", "Vivid"];
const NOUNS      = ["Falcon", "Comet", "River", "Spark", "Pine", "Otter", "Cipher", "Echo", "Atlas", "Nova"];

export interface Identity {
  userId: string;
  username: string;
  color: string;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateIdentity(): Identity {
  return {
    userId: uuidv4(),
    username: `${pick(ADJECTIVES)}${pick(NOUNS)}`,
    color: pick(USER_COLORS),
  };
}

export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Identity;
      if (parsed?.userId && parsed?.username && parsed?.color) return parsed;
    }
  } catch {
    // fall through to generate
  }
  const fresh = generateIdentity();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // localStorage may be disabled (private mode); fine, ephemeral identity.
  }
  return fresh;
}
