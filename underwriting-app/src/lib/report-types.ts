// The underwriting report shape, mirroring the underwriting_review_report tool
// schema (supabase/functions/_shared/reviewSchema.ts). Extracted so the panel
// and hooks share one contract.

export type ReadinessScore = "ready" | "needs_attention" | "not_ready";
export type Recommendation =
  | "proceed" | "proceed_with_conditions" | "request_information"
  | "escalate_to_risk" | "decline";
export type ValidityConclusion = "likely_valid" | "inconclusive" | "likely_invalid";
export type Severity = "low" | "medium" | "high" | "critical";

export interface ScoreBreakdownItem {
  category: string;
  max_score: number;
  score: number;
  note?: string;
}
export interface DocCompletenessItem {
  document: string;
  status: "present" | "missing" | "unverified";
  note?: string;
}
export interface WebsiteRequirement {
  requirement: string;
  met: boolean;
  detail?: string;
}
export interface RedFlag {
  flag: string;
  severity: Severity;
  detail?: string;
}
export interface PublicCheck {
  check: string;
  tool?: string;
  result: string;
}
export interface RecommendedMcc {
  code: string;
  description: string;
  rationale: string;
}

/** The full report as returned by the LLM (raw_report) and largely mirrored by columns. */
export interface UnderwritingReport {
  readiness_score: ReadinessScore;
  score?: number;
  website_score?: number;
  website_score_label?: string;
  confidence?: "high" | "medium" | "low";
  recommendation?: Recommendation;
  summary: string;
  recommended_mcc?: RecommendedMcc;
  transaction_mix_assessment?: string;
  document_completeness?: DocCompletenessItem[];
  website_requirements?: WebsiteRequirement[];
  classification_issues?: { file_name: string; issue: string }[];
  data_gaps?: string[];
  red_flags?: RedFlag[];
  recommended_actions?: string[];
  risk_tier?: "standard" | "high_risk";
  ofac_screening?: string;
  score_breakdown?: ScoreBreakdownItem[];
  hard_stops?: string[];
  public_checks_performed?: PublicCheck[];
  validity_conclusion?: ValidityConclusion;
  validity_justification?: string;
}

/** A persisted validation_reports row (columns + raw_report). */
export interface StoredReport {
  id: string;
  case_id: string;
  triggered_by: string | null;
  readiness_score: ReadinessScore | null;
  score: number | null;
  confidence: string | null;
  recommendation: string | null;
  summary: string | null;
  created_at: string;
  raw_report: UnderwritingReport;
}
