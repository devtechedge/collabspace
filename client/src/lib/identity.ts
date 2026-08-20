// ─── Client-side identity ──────────────────────────────────────────
// Replaces the server's `socket.emit("identity", ...)` handshake.
// We generate a stable userId + a friendly username + a colour once,
// then keep them in localStorage so reloads keep the same identity.

import { sanitizeColor, sanitizeUsername } from "./validation.ts";

const STORAGE_KEY = "collabspace.identity.v1";

export const USER_COLORS = [
  "#6366f1", "#f43f5e", "#10b981", "#f59e0b",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#fb923c", "#a855f7",
];

export const ADJECTIVES = ["Swift", "Cosmic", "Quiet", "Bold", "Crimson", "Azure", "Lunar", "Solar", "Hidden", "Vivid"];
export const NOUNS      = ["Falcon", "Comet", "River", "Spark", "Pine", "Otter", "Cipher", "Echo", "Atlas", "Nova"];

export interface Identity {
  userId: string;
  username: string;
  color: string;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function isValidIdentity(value: unknown): value is Identity {
  if (!value || typeof value !== "object") return false;
  const v = value as Identity;
  if (typeof v.userId !== "string" || v.userId.length < 8 || v.userId.length > 80) return false;
  if (!sanitizeUsername(v.username)) return false;
  if (!USER_COLORS.includes(sanitizeColor(v.color, ""))) return false;
  return true;
}

export function generateIdentity(): Identity {
  return {
    userId: crypto.randomUUID(),
    username: `${pick(ADJECTIVES)}${pick(NOUNS)}`,
    color: pick(USER_COLORS),
  };
}

export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isValidIdentity(parsed)) return parsed;
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
