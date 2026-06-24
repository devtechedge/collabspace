// ─── Supabase client singleton ─────────────────────────────────────
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env / Vercel.
// The anon key is safe to ship to the browser — it's the public key.
// Auth is not enabled in v1 (see RLS in supabase/migrations/0001_init.sql).

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Don't crash the app — show a helpful banner in App.tsx instead.
  // eslint-disable-next-line no-console
  console.warn(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env and fill in your project credentials."
  );
}

export const supabase: SupabaseClient = createClient(
  url ?? "http://invalid.local",
  anonKey ?? "invalid-anon-key",
  {
    realtime: {
      params: {
        // Postgres Changes events per second per client. Plenty for a board app.
        eventsPerSecond: 50,
      },
    },
  }
);

export const isSupabaseConfigured = Boolean(url && anonKey);
