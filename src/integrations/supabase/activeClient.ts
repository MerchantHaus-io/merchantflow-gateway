// Returns the Supabase client this tab should use:
//   - impersonation tab (admin viewing as a referrer) → isolated client
//   - every other tab                                 → default shared client
//
// Evaluated once at module load. The bootstrap step in main.tsx flips the
// sessionStorage flag *before* React mounts, so this is stable for the lifetime
// of the tab.

import { supabase as defaultSupabase } from "./client";
import { getImpersonationClient, isImpersonationTab } from "./impersonationClient";

export const activeSupabase = isImpersonationTab() ? getImpersonationClient() : defaultSupabase;

export const isImpersonating = isImpersonationTab();
