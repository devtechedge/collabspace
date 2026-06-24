// ─── Canvas element sync ───────────────────────────────────────────
// Replaces the server's:
//   socket.on("draw-element")    → prisma.element.upsert + broadcast
//   socket.on("delete-element")  → prisma.element.delete + broadcast
//   socket.on("clear-board")     → prisma.element.deleteMany + broadcast
//   socket.on("element-revert")  → upsert/delete + broadcast
//
// With Supabase Postgres Changes, fan-out is automatic:
//   * Insert/Update/Delete a row → all subscribed clients receive it.
//   * We never need to call .send() / broadcast() for these.
//
// We use the Realtime `filter` option to scope each subscription to
// one board, so a client doesn't receive events for other boards.

import { supabase } from "./supabase";
import { CanvasElement, Point } from "../types";

interface ElementRow {
  id: string;
  board_id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  points: Point[];
  color: string;
  font_weight: string;
  text_content: string;
  created_at: string;
}

function rowToElement(row: ElementRow): CanvasElement {
  return {
    id: row.id,
    type: row.type as CanvasElement["type"],
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    points: row.points ?? [],
    color: row.color,
    fontWeight: row.font_weight,
    textContent: row.text_content,
    createdAt: row.created_at,
  };
}

function elementToRow(el: CanvasElement, boardId: string) {
  return {
    id: el.id,
    board_id: boardId,
    type: el.type,
    x: el.x ?? 0,
    y: el.y ?? 0,
    width: el.width ?? 0,
    height: el.height ?? 0,
    points: el.points ?? [],
    color: el.color ?? "#ffffff",
    font_weight: el.fontWeight ?? "normal",
    text_content: el.textContent ?? "",
  };
}

// ─── Initial fetch ────────────────────────────────────────────────
export async function fetchElements(boardId: string): Promise<CanvasElement[]> {
  const { data, error } = await supabase
    .from("elements")
    .select("*")
    .eq("board_id", boardId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(rowToElement);
}

// ─── Mutations (called by App.tsx when user draws / deletes / clears) ─

export async function upsertElement(boardId: string, el: CanvasElement): Promise<void> {
  const { error } = await supabase
    .from("elements")
    .upsert(elementToRow(el, boardId));
  if (error) throw error;
}

export async function deleteElement(elementId: string): Promise<void> {
  const { error } = await supabase.from("elements").delete().eq("id", elementId);
  if (error) throw error;
}

export async function clearBoardElements(boardId: string): Promise<void> {
  const { error } = await supabase.from("elements").delete().eq("board_id", boardId);
  if (error) throw error;
}

// ─── Subscribe to changes for one board ───────────────────────────
// Returns an unsubscribe fn. Callers (App.tsx) wire onUpsert/onDelete
// into React state setters.

export interface CanvasCallbacks {
  onUpsert: (el: CanvasElement) => void;
  onDelete: (elementId: string) => void;
}

export function subscribeCanvas(
  boardId: string,
  cb: CanvasCallbacks
): () => void {
  // `filter` runs server-side so we only receive events for THIS board.
  const boardFilter = `board_id=eq.${boardId}`;

  const channel = supabase
    .channel(`canvas:${boardId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "elements", filter: boardFilter },
      (payload) => cb.onUpsert(rowToElement(payload.new as ElementRow))
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "elements", filter: boardFilter },
      (payload) => cb.onUpsert(rowToElement(payload.new as ElementRow))
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "elements", filter: boardFilter },
      (payload) => {
        // With the server-side filter, payload.old will at least contain
        // the PK (default REPLICA IDENTITY). If you've set REPLICA IDENTITY
        // FULL on `elements`, board_id will be present here too.
        const old = payload.old as { id?: string };
        if (old.id) cb.onDelete(old.id);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
