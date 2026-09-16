// ─── Local (offline) board store ────────────────────────────────────
// Used when Supabase credentials are absent. The deployed demo then runs
// a fully working canvas instead of stopping at a configuration warning:
// boards and elements live in localStorage and never leave the browser.
//
// Everything here is best-effort. Private-browsing modes can throw on
// localStorage access, so we fall back to an in-memory map rather than
// letting the app crash.

import { Board, CanvasElement } from "../types";

const BOARDS_KEY = "collabspace:local-boards";
const BOARD_PREFIX = "collabspace:local-board:";

export const LOCAL_BOARD_ID = "local-scratch";

// ─── Storage backend (localStorage, or memory if unavailable) ─────
let resolved = false;
let backing: Storage | null = null;
const memory = new Map<string, string>();

function storage(): Storage | null {
  if (!resolved) {
    resolved = true;
    try {
      const probe = "__collabspace_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      backing = window.localStorage;
    } catch {
      backing = null;
    }
  }
  return backing;
}

function read(key: string): string | null {
  const s = storage();
  return s ? s.getItem(key) : memory.get(key) ?? null;
}

function write(key: string, value: string): void {
  const s = storage();
  if (s) s.setItem(key, value);
  else memory.set(key, value);
}

function drop(key: string): void {
  const s = storage();
  if (s) s.removeItem(key);
  else memory.delete(key);
}

// ─── Boards ───────────────────────────────────────────────────────

export function defaultBoard(): Board {
  const now = new Date().toISOString();
  return {
    id: LOCAL_BOARD_ID,
    name: "Local scratch board",
    createdAt: now,
    updatedAt: now,
    _count: { elements: 0 },
  };
}

function isBoard(value: unknown): value is Board {
  if (!value || typeof value !== "object") return false;
  const b = value as Partial<Board>;
  return typeof b.id === "string" && typeof b.name === "string";
}

export function loadLocalBoards(): Board[] {
  const raw = read(BOARDS_KEY);
  if (!raw) return [defaultBoard()];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [defaultBoard()];
    const boards = parsed.filter(isBoard);
    return boards.length > 0 ? boards : [defaultBoard()];
  } catch {
    return [defaultBoard()];
  }
}

export function saveLocalBoards(boards: Board[]): void {
  try {
    write(BOARDS_KEY, JSON.stringify(boards));
  } catch {
    // Quota exceeded or serialisation failure - demo data is disposable.
  }
}

// ─── Elements ─────────────────────────────────────────────────────

function elementsKey(boardId: string): string {
  return `${BOARD_PREFIX}${boardId}`;
}

export function loadLocalElements(boardId: string): CanvasElement[] {
  const raw = read(elementsKey(boardId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CanvasElement[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalElements(boardId: string, elements: CanvasElement[]): void {
  try {
    write(elementsKey(boardId), JSON.stringify(elements));
  } catch {
    // Quota exceeded - keep the in-memory canvas usable and carry on.
  }
}

export function removeLocalBoard(boardId: string): void {
  drop(elementsKey(boardId));
}

// ─── Element merge ────────────────────────────────────────────────
// Mirrors the upsert the realtime layer performs for remote edits:
// replace by id when present, otherwise append.
export function mergeElement(
  elements: CanvasElement[],
  element: CanvasElement
): CanvasElement[] {
  const idx = elements.findIndex((e) => e.id === element.id);
  if (idx < 0) return [...elements, element];
  const next = [...elements];
  next[idx] = element;
  return next;
}
