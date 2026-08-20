# Security Assessment — CollabSpace

**Date:** 2026-08-21  
**Scope:** Auth, XSS, injection, RLS, secrets, CORS, dependency risk  
**Context:** Public Vercel deploy is a **frontend-only shell** (no Supabase env). Full multiplayer needs a Supabase project. Schema in `supabase/migrations/0001_init.sql` is **open RLS** (no auth).

---

## Executive summary

| Area | Risk | Notes |
|------|------|--------|
| Authentication | **N/A (by design)** | Anonymous identity in `localStorage` only |
| Authorization / RLS | **High if a public Supabase project is attached** | Policies are `using (true)` / `with check (true)` — any visitor can read/write every board |
| XSS | **Low** | No `dangerouslySetInnerHTML`; React text nodes; chat/board names sanitized |
| Injection (SQL) | **Low** | Supabase client parameterized REST; no raw SQL in the app |
| Realtime payload | **Medium (if public backend)** | Elements / chat / broadcast events are untrusted; client now allow-lists types, emojis, coords, text length |
| Secrets in repo | **Low** | `.env*` gitignored; only the public anon / publishable key is used in the browser |
| CORS | **N/A** | No custom HTTP API; Supabase hosted endpoints |
| Build | **Hardened** | `npm run typecheck` is `tsc --noEmit`; CI runs unit + e2e |

**Overall (public Vercel demo):** Low residual risk — no backend secrets, no attached database, unconfigured shell only.

**Overall (a live Supabase project with this schema):** High — unauthenticated shared whiteboard. Treat any connected project as a public pad, not a private workspace.

---

## 1. Authentication & session

**Findings**
- No login. `client/src/lib/identity.ts` generates `userId` + username + colour and stores them in `localStorage`.
- Reloads reuse that identity; private mode gets an ephemeral one.

**Verdict:** Auth is intentionally absent. Do not claim “secured with Supabase Auth”.

**If auth is added later:** replace open RLS with per-user / per-board policies; never trust `userId` from the client.

---

## 2. Injection & untrusted payloads

**Findings**
- Boards, elements, and chat go through Supabase REST + Postgres Changes.
- Broadcast (reactions, laser) and Presence (cursors) are fire-and-forget.
- Chat text and board names were previously only trimmed; a peer could send oversized or odd element `type` values.

**Hardening applied**
- Allow-list for canvas element types (`PENCIL | LINE | RECTANGLE | CIRCLE | TEXT | ERASER | STICKY`).
- Chat text: trim, reject empty, cap at 1000 chars.
- Board names: trim, reject empty, cap at 80 chars.
- Element geometry: finite numbers, clamped coords, capped point lists, `#RGB` / `#RRGGBB` colours only.
- Reaction emojis: allow-list (already in `ephemeral.ts`, now shared with `validation.ts`).
- Incoming Postgres rows are sanitized before they enter React state.

---

## 3. XSS

**Findings**
- Code search found **no** `dangerouslySetInnerHTML` / `innerHTML` writes.
- Usernames, chat, sticky text, and board names render as React text → default escaping.
- Inline anti-flash script in `index.html` is first-party, not user-controlled.

---

## 4. Row Level Security

`0001_init.sql` enables RLS then opens every table:

```sql
create policy "boards_read" on public.boards for select using (true);
create policy "boards_write" on public.boards for insert with check (true);
-- same pattern for update/delete on boards + elements; messages are read + insert
```

This matches v1 (“every visitor can read/write”). **Do not attach a project that holds private data.**

Tighten when adding Auth: drop the open policies, key rows to `auth.uid()`, and lock Presence/Broadcast channels.

---

## 5. Secrets & config hygiene

**Findings**
- `.gitignore` excludes `.env`, `client/.env`, `.env*.local`.
- `.env.example` documents `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — no credentials.
- The anon / publishable key is the public browser key by design.
- Production Vercel currently has **no** Supabase env, so the live URL cannot talk to a database.

---

## 6. HTTP / deploy surface

| Surface | Auth | Notes |
|---------|------|--------|
| `https://collabspace-mauve.vercel.app` | None | Static SPA; shows “Supabase not configured” without env |
| Vite `npm run dev` | None | Local only |
| Supabase REST / Realtime | Anon key | Open RLS if a project is wired |

`vercel.json` SPA rewrite is routing only — no serverless API.

---

## 7. Dependency / supply chain

**This pass**
- Dropped `uuid` / `@types/uuid` (native `crypto.randomUUID()`).
- Remaining runtime: `react`, `react-dom`, `framer-motion`, `@supabase/supabase-js`.

```bash
npm audit --omit=dev
```

Dependabot: weekly npm + GitHub Actions, **patch/minor grouped**, **majors ignored**.

---

## 8. Residual risk & acceptance

**Accepted for portfolio demo**
- No user authentication on the public site.
- Unconfigured production shell (no cloud Supabase slot).
- Open RLS on any personal/local Supabase used for screenshots.

**Not accepted if a public backend is attached without a rewrite**
- Open write policies on `boards` / `elements` / `messages`.
- Treating client-supplied `userId` as an authorization boundary.

---

## 9. Follow-ups

1. **Done:** SECURITY.md + input allow-lists / sanitizers.  
2. **Done:** Drop `uuid`; typecheck script.  
3. **Done:** Unit tests (`npm test`).  
4. **Done:** Playwright smokes for the unconfigured shell (`npm run test:e2e`).  
5. **Done:** GitHub Actions CI + Dependabot (ignore majors).

---

## 10. How to re-test

```bash
npm install
npm test
npm run typecheck
npm run test:e2e
npm audit --omit=dev
```
