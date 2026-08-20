// ─── Boards: list / create / rename / delete ───────────────────────
// One-shot REST calls. Board list refreshes after each mutation.
// We don't use Postgres Changes for boards because the sidebar only
// needs to refresh on user action (no live-sync between tabs required).

import { supabase } from "./supabase";
import { Board } from "../types";
import { sanitizeBoardName } from "./validation";

export async function listBoards(): Promise<Board[]> {
  const { data, error } = await supabase
    .from("boards")
    .select("id, name, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const ids = (data ?? []).map((b) => b.id);

  // Single round-trip to fetch per-board element counts via RPC.
  let counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: countsRows, error: countsErr } = await supabase
      .rpc("collabspace_board_element_counts", { board_ids: ids });
    if (!countsErr && countsRows) {
      for (const row of countsRows as { board_id: string; count: number }[]) {
        counts.set(row.board_id, Number(row.count));
      }
    }
  }

  return (data ?? []).map((b) => ({
    id: b.id,
    name: sanitizeBoardName(b.name) ?? "Untitled Board",
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    _count: { elements: counts.get(b.id) ?? 0 },
  }));
}

export async function createBoard(name: string): Promise<Board> {
  const safe = sanitizeBoardName(name) ?? "Untitled Board";
  const { data, error } = await supabase
    .from("boards")
    .insert({ name: safe })
    .select("id, name, created_at, updated_at")
    .single();

  if (error) throw error;
  return {
    id: data.id,
    name: sanitizeBoardName(data.name) ?? safe,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    _count: { elements: 0 },
  };
}

export async function renameBoard(boardId: string, name: string): Promise<void> {
  const trimmed = sanitizeBoardName(name);
  if (!trimmed) throw new Error("Board name cannot be empty");
  const { error } = await supabase
    .from("boards")
    .update({ name: trimmed })
    .eq("id", boardId);
  if (error) throw error;
}

export async function deleteBoard(boardId: string): Promise<void> {
  const { error } = await supabase
    .from("boards")
    .delete()
    .eq("id", boardId);
  if (error) throw error;
}
