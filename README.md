# CollabSpace

Real-time multiplayer collaborative whiteboard with infinite canvas, presence, chat, reactions, and a laser pointer.

![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?logo=vercel)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Realtime-3ecf8e?logo=supabase)
![Framer Motion](https://img.shields.io/badge/Framer%20Motion-11-black)
![License](https://img.shields.io/badge/License-MIT-green)

## Live Demo

**https://collabspace-mauve.vercel.app**

> **Status:** Frontend is complete (dark/light theme, responsive, full drawing suite). Full multiplayer collaboration requires a Supabase project. Free tier is limited to 2 active projects — currently allocated to other portfolio apps. Without the env vars the app shows a clean configuration shell. Clone + supply your own `VITE_SUPABASE_URL` + anon key for a working realtime demo. Schema is idempotent and ready to paste into any free Supabase project.

## Screenshots

### Dark mode — Rooms
![Dark mode Rooms view](docs/screenshots/Screenshot%202026-07-27%20082946.png)

### Light mode — Chat
![Light mode Chat view](docs/screenshots/Screenshot%202026-07-27%20082952.png)

### Dark mode — Users
![Dark mode Users view](docs/screenshots/Screenshot%202026-07-27%20082958.png)

## Features

- **Infinite canvas** — pan (Shift-drag / middle-click), zoom (scroll), minimap
- **Drawing tools** — Pencil, Line, Rectangle, Circle, Text, Sticky note, Eraser, Select, Laser pointer
- **Real-time multiplayer** — live cursors with name labels via Supabase Presence
- **Persistent elements & chat** — Postgres Changes fan-out (no custom Socket server)
- **Ephemeral signals** — floating emoji reactions + laser pointer via Realtime Broadcast
- **Undo / Redo** with full history stack (`⌘Z` / `⌘⇧Z`)
- **Dark / light theme** with system preference + anti-flash
- **Responsive** — 5 breakpoints, mobile bottom-drawer sidebar, 44 px touch targets
- **Accessible** — focus-visible rings, ARIA tablist, prefers-reduced-motion, prefers-contrast
- **Anonymous identity** — random user stored in `localStorage` (auth-ready later)

## Tech Stack

| Layer        | Tech                                              |
|--------------|---------------------------------------------------|
| Frontend     | React 18 · Vite 5 · TypeScript · Framer Motion   |
| Backend      | Supabase (Postgres + Realtime Presence / Broadcast / Postgres Changes) |
| Deploy       | Vercel (SPA rewrite via `vercel.json`)            |
| Identity     | Client-side random (localStorage)                 |

## Quick Start

```bash
# 1. Install
npm install

# 2. Env
cp client/.env.example client/.env
# Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Schema (paste supabase/migrations/0001_init.sql into Supabase SQL Editor)
# Idempotent — safe to re-run

# 4. Dev server
npm run dev
# → http://localhost:5173
```

## Architecture (v1 → v2)

Original v1 used Express + Socket.io + Prisma + SQLite.  
v2 is fully client-side against Supabase — no custom backend process.

| Concern              | v2 implementation                          |
|----------------------|--------------------------------------------|
| Boards / elements    | `boardSync.ts` / `canvasSync.ts` → Supabase REST + Postgres Changes |
| Chat                 | `chatSync.ts` → Supabase insert + Postgres Changes |
| Cursors / presence   | Supabase Realtime Presence                 |
| Reactions / laser    | Realtime Broadcast (ephemeral)             |
| Identity             | `identity.ts` → localStorage               |

See `client/src/lib/realtime.ts` for the single `joinBoard()` session that wires all four channels.

## License

MIT License. See [LICENSE](LICENSE) for details.
