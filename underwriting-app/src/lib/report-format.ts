import type { ReadinessScore, Recommendation, Severity, ValidityConclusion } from "./report-types";

export const READINESS_LABEL: Record<ReadinessScore, string> = {
  ready: "Ready",
  needs_attention: "Needs attention",
  not_ready: "Not ready",
};

export const READINESS_CLASS: Record<ReadinessScore, string> = {
  ready: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  needs_attention: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  not_ready: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  proceed: "Proceed",
  proceed_with_conditions: "Proceed with conditions",
  request_information: "Request information",
  escalate_to_risk: "Escalate to risk",
  decline: "Decline",
};

export const VALIDITY_LABEL: Record<ValidityConclusion, string> = {
  likely_valid: "Likely valid",
  inconclusive: "Inconclusive",
  likely_invalid: "Likely invalid",
};

export const SEVERITY_CLASS: Record<Severity, string> = {
  low: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  critical: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

export function scoreColor(score: number | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 75) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
