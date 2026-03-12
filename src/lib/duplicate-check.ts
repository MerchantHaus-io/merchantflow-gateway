import { supabase } from "@/integrations/supabase/client";

/**
 * Checks for potential duplicate merchants by matching EIN (federal_tax_id),
 * legal entity name, or DBA name against existing records.
 *
 * Returns a warning string if duplicates are found, or null if clean.
 */
export async function checkDuplicateMerchant(opportunityId: string): Promise<string | null> {
  // Get opportunity's wizard state for business details
  const { data: wizard } = await supabase
    .from("onboarding_wizard_states")
    .select("form_state")
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  const form = (wizard?.form_state as Record<string, string>) || {};
  const tin = form.tin || form.federal_tax_id || "";
  const legalName = (form.legalEntityName || form.legal_entity_name || "").trim().toLowerCase();
  const dbaName = (form.dbaName || form.dba_name || "").trim().toLowerCase();

  if (!tin && !legalName && !dbaName) return null;

  // Get this opportunity's account_id to exclude self
  const { data: opp } = await supabase
    .from("opportunities")
    .select("account_id")
    .eq("id", opportunityId)
    .single();

  if (!opp) return null;

  const matches: string[] = [];

  // Check EIN match via merchants table
  if (tin && tin.length >= 9) {
    const { data: tinMatches } = await supabase
      .from("merchants")
      .select("dba_name, legal_entity_name, federal_tax_id")
      .eq("federal_tax_id", tin);

    if (tinMatches && tinMatches.length > 0) {
      matches.push(`EIN ${tin} already exists on: ${tinMatches.map(m => m.legal_entity_name || m.dba_name || "Unknown").join(", ")}`);
    }
  }

  // Check account name / DBA match
  if (legalName || dbaName) {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, name")
      .neq("id", opp.account_id);

    const nameMatches = (accounts || []).filter(a => {
      const n = a.name.toLowerCase();
      return (legalName && n === legalName) || (dbaName && n === dbaName);
    });

    if (nameMatches.length > 0) {
      matches.push(`Account name matches: ${nameMatches.map(a => a.name).join(", ")}`);
    }
  }

  if (matches.length === 0) return null;

  return `⚠️ Potential duplicate detected: ${matches.join(". ")}. Verify this is not a duplicate submission before proceeding.`;
}
