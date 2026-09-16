# CollabSpace

Real-time multiplayer collaborative whiteboard with infinite canvas, presence, chat, reactions, and a laser pointer.

![CI](https://github.com/devtechedge/collabspace/actions/workflows/ci.yml/badge.svg)
![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?logo=vercel)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Realtime-3ecf8e?logo=supabase)
![Framer Motion](https://img.shields.io/badge/Framer%20Motion-11-black)
![License](https://img.shields.io/badge/License-MIT-green)

## Live Demo

**https://collabspace-mauve.vercel.app**

> **Status:** The production deploy runs in **local demo mode**: it has no Supabase credentials attached, so the app boots a fully working single-user canvas instead of a configuration warning. Drawing, sticky notes, rooms, undo/redo and reactions all work and persist to `localStorage`, so a visitor can use the board immediately. Multiplayer features (shared rooms, live cursors and presence, chat broadcast) require a Supabase project; the free tier allows 2 active projects and those slots are already used by other portfolio apps.
>
> Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and the same deploy switches to full multiplayer with no other change. Locally, Docker + local Supabase (`npx supabase start`) + `npm run dev` gives the complete stack. The schema is idempotent: paste `supabase/migrations/0001_init.sql` into any free Supabase project (or use the local stack).

## Screenshots

### Dark mode - Rooms
![Dark mode Rooms view](docs/screenshots/Screenshot%202026-07-27%20082946.png)

### Light mode - Chat
![Light mode Chat view](docs/screenshots/Screenshot%202026-07-27%20082952.png)

### Dark mode - Users
![Dark mode Users view](docs/screenshots/Screenshot%202026-07-27%20082958.png)

## Features

- **Infinite canvas** - pan (Shift-drag / middle-click), zoom (scroll), minimap
- **Drawing tools** - Pencil, Line, Rectangle, Circle, Text, Sticky note, Eraser, Select, Laser pointer
- **Real-time multiplayer** - live cursors with name labels via Supabase Presence
- **Persistent elements & chat** - Postgres Changes fan-out (no custom Socket server)
- **Ephemeral signals** - floating emoji reactions + laser pointer via Realtime Broadcast
- **Undo / Redo** with full history stack (`⌘Z` / `⌘⇧Z`)
- **Dark / light theme** with system preference + anti-flash
- **Responsive** - 5 breakpoints, mobile bottom-drawer sidebar, 44 px touch targets
- **Accessible** - focus-visible rings, ARIA tablist, prefers-reduced-motion, prefers-contrast
- **Anonymous identity** - random user stored in `localStorage` (auth-ready later)
- **Graceful local demo** - with no Supabase credentials the board still runs: elements and rooms persist to `localStorage` and the shell says so, instead of dead-ending on a configuration error

## Related

Sibling demo: [collabspace-express](https://github.com/devtechedge/collabspace-express) - Express + Vite whiteboard without the Supabase realtime stack.

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
# Idempotent - safe to re-run

# 4. Dev server
npm run dev
# → http://localhost:5173
```

## Architecture (v1 → v2)

Original v1 used Express + Socket.io + Prisma + SQLite.  
v2 is fully client-side against Supabase - no custom backend process.

| Concern              | v2 implementation                          |
|----------------------|--------------------------------------------|
| Boards / elements    | `boardSync.ts` / `canvasSync.ts` → Supabase REST + Postgres Changes |
| Chat                 | `chatSync.ts` → Supabase insert + Postgres Changes |
| Cursors / presence   | Supabase Realtime Presence                 |
| Reactions / laser    | Realtime Broadcast (ephemeral)             |
| Identity             | `identity.ts` → localStorage               |
| Local demo (no env)  | `localBoard.ts` → localStorage boards + elements, no network |

See `client/src/lib/realtime.ts` for the single `joinBoard()` session that wires all four channels.


## Engineering

Phase B hardening: [`SECURITY.md`](SECURITY.md) (open RLS, no auth, payload allow-lists), `npm test` (node:test), `npm run typecheck`, Playwright smokes of the local demo shell (including stroke persistence across reload), GitHub Actions CI, Dependabot (patch/minor only).

## License

MIT License. See [LICENSE](LICENSE) for details.
