// Shared shapes for the underwriting-review function. Mirrors the app's
// cases/org_settings rows (subset actually used by the review).

export interface HouseRules {
  foundation_tier_threshold?: number;
  required_doc_types?: string[];
  gateway_required_doc_types?: string[];
  bank_statement_months?: number;
}

export interface OrgSettings {
  llm_model: string;
  house_rules: HouseRules;
}

export interface CaseRow {
  id: string;
  org_id: string;
  service_type: "processing" | "gateway_only";
  legal_name: string | null;
  dba_name: string | null;
  website_url: string | null;
  address: Record<string, unknown>;
  contact: Record<string, unknown>;
  application: Record<string, unknown>;
  owners: unknown[];
}

export interface DocRow {
  file_name: string;
  document_type: string | null;
}
