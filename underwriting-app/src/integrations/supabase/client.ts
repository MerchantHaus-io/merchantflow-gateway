import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Env-driven ONLY. Unlike the origin CRM client, there is no hardcoded project
// URL or key here — this app is multi-tenant and must never ship a baked-in
// Supabase project. Fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Fail loud in dev; a misconfigured deploy should not silently point nowhere.
  // eslint-disable-next-line no-console
  console.error(
    "[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in your project values.",
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY ?? "",
  {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
