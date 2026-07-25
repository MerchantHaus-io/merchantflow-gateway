// Hand-authored to match underwriting-app/supabase/migrations. When the fresh
// Supabase project exists, regenerate with:
//   supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
// Keep this file and the migrations in sync until then.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrgRole = "owner" | "admin" | "underwriter" | "viewer";
export type CaseStatus = "draft" | "in_review" | "complete";
export type ServiceType = "processing" | "gateway_only";

export interface Database {
  public: {
    Tables: {
      orgs: {
        Row: {
          id: string;
          name: string;
          slug: string;
          stripe_customer_id: string | null;
          plan: string;
          subscription_status: string;
          trial_ends_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          stripe_customer_id?: string | null;
          plan?: string;
          subscription_status?: string;
          trial_ends_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["orgs"]["Insert"]>;
        Relationships: [];
      };
      org_members: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          role: OrgRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          role?: OrgRole;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["org_members"]["Insert"]>;
        Relationships: [];
      };
      org_settings: {
        Row: {
          org_id: string;
          logo_url: string | null;
          primary_color: string | null;
          product_name: string;
          house_rules: Json;
          feature_flags: Json;
          llm_model: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          logo_url?: string | null;
          primary_color?: string | null;
          product_name?: string;
          house_rules?: Json;
          feature_flags?: Json;
          llm_model?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["org_settings"]["Insert"]>;
        Relationships: [];
      };
      org_invites: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: OrgRole;
          token: string;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          role?: OrgRole;
          token: string;
          expires_at: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["org_invites"]["Insert"]>;
        Relationships: [];
      };
      cases: {
        Row: {
          id: string;
          org_id: string;
          status: CaseStatus;
          service_type: ServiceType;
          legal_name: string | null;
          dba_name: string | null;
          website_url: string | null;
          address: Json;
          contact: Json;
          application: Json;
          owners: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          status?: CaseStatus;
          service_type?: ServiceType;
          legal_name?: string | null;
          dba_name?: string | null;
          website_url?: string | null;
          address?: Json;
          contact?: Json;
          application?: Json;
          owners?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cases"]["Insert"]>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          org_id: string;
          case_id: string;
          file_name: string;
          storage_path: string;
          document_type: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          case_id: string;
          file_name: string;
          storage_path: string;
          document_type?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
      validation_reports: {
        Row: {
          id: string;
          org_id: string;
          case_id: string;
          triggered_by: string | null;
          readiness_score: string | null;
          score: number | null;
          website_score: number | null;
          confidence: string | null;
          recommendation: string | null;
          risk_tier: string | null;
          summary: string | null;
          document_completeness: Json;
          classification_issues: Json;
          data_gaps: Json;
          red_flags: Json;
          recommended_actions: Json;
          score_breakdown: Json;
          hard_stops: Json;
          public_checks_performed: Json;
          validity_conclusion: string | null;
          validity_justification: string | null;
          raw_report: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          case_id: string;
          triggered_by?: string | null;
          readiness_score?: string | null;
          score?: number | null;
          website_score?: number | null;
          confidence?: string | null;
          recommendation?: string | null;
          risk_tier?: string | null;
          summary?: string | null;
          document_completeness?: Json;
          classification_issues?: Json;
          data_gaps?: Json;
          red_flags?: Json;
          recommended_actions?: Json;
          score_breakdown?: Json;
          hard_stops?: Json;
          public_checks_performed?: Json;
          validity_conclusion?: string | null;
          validity_justification?: string | null;
          raw_report?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["validation_reports"]["Insert"]>;
        Relationships: [];
      };
      usage_events: {
        Row: {
          id: string;
          org_id: string;
          kind: string;
          tokens: number | null;
          cost_cents: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          kind: string;
          tokens?: number | null;
          cost_cents?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["usage_events"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      user_orgs: {
        Args: Record<string, never>;
        Returns: string[];
      };
      is_org_admin: {
        Args: { p_org: string };
        Returns: boolean;
      };
      bootstrap_org: {
        Args: { p_name: string; p_slug: string };
        Returns: string;
      };
      accept_invite: {
        Args: { p_token: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
