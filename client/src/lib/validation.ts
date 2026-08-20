import type { CanvasElement, ElementType, Point, Tool } from "../types";

export const ELEMENT_TYPES = [
  "PENCIL",
  "LINE",
  "RECTANGLE",
  "CIRCLE",
  "TEXT",
  "ERASER",
  "STICKY",
] as const satisfies readonly ElementType[];

export const TOOLS = [
  "SELECT",
  "PENCIL",
  "LINE",
  "RECTANGLE",
  "CIRCLE",
  "TEXT",
  "ERASER",
  "STICKY",
  "LASER",
] as const satisfies readonly Tool[];

export const ALLOWED_REACTION_EMOJIS = [
  "🎉",
  "👍",
  "❤️",
  "💡",
  "🚀",
  "🔥",
  "👏",
  "😮",
] as const;

export const MAX_CHAT_TEXT = 1000;
export const MAX_BOARD_NAME = 80;
export const MAX_ELEMENT_TEXT = 4000;
export const MAX_POINTS = 4000;
export const MAX_COORD = 1_000_000;
export const MAX_USERNAME = 40;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isElementType(value: unknown): value is ElementType {
  return typeof value === "string" && (ELEMENT_TYPES as readonly string[]).includes(value);
}

export function isTool(value: unknown): value is Tool {
  return typeof value === "string" && (TOOLS as readonly string[]).includes(value);
}

export function isAllowedReactionEmoji(value: unknown): boolean {
  return typeof value === "string" && (ALLOWED_REACTION_EMOJIS as readonly string[]).includes(value);
}

export function finiteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clampCoord(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_COORD, Math.max(-MAX_COORD, n));
}

export function sanitizeColor(value: unknown, fallback = "#ffffff"): string {
  if (typeof value === "string" && HEX_COLOR.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return fallback;
}

export function sanitizeChatText(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_CHAT_TEXT) return trimmed.slice(0, MAX_CHAT_TEXT);
  return trimmed;
}

export function sanitizeBoardName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > MAX_BOARD_NAME) return trimmed.slice(0, MAX_BOARD_NAME);
  return trimmed;
}

export function sanitizeUsername(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_USERNAME) return null;
  if (!/^[A-Za-z][A-Za-z0-9_-]{1,39}$/.test(trimmed)) return null;
  return trimmed;
}

export function sanitizePoints(points: unknown): Point[] {
  if (!Array.isArray(points)) return [];
  const out: Point[] = [];
  const cap = Math.min(points.length, MAX_POINTS);
  for (let i = 0; i < cap; i++) {
    const p = points[i];
    if (!p || typeof p !== "object") continue;
    const rec = p as { x?: unknown; y?: unknown };
    out.push({ x: clampCoord(finiteNumber(rec.x)), y: clampCoord(finiteNumber(rec.y)) });
  }
  return out;
}

export function sanitizeElement(raw: unknown): CanvasElement | null {
  if (!raw || typeof raw !== "object") return null;
  const el = raw as Record<string, unknown>;
  if (!isElementType(el.type)) return null;
  if (typeof el.id !== "string" || !el.id || el.id.length > 80) return null;

  const fontWeight = el.fontWeight === "bold" || el.font_weight === "bold" ? "bold" : "normal";
  const textSource = typeof el.textContent === "string" ? el.textContent : typeof el.text_content === "string" ? el.text_content : "";
  const textContent = textSource.slice(0, MAX_ELEMENT_TEXT);

  return {
    id: el.id,
    type: el.type,
    x: clampCoord(finiteNumber(el.x)),
    y: clampCoord(finiteNumber(el.y)),
    width: clampCoord(finiteNumber(el.width)),
    height: clampCoord(finiteNumber(el.height)),
    points: sanitizePoints(el.points),
    color: sanitizeColor(el.color),
    fontWeight,
    textContent,
    createdAt: typeof el.createdAt === "string" ? el.createdAt : typeof el.created_at === "string" ? el.created_at : undefined,
  };
}
