# CollabSpace

Real-time multiplayer collaborative whiteboard with infinite canvas, presence, chat, reactions, and a laser pointer.

**v2.0 — Vercel + Supabase (no separate backend)**

- **Frontend**: React 18 + Vite + TypeScript + Framer Motion — deployed on Vercel
- **Backend**: Supabase Postgres (boards / elements / messages) + Supabase Realtime (presence / broadcast / postgres_changes)
- **Auth**: none in v1 — every visitor is anonymous with a randomly generated identity stored in `localStorage`

The original v1 ran an Express + Socket.io + Prisma + SQLite server alongside the Vite client. v2 removes that entirely — the Supabase JS client handles realtime fan-out directly from the browser.

---

## Quick start (local dev)

```bash
# 1. Install deps
npm install

# 2. Set up Supabase env vars
cp client/.env.example client/.env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Apply the database schema (see "Supabase setup" below)

# 4. Run the dev server
npm run dev
# → http://localhost:5173
```

---

## Supabase setup

1. **Create a project** at [supabase.com](https://supabase.com/dashboard) (free tier is plenty).

2. **Apply the schema**:
   - Open the Supabase dashboard → SQL Editor → New query
   - Paste the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   - Run it (idempotent — safe to re-run)

   This creates the three tables, indexes, the `collabspace_board_element_counts()` RPC, RLS policies, the Realtime publication, and seeds a "Welcome Board".

3. **Copy credentials** from *Project Settings → API*:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
   - Put them in `client/.env`.

The anon key is safe to ship to the browser — it's the public, RLS-respecting key.

---

## Deploy to Vercel

1. Push this repo to GitHub (or import it).
2. Go to [vercel.com/new](https://vercel.com/new) → import the repo.
3. Vercel auto-detects the Vite framework. Confirm:
   - Build Command: `npm run build --workspace=collabspace-client`
   - Output Directory: `client/dist`
4. Add the env vars in *Project Settings → Environment Variables*:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy.

`vercel.json` is already configured with the right build command, output directory, and SPA rewrite rule.

---

## Architecture

### What used to be in `server/`

The original v1 Express server did three things:

1. **REST API** for boards (`/api/boards`, `/api/boards/:id`, etc.)
2. **Socket.io handlers** that:
   - Persisted elements / messages to Prisma+SQLite
   - Tracked in-memory `roomPresence` for online users
   - Broadcast cursor / reaction / laser / chat events to peers
3. **Identity generation** (random userId, username, color)

All three are gone in v2. Here's where each piece lives now:

| v1 (server) | v2 (replaced by) |
|---|---|
| `GET/POST/PATCH/DELETE /api/boards` | [`boardSync.ts`](client/src/lib/boardSync.ts) → Supabase REST |
| `socket.on("draw-element")` → Prisma upsert + broadcast | [`canvasSync.ts`](client/src/lib/canvasSync.ts) → Supabase `upsert()` (Postgres Changes fan-out is automatic) |
| `socket.on("delete-element")` → Prisma delete + broadcast | [`canvasSync.ts`](client/src/lib/canvasSync.ts) → Supabase `delete()` |
| `socket.on("clear-board")` → Prisma deleteMany + broadcast | [`canvasSync.ts`](client/src/lib/canvasSync.ts) → `clearBoardElements()` |
| `socket.on("send-chat")` → Prisma insert + broadcast | [`chatSync.ts`](client/src/lib/chatSync.ts) → Supabase `insert()` |
| `socket.on("cursor-move")` → broadcast | Presence channel cursor update ([`presence.ts`](client/src/lib/presence.ts)) |
| `socket.on("send-reaction")` → broadcast only (no DB) | [`ephemeral.ts`](client/src/lib/ephemeral.ts) → Realtime broadcast |
| `socket.on("laser-pointer")` → broadcast only | [`ephemeral.ts`](client/src/lib/ephemeral.ts) → Realtime broadcast |
| `roomPresence` Map + `presence-update` | Supabase Realtime Presence |
| `socket.emit("identity", …)` | [`identity.ts`](client/src/lib/identity.ts) → client-side, persisted in `localStorage` |

### Per-board realtime session

[`realtime.ts`](client/src/lib/realtime.ts) exposes `joinBoard(boardId, author, callbacks)` — called from `App.tsx` whenever the active board changes. It wires up four subscriptions in parallel:

1. **Initial `elements` fetch** + Postgres Changes subscription (filtered to this board)
2. **Initial `messages` fetch** + Postgres Changes subscription (filtered to this board)
3. **Ephemeral broadcast channel** for reactions + laser pointers
4. **Presence channel** for online users (carries each peer's cursor position too)

The returned `BoardSession` includes the initial state plus outbound helpers (`sendReaction`, `sendLaser`, `updateOwnCursor`) and a `leave()` cleanup. `App.tsx` calls `leave()` on the previous session before joining a new board.

### Why Postgres Changes + Broadcast?

- **Postgres Changes** is best for things you'd be persisting anyway (elements, messages). One write, automatic fan-out to all subscribers — no need for an explicit `socket.to(room).emit(...)` call.
- **Broadcast** is best for fire-and-forget signals (reactions, laser). No DB row created, no cleanup needed.
- **Presence** is built for the online-users list AND can carry per-user state (we put the cursor there). Each track() replaces the full state, so we maintain the full payload locally and re-send it on every cursor update.

---

## Features

### Drawing
- Infinite canvas with pan (Shift-drag or middle-click) and zoom (scroll)
- Pencil, Line, Rectangle, Circle, Text, Eraser tools
- Select tool with drag-to-move and Delete/Backspace to remove
- Undo / Redo with full history stack (`⌘Z` / `⌘⇧Z`)
- Per-board persistence via Supabase Postgres
- Keyboard shortcuts: `V` Select, `P` Pencil, `L` Line, `R` Rect, `C` Circle, `T` Text, `E` Eraser, `N` Sticky, `X` Laser

### Real-time collaboration
- Live multiplayer cursors with name labels (via Supabase Presence)
- Animated presence indicators in the sidebar
- Sticky notes that sync in real-time across all peers (via Postgres Changes)
- Chat panel with persistent history (last 200 messages per board)
- Floating emoji reactions (🎉 👍 ❤️ 💡 🚀 🔥) that animate up and fade
- Laser pointer tool for "look here" moments — ephemeral pulsing dot broadcast to all peers

---

## Adding auth (next step)

v1 is wide-open (anyone can edit any board). To add auth:

1. Enable an auth provider in the Supabase dashboard.
2. Add a `user_id uuid references auth.users(id)` column to `boards`, `elements`, `messages`.
3. Replace the public RLS policies with user-scoped ones:
   ```sql
   create policy "boards_read" on boards for select using (true);
   create policy "boards_write" on boards for insert with check (auth.uid() = user_id);
   -- etc.
   ```
4. In the client, replace [`identity.ts`](client/src/lib/identity.ts) with `supabase.auth.getUser()` + a one-time random username colour flow.

---

## v2.1 — UI Refactor

A focused, non-breaking visual pass. **No behavioural changes** to realtime, Supabase, or the data model.

### Design tokens

All design tokens live as CSS custom properties on `:root` and `[data-theme="light"]`. Components consume tokens via class names — no raw hex in component code (the only inline `style={{}}` blocks remaining are per-user data: avatar colours, dynamic element positions, and per-instance transforms).

**Token groups:**
- `surface-0…3` — base / panel / elevated / hover backgrounds
- `text-primary / secondary / muted / on-accent` — typography
- `accent / accent-hover / accent-glow / accent-subtle` — single accent colour
- `danger / success / warning / info` (+ `-bg` variants) — semantic
- `border-subtle / strong / accent` — separators
- `space-1…8` — 4 px spacing scale
- `radius-xs / sm / md / lg / xl / full` — corner radii
- `text-xs…3xl` + `font-sans / mono` — typography scale
- `shadow-sm / md / lg / glow` — depth
- `transition-fast / smooth / spring / bounce` — motion
- `z-canvas…modal` — layer order

### Theme system

- Custom React Context at `client/src/lib/theme.tsx` exposing `useTheme()` (next-themes-style API, native to Vite).
- Persisted to `localStorage` under `collabspace.theme`.
- Defaults to `prefers-color-scheme` on first load.
- Subscribes to OS-level changes only when the user hasn't picked yet.
- Cross-fade transition via a temporary `.theme-transitioning` class (≈280 ms) — no jarring per-element transitions on toggle.
- Anti-flash inline script in `index.html` sets `data-theme` **before paint**.
- Toggle component at `client/src/components/ThemeToggle.tsx` — animated sun/moon icon swap (Framer Motion).

### Responsive — 5 breakpoints

```
xl   ≥ 1280px   default styling
lg   ≤ 1279px   slightly tighter sidebar, smaller minimap
md   ≤ 1023px   sidebar collapses to icon rail; hide minimap, welcome banner, board name
sm   ≤  767px   sidebar becomes bottom drawer; toolbar horizontalises, becomes a FAB row
xs   ≤  639px   hide secondary chrome (connection status, button labels)
```

- All interactive elements meet a 44 × 44 px touch target via `min-width`/`min-height`.
- Sticky notes use `touch-action: none` on the canvas to prevent pinch-zoom conflicts on mobile.
- Toasts stack top-centre on desktop; safe-area-inset is honoured for notched devices.
- A `sidebar-mobile` bottom-drawer variant is wired in `@media (max-width: 767px)`.

### Accessibility wins

- `:focus-visible` ring on every interactive element (replaces browser default).
- All decorative emojis have `aria-hidden`; actionable ones have `aria-label`.
- Sidebar tabs are real ARIA `tablist` / `tab` / `tabpanel` with keyboard activation (Enter/Space).
- `aria-current="page"` on the active room item.
- `aria-live="polite"` on the welcome toast.
- `aria-pressed` on tool buttons and font-weight toggles.
- `aria-label` on icon-only buttons (delete room, theme toggle, etc.).
- `prefers-reduced-motion: reduce` zeros out animations globally.
- `prefers-contrast: more` boosts border opacity for WCAG AAA contrast.
- `tabIndex={0}` + `role="button"` on `<li>` room items for keyboard navigation.
- Color swatches have `aria-label="Color #hex"`.

### Components refactored

| File | What changed |
|---|---|
| `client/src/index.css` | Full rewrite. Tokens, light theme, 5 breakpoints, reduced-motion, contrast. |
| `client/src/lib/theme.tsx` | **NEW.** Theme provider + `useTheme` hook. |
| `client/src/components/ThemeToggle.tsx` | **NEW.** Sun/moon animated toggle. |
| `client/src/components/Sidebar.tsx` | All inline styles → class names. ARIA tablist. Theme toggle slot. |
| `client/src/components/Toolbar.tsx` | Disabled state → `:disabled` selector + `disabled` attr. Font-weight buttons → `.font-btn`. |
| `client/src/components/ChatPanel.tsx` | Stacked bubble margin → `.stacked` class. |
| `client/src/components/ReactionsLayer.tsx` | `pointerEvents: none` removed (in CSS). Emoji span → `.reaction-emoji` class. |
| `client/src/components/LaserLayer.tsx` | `pointerEvents: none` removed. Cleaner `--laser-color` cast. |
| `client/src/App.tsx` | Welcome toast → class. Layout container → `.app-container`. Theme toggle wired into Sidebar. |
| `client/src/main.tsx` | Wraps `<App />` in `<ThemeProvider>`. |
| `client/index.html` | Anti-flash script + `theme-color` meta + `viewport-fit=cover`. |

### Files untouched

- `DrawingBoard.tsx` — canvas API requires inline styles for position/scale/colour. Layout is class-based.
- `StickyNote.tsx` — per-sticky colour, transform, and font-weight are dynamic per-instance.
- `Minimap.tsx` — width/height constants are canvas-sizing, not styling.
- All `lib/` files — no UI surface.
- `supabase/migrations/0001_init.sql` — untouched per spec.
