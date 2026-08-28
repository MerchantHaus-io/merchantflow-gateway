import { supabase } from "@/integrations/supabase/client";
import type { Opportunity } from "@/types/opportunity";

/**
 * Assign or unassign a deal.
 *
 * Lifted out of OpportunityCard so the phone's one-tap Claim writes exactly
 * what the desktop assign popover writes — including the revival rule, which
 * is the part that would quietly diverge if it were copied: assigning a dead
 * deal brings it back to active, and a deal whose stage is not one an active
 * deal can hold is reset to the start rather than reappearing somewhere
 * meaningless.
 */

/** Stages a live deal is allowed to sit in when it comes back from dead. */
const VALID_ACTIVE_STAGES = [
  "application_started",
  "discovery",
  "qualified",
  "application_prep",
  "underwriting_review",
  "processor_approval",
  "integration_setup",
  "gateway_submitted",
  "live_activated",
];

export interface AssignResult {
  ok: boolean;
  /** What the row now holds, so callers can update local state without refetching. */
  assignedTo: string | null;
  error?: unknown;
}

export async function assignDeal(
  opportunity: Pick<Opportunity, "id" | "stage" | "status">,
  assignedTo: string | null,
): Promise<AssignResult> {
  const updateData: Record<string, unknown> = { assigned_to: assignedTo };

  if (opportunity.status === "dead" && assignedTo) {
    updateData.status = "active";
    if (!VALID_ACTIVE_STAGES.includes(opportunity.stage)) {
      updateData.stage = "application_started";
    }
  }

  const { error } = await supabase.from("opportunities").update(updateData).eq("id", opportunity.id);
  if (error) return { ok: false, assignedTo, error };
  return { ok: true, assignedTo };
}
