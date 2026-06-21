# CollabSpace

Real-time multiplayer collaborative whiteboard with infinite canvas, WebSocket streaming, and database persistence.

## What's inside

- `client/` — React 18 + Vite + TypeScript + Framer Motion frontend
- `server/` — Express + Socket.io + Prisma (SQLite) backend

## Quick start

```bash
# from the repo root
npm install                 # installs both workspaces
npm run db:migrate          # create SQLite schema
npm run dev                 # starts client (5173) and server (5000) together
```

Open http://localhost:5173.

## Features

### Drawing
- Infinite canvas with pan (Shift-drag or middle-click) and zoom (scroll)
- Pencil, Line, Rectangle, Circle, Text, Eraser tools
- Select tool with drag-to-move and Delete/Backspace to remove
- Undo / Redo with full history stack (`⌘Z` / `⌘⇧Z`)
- Per-board persistence via Prisma + SQLite
- PNG export of the current view
- Keyboard shortcuts: `V` Select, `P` Pencil, `L` Line, `R` Rect, `C` Circle, `T` Text, `E` Eraser, `N` Sticky, `X` Laser

### Real-time collaboration
- Live multiplayer cursors with name labels
- Animated presence indicators in the sidebar
- Sticky notes that sync in real-time across all peers
- Chat panel with persistent history (last 200 messages per board)
- Floating emoji reactions (🎉 👍 ❤️ 💡 🚀 🔥) that animate up and fade
- Laser pointer tool for "look here" moments — ephemeral pulsing dot broadcast to all peers
- Minimap (bottom-right) showing the entire canvas with a viewport indicator; click to navigate

### UI / Animation
- Framer Motion for tool transitions, panel entries, sticky note spring animations, presence list reordering, and toast notifications
- CSS keyframe animations for cursor pulsing, logo glow, grid fade-in, and ambient aurora background
- Glassmorphic panels with backdrop blur, depth shadows, and inner highlights
- Hover micro-interactions on every tool button, swatch, and room item
- Animated connection status (live/offline)
- Spring-bounced tool activation
- Fully responsive (minimap hides on narrow screens, sidebar collapses on mobile)
- Respects `prefers-reduced-motion`

## Architecture notes

- All canvas elements (including stickies) live in the same `Element` Prisma table — sticky notes have `type = "STICKY"` and are rendered as HTML overlays on top of the canvas rather than drawn into the 2D context, which allows inline text editing and per-sticky color picker.
- Chat messages are persisted in a separate `Message` table keyed by `boardId`. The server sends the last 200 messages to any client on `join-room`.
- Reactions and laser pointers are ephemeral — they are broadcast through Socket.io but never written to the database.
- The minimap renders all elements (including stickies as small color rectangles) onto a tiny canvas, plus a viewport indicator that updates as you pan and zoom.
- Undo/redo is client-local: each action pushes to a per-client stack, and reverts are sent to the server via `element-revert` so peers see the same state changes.

## Database

```bash
npm run db:migrate      # apply migrations
npm run db:seed         # (if seed script exists)
npm run db:studio       # open Prisma Studio GUI
```

Schema lives at `server/prisma/schema.prisma`.
