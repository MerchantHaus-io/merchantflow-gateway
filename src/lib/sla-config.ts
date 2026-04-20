import { OpportunityStage } from "@/types/opportunity";

/**
 * Master switch for the auto-creation of SLA tasks (e.g. the "24h follow-up"
 * task created from the Pipeline page when an opportunity sits in discovery).
 *
 * Set to `false` to pause all SLA-driven task creation. Manually-created
 * tasks are unaffected. Flip back to `true` to resume.
 *
 * Note: this only gates the auto-creation. The SLA *display* (amber/red dots
 * on opportunities) still works regardless — it's read-only and useful.
 */
export const SLA_AUTO_TASKS_ENABLED = false;

/**
 * SLA thresholds per pipeline stage (in hours).
 * amber = at risk, red = overdue / breached.
 */
export const SLA_THRESHOLDS: Record<OpportunityStage, { amber: number; red: number }> = {
  discovery:           { amber: 48,  red: 96 },   // 2 days → 4 days
  qualified:           { amber: 48,  red: 72 },   // 2 days → 3 days
  application_prep:    { amber: 72,  red: 120 },  // 3 days → 5 days
  underwriting_review: { amber: 72,  red: 120 },  // 3 days → 5 days
  processor_approval:  { amber: 48,  red: 96 },   // 2 days → 4 days
  gateway_submitted:   { amber: 48,  red: 72 },   // 2 days → 3 days
  integration_setup:   { amber: 72,  red: 120 },  // 3 days → 5 days
  testing:             { amber: 48,  red: 72 },   // 2 days → 3 days
  go_live_ready:       { amber: 24,  red: 48 },   // 1 day  → 2 days
  closed_won:          { amber: 999, red: 999 },  // No SLA for won deals
};

/**
 * Calculates the SLA status for an opportunity based on time-in-stage.
 */
export function calculateSlaStatus(
  stage: OpportunityStage,
  stageEnteredAt: string | null | undefined,
  createdAt: string
): "green" | "amber" | "red" {
  const enteredAt = stageEnteredAt ? new Date(stageEnteredAt) : new Date(createdAt);
  const hoursInStage = (Date.now() - enteredAt.getTime()) / (1000 * 60 * 60);
  const thresholds = SLA_THRESHOLDS[stage];

  if (!thresholds) return "green";
  if (hoursInStage >= thresholds.red) return "red";
  if (hoursInStage >= thresholds.amber) return "amber";
  return "green";
}
