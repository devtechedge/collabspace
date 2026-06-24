-- ─── CollabSpace: Initial Schema ────────────────────────────────────
-- Run this in the Supabase SQL editor (or `supabase db push` from CLI).
-- Idempotent: safe to re-run.

-- ═══ Extensions ═══════════════════════════════════════════════════════
create extension if not exists "pgcrypto";

-- ═══ Tables ══════════════════════════════════════════════════════════

-- Boards: top-level container. Each "room" is one board.
create table if not exists public.boards (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null default 'Untitled Board',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Elements: every shape, line, sticky note, etc. on a board.
-- All element types share this table; sticky notes have type='STICKY'.
-- `points` is a JSONB array of {x, y} for free-form strokes (pencil, eraser).
create table if not exists public.elements (
  id            uuid         primary key,
  board_id      uuid         not null references public.boards(id) on delete cascade,
  type          text         not null, -- PENCIL | LINE | RECTANGLE | CIRCLE | TEXT | ERASER | STICKY
  x             double precision not null default 0,
  y             double precision not null default 0,
  width         double precision not null default 0,
  height        double precision not null default 0,
  points        jsonb        not null default '[]'::jsonb,
  color         text         not null default '#ffffff',
  font_weight   text         not null default 'normal',
  text_content  text         not null default '',
  created_at    timestamptz  not null default now()
);
create index if not exists elements_board_id_idx on public.elements(board_id, created_at);

-- Messages: chat history per board (latest 200 retained by app logic).
create table if not exists public.messages (
  id          uuid        primary key default gen_random_uuid(),
  board_id    uuid        not null references public.boards(id) on delete cascade,
  user_id     text        not null,
  username    text        not null,
  user_color  text        not null default '#6366f1',
  text        text        not null,
  created_at  timestamptz not null default now()
);
create index if not exists messages_board_id_idx on public.messages(board_id, created_at);

-- ═══ updated_at trigger for boards ══════════════════════════════════
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists boards_set_updated_at on public.boards;
create trigger boards_set_updated_at
  before update on public.boards
  for each row execute function public.set_updated_at();

-- ═══ Realtime publication ═══════════════════════════════════════════
-- Required for Postgres Changes (Supabase Realtime) to fire on these tables.
-- Cursors / reactions / laser use Broadcast (no DB row needed).
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.elements;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.boards;

-- ═══ Row Level Security ═════════════════════════════════════════════
-- v1 has no auth: every visitor can read/write everything.
-- Tighten these policies when you add Supabase Auth.

alter table public.boards   enable row level security;
alter table public.elements enable row level security;
alter table public.messages enable row level security;

-- Boards
drop policy if exists "boards_read"   on public.boards;
drop policy if exists "boards_write"  on public.boards;
drop policy if exists "boards_update" on public.boards;
drop policy if exists "boards_delete" on public.boards;
create policy "boards_read"   on public.boards for select using (true);
create policy "boards_write"  on public.boards for insert with check (true);
create policy "boards_update" on public.boards for update using (true);
create policy "boards_delete" on public.boards for delete using (true);

-- Elements
drop policy if exists "elements_read"   on public.elements;
drop policy if exists "elements_write"  on public.elements;
drop policy if exists "elements_update" on public.elements;
drop policy if exists "elements_delete" on public.elements;
create policy "elements_read"   on public.elements for select using (true);
create policy "elements_write"  on public.elements for insert with check (true);
create policy "elements_update" on public.elements for update using (true);
create policy "elements_delete" on public.elements for delete using (true);

-- Messages: read + insert only. Edits/deletes don't make sense for chat.
drop policy if exists "messages_read"  on public.messages;
drop policy if exists "messages_write" on public.messages;
create policy "messages_read"  on public.messages for select using (true);
create policy "messages_write" on public.messages for insert with check (true);

-- ═══ Helper RPCs ═══════════════════════════════════════════════════

-- Returns element counts for a list of board IDs in one round-trip.
-- Used by the sidebar to render per-board badges.
create or replace function public.collabspace_board_element_counts(board_ids uuid[])
returns table (board_id uuid, count bigint)
language sql
stable
as $$
  select e.board_id, count(*)::bigint as count
  from public.elements e
  where e.board_id = any(board_ids)
  group by e.board_id;
$$;

-- ═══ Seed default board ═════════════════════════════════════════════
-- Mirrors the original server's `seedDefaultBoard()` behavior so the
-- sidebar isn't empty on first load.
insert into public.boards (name)
  select 'Welcome Board'
  where not exists (select 1 from public.boards);
