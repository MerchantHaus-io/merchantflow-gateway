import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { CaseRow, OrgSettings } from "./types.ts";

/**
 * The edge function runs with the service-role key, which BYPASSES RLS. So it
 * MUST self-enforce tenant ownership. This resolves the caller from their JWT,
 * loads the case, and confirms the caller is a member of the case's org before
 * any work happens. Defense in depth on top of the Postgres RLS policies.
 */
export async function authorizeCaseAccess(
  admin: SupabaseClient,
  jwt: string,
  caseId: string,
): Promise<
  | { ok: true; userId: string; caseRow: CaseRow; settings: OrgSettings }
  | { ok: false; status: number; error: string }
> {
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }
  const userId = userData.user.id;

  const { data: caseRow, error: caseErr } = await admin
    .from("cases")
    .select(
      "id, org_id, service_type, legal_name, dba_name, website_url, address, contact, application, owners",
    )
    .eq("id", caseId)
    .maybeSingle();

  if (caseErr || !caseRow) {
    return { ok: false, status: 404, error: "Case not found" };
  }

  // Membership check — the crux of tenant isolation for the service-role path.
  const { data: member } = await admin
    .from("org_members")
    .select("user_id")
    .eq("org_id", caseRow.org_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member) {
    // Do not leak existence details across tenants.
    return { ok: false, status: 404, error: "Case not found" };
  }

  const { data: settings } = await admin
    .from("org_settings")
    .select("llm_model, house_rules")
    .eq("org_id", caseRow.org_id)
    .maybeSingle();

  return {
    ok: true,
    userId,
    caseRow: caseRow as CaseRow,
    settings: (settings as OrgSettings) ?? {
      llm_model: "google/gemini-2.5-flash",
      house_rules: {},
    },
  };
}
