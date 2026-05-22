// Isolated Supabase client used ONLY in admin-impersonation tabs.
//
// Why a second client:
//   The default `supabase` client persists its session in localStorage under a
//   shared storageKey. localStorage is shared across every tab on the same origin,
//   so signing in as a referrer in one tab would clobber the admin's session in
//   every other tab and force the admin to re-authenticate.
//
// This client uses sessionStorage (per-tab) and a distinct storageKey, so the
// referrer session lives only in the impersonation tab and dies when that tab
// closes — the admin's main session is never touched.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://cuqjaddtmkotgvfsgcol.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1cWphZGR0bWtvdGd2ZnNnY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NTM3NjUsImV4cCI6MjA4MDQyOTc2NX0.u1m_nORZsJ3Law0y3-xIIoNUoiRcrTXukJyW14y-AoA";

export const IMPERSONATION_STORAGE_KEY = "sb-impersonation-auth-token";
export const IMPERSONATION_ACTIVE_FLAG = "impersonation-active";
export const IMPERSONATION_HANDOFF_KEY = "impersonation-handoff";
export const IMPERSONATION_REFERRER_LABEL = "impersonation-referrer-label";

let client: SupabaseClient<Database> | null = null;

export function getImpersonationClient(): SupabaseClient<Database> {
  if (client) return client;
  // Guard for SSR-like environments
  const storage =
    typeof window !== "undefined" ? window.sessionStorage : (undefined as unknown as Storage);
  client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage,
      storageKey: IMPERSONATION_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

/** Returns true if this tab is currently acting as an impersonation tab. */
export function isImpersonationTab(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(IMPERSONATION_ACTIVE_FLAG) === "1";
}
