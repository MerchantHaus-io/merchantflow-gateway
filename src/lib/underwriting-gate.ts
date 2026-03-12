import { supabase } from "@/integrations/supabase/client";

/**
 * Hard document requirements for underwriting gate.
 * Maps document_type values to human-readable labels.
 */
const REQUIRED_DOCUMENT_TYPES: { type: string; label: string }[] = [
  { type: "Articles of Organisation", label: "Articles of Organization" },
  { type: "EIN", label: "Tax Document (EIN)" },
  { type: "Voided Check / Bank Confirmation Letter", label: "Voided Check or Bank Confirmation Letter" },
  { type: "Bank Statement", label: "Bank Statements (3 months)" },
  { type: "Passport/Drivers License", label: "Owner ID (Passport or Drivers License)" },
];

/**
 * Checks whether an opportunity meets all hard requirements
 * to proceed to underwriting:
 *
 * 1. An Underwriting Review report exists with a passing score
 * 2. All required document types are uploaded and labelled:
 *    - Articles of Organization
 *    - EIN (Tax Document)
 *    - Voided Check / Bank Confirmation Letter
 *    - Bank Statements OR Transaction History (3 months processing history)
 */
export async function checkUnderwritingGate(opportunityId: string): Promise<{
  allowed: boolean;
  reason: string;
}> {
  // 1. Check for a passing underwriting review report
  const { data: report } = await supabase
    .from("validation_reports")
    .select("readiness_score, summary")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!report) {
    return {
      allowed: false,
      reason: "Underwriting Review has not been run. Run the AI Underwriting Review from the opportunity detail before moving to Underwriting.",
    };
  }

  if (report.readiness_score === "not_ready" || report.readiness_score === "red") {
    return {
      allowed: false,
      reason: `Underwriting Review failed (score: Not Ready). Resolve issues before proceeding.${report.summary ? ` — ${report.summary}` : ""}`,
    };
  }

  // 2. Check for all required document types
  const { data: docs } = await supabase
    .from("documents")
    .select("document_type")
    .eq("opportunity_id", opportunityId);

  const uploadedTypes = new Set((docs || []).map((d) => d.document_type));

  // Transaction History can substitute for Bank Statement
  const hasFinancialHistory = uploadedTypes.has("Bank Statement") || uploadedTypes.has("Transaction History");

  const missing: string[] = [];
  for (const req of REQUIRED_DOCUMENT_TYPES) {
    if (req.type === "Bank Statement") {
      if (!hasFinancialHistory) missing.push(req.label + " or Transaction History");
    } else if (!uploadedTypes.has(req.type)) {
      missing.push(req.label);
    }
  }

  if (missing.length > 0) {
    return {
      allowed: false,
      reason: `Missing required documents: ${missing.join(", ")}. Upload and label these documents before proceeding to Underwriting.`,
    };
  }

  // 3. Check for at least one beneficial owner record (FinCEN CDD Rule)
  const { count: ownerCount } = await supabase
    .from("beneficial_owners")
    .select("id", { count: "exact", head: true })
    .eq("opportunity_id", opportunityId);

  if (!ownerCount || ownerCount < 1) {
    return {
      allowed: false,
      reason: "At least one beneficial owner (25%+ equity) must be recorded before proceeding to Underwriting. Add beneficial owners from the opportunity detail.",
    };
  }

  return { allowed: true, reason: "" };
}
