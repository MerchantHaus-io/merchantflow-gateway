import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const optionalStr = z.string().trim().max(4000).optional().nullable();
const optionalArr = z.array(z.string().max(200)).max(40).optional().nullable();

const BodySchema = z.object({
  // Required
  legal_business_name: z.string().trim().min(1, "Legal business name is required").max(255),
  contact_first_name: z.string().trim().min(1, "First name is required").max(120),
  contact_last_name: z.string().trim().min(1, "Last name is required").max(120),
  contact_email: z.string().trim().email("A valid email address is required").max(255),
  contact_phone: z.string().trim().min(7, "A valid phone number is required").max(40),
  product_description: z.string().trim().min(1, "Please describe what you sell").max(4000),
  acknowledgement_name: z.string().trim().min(1, "Printed name is required").max(200),
  disclosures_accepted: z.literal(true, {
    errorMap: () => ({ message: "The disclosures must be acknowledged" }),
  }),

  // Optional text fields
  dba_name: optionalStr,
  entity_type: optionalStr,
  state_of_incorporation: optionalStr,
  years_in_operation: optionalStr,
  employee_count: optionalStr,
  website_url: optionalStr,
  business_address_line1: optionalStr,
  business_city: optionalStr,
  business_state: optionalStr,
  business_zip: optionalStr,
  contact_title: optionalStr,
  technical_contact_name: optionalStr,
  technical_contact_email: optionalStr,
  foreign_ownership: optionalStr,

  industry_vertical: optionalStr,
  estimated_mcc: optionalStr,
  fulfilment_timeframe: optionalStr,
  refund_policy_summary: optionalStr,
  typical_refund_rate: optionalStr,
  currently_processing: optionalStr,
  current_processor: optionalStr,
  current_effective_rate: optionalStr,
  contract_end_date: optionalStr,
  monthly_volume: optionalStr,
  monthly_transaction_count: optionalStr,
  average_ticket: optionalStr,
  highest_ticket: optionalStr,
  projected_volume_12mo: optionalStr,
  seasonal_peak_months: optionalStr,
  channel_split_notes: optionalStr,
  chargeback_count_12mo: optionalStr,
  chargeback_ratio: optionalStr,
  prior_terminations: optionalStr,

  storefront_platform: optionalStr,
  crm_or_erp: optionalStr,
  accounting_system: optionalStr,
  has_developer_resource: optionalStr,
  terminal_count: optionalStr,
  location_mid_count: optionalStr,
  unusual_flow_notes: optionalStr,

  pci_status: optionalStr,
  existing_fraud_tooling: optionalStr,
  chargeback_management_provider: optionalStr,

  funding_timeline: optionalStr,
  deposit_structure: optionalStr,
  reconciliation_owner: optionalStr,
  reporting_frequency: optionalStr,
  reporting_requirements: optionalStr,
  target_go_live_date: optionalStr,
  hard_deadline_reason: optionalStr,
  process_stage: optionalStr,
  other_providers_evaluated: optionalStr,
  budget_expectation: optionalStr,
  additional_notes: optionalStr,
  acknowledgement_title: optionalStr,

  // Multi-selects
  restricted_verticals: optionalArr,
  channel_mix: optionalArr,
  payment_methods: optionalArr,
  currency_geography: optionalArr,
  integration_route: optionalArr,
  gateway_capabilities: optionalArr,
  data_collected: optionalArr,
  decision_makers: optionalArr,

  // Meta
  opportunity_id: z.string().uuid().optional().nullable(),
  user_agent: optionalStr,
  utm: z.record(z.any()).optional().nullable(),
}).passthrough();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Public endpoint: no session required, so throttle per IP.
  const rl = await checkRateLimit(req, "submit-scoping-request", 3, 600);
  if (!rl.allowed) return tooManyRequests(rl, corsHeaders);
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== "object") {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        field: i.path.join(".") || "body",
        message: i.message,
      }));
      return json({ error: "Validation failed", issues }, 400);
    }

    const data = parsed.data as Record<string, unknown>;

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      null;

    const ALLOWED = new Set(Object.keys(BodySchema.shape));
    const row: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key === "user_agent") continue;
      const value = data[key];
      if (value === undefined || value === "") continue;
      row[key] = value;
    }
    row.user_agent = (data.user_agent as string | undefined) || req.headers.get("user-agent") || null;
    row.client_ip = clientIp;
    row.status = "new";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: inserted, error } = await supabase
      .from("scoping_submissions")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error("[submit-scoping-request] insert failed:", error.message);
      return json({ error: "Could not save your submission. Please try again shortly." }, 500);
    }

    console.log("[submit-scoping-request] stored submission", inserted?.id);
    return json({ success: true, id: inserted?.id });
  } catch (err) {
    console.error("[submit-scoping-request] unexpected error:", err);
    return json({ error: "Unexpected server error" }, 500);
  }
});
