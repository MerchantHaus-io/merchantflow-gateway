// Returns the Supabase client this tab should use:
//   - impersonation tab (admin viewing as a referrer) → isolated client
//   - every other tab                                 → default shared client
//
// IMPORTANT: this MUST resolve lazily on each access. ES module evaluation
// happens before main.tsx runs `bootstrapImpersonation()`, so a snapshot taken
// at module load would always be the default client and the impersonation
// session would be invisible to AuthContext (manifests as "No profile
// associated" on the portal).

import { supabase as defaultSupabase } from "./client";
import { getImpersonationClient, isImpersonationTab } from "./impersonationClient";

function resolveClient() {
  return isImpersonationTab() ? getImpersonationClient() : defaultSupabase;
}

// Proxy that forwards every property access to whichever client is active
// *right now*. Cached call-site bindings (e.g. destructured `auth`) still work
// because each `.auth`, `.from(...)`, etc. lookup re-resolves.
export const activeSupabase = new Proxy({} as ReturnType<typeof resolveClient>, {
  get(_t, prop, receiver) {
    const client = resolveClient() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? (value as Function).bind(client) : value;
  },
  has(_t, prop) {
    return prop in (resolveClient() as object);
  },
});

/** Snapshot helper: true if this tab is currently impersonating. */
export const isImpersonating = () => isImpersonationTab();
