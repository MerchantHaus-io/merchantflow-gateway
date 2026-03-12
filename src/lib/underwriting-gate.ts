import { supabase } from "@/integrations/supabase/client";

/**
 * Checks whether an opportunity has passed document validation
 * and meets the minimum requirements to proceed to underwriting.
 *
 * Requirements:
 * - A validation report with readiness_score of "green" or "yellow"
 * - At least one document classified as "Bank Statement" or "Transaction History"
 *   (representing 3 months of processing/banking history)
 */
export async function checkUnderwritingGate(opportunityId: string): Promise<{
  allowed: boolean;
  reason: string;
}> {
  // 1. Check for a passing validation report
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
      reason: "Document validation has not been run. Run AI Validate in the Documents tab before moving to Underwriting.",
    };
  }

  if (report.readiness_score === "red") {
    return {
      allowed: false,
      reason: `Document validation failed (score: Red). Resolve issues before proceeding to Underwriting.${report.summary ? ` — ${report.summary}` : ""}`,
    };
  }

  // 2. Check for required financial documents (processing history or bank statements)
  const { data: docs } = await supabase
    .from("documents")
    .select("document_type")
    .eq("opportunity_id", opportunityId)
    .in("document_type", ["Bank Statement", "Transaction History"]);

  if (!docs || docs.length === 0) {
    return {
      allowed: false,
      reason: "Missing required documents: Upload at least 3 months of processing history (e.g. Stripe, First Data statements) or bank statements showing business banking activity.",
    };
  }

  return { allowed: true, reason: "" };
}
