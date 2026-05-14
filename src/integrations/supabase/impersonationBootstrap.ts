// Runs once at app boot. If the URL signals an impersonation handoff, it pulls
// the referrer's session tokens out of localStorage (written by the admin tab),
// installs them on the per-tab impersonation client, and flips the
// "impersonation-active" sessionStorage flag so the rest of the app uses that
// isolated client instead of the default one.
//
// CRITICAL: this must execute synchronously *before* React renders anything
// that depends on auth state, so AuthProvider can pick up the right client on
// its very first effect.

import {
  IMPERSONATION_ACTIVE_FLAG,
  IMPERSONATION_REFERRER_LABEL,
  getImpersonationClient,
} from "@/integrations/supabase/impersonationClient";

interface Handoff {
  access_token: string;
  refresh_token: string;
  referrer_name?: string;
  referrer_email?: string;
  ts: number;
}

const HANDOFF_TTL_MS = 60_000; // 1 minute

export async function bootstrapImpersonation(): Promise<void> {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const referrerId = params.get("impersonate");
  if (!referrerId) {
    // Not an impersonation tab. Make sure the flag is clear.
    sessionStorage.removeItem(IMPERSONATION_ACTIVE_FLAG);
    return;
  }

  // If we've already bootstrapped this tab, skip.
  if (sessionStorage.getItem(IMPERSONATION_ACTIVE_FLAG) === "1") return;

  const handoffKey = `impersonation-handoff:${referrerId}`;
  const raw = localStorage.getItem(handoffKey);
  if (!raw) return;

  // One-shot: delete immediately so a refresh / second tab can't replay it.
  localStorage.removeItem(handoffKey);

  let handoff: Handoff;
  try {
    handoff = JSON.parse(raw) as Handoff;
  } catch {
    return;
  }
  if (!handoff?.access_token || !handoff?.refresh_token) return;
  if (Date.now() - (handoff.ts ?? 0) > HANDOFF_TTL_MS) return;

  try {
    const client = getImpersonationClient();
    const { error } = await client.auth.setSession({
      access_token: handoff.access_token,
      refresh_token: handoff.refresh_token,
    });
    if (error) {
      console.error("Impersonation setSession failed", error);
      return;
    }
    sessionStorage.setItem(IMPERSONATION_ACTIVE_FLAG, "1");
    if (handoff.referrer_name) {
      sessionStorage.setItem(IMPERSONATION_REFERRER_LABEL, handoff.referrer_name);
    }
  } catch (err) {
    console.error("Impersonation bootstrap error", err);
  }
}
