import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, tooManyRequests } from "../_shared/rate-limit.ts";
import {
  buildTeamSummary,
  cleanStr,
  deriveServiceType,
  escapeLike,
  oneBusinessDayFrom,
} from "../_shared/scoping-routing.ts";

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

/** The service-role client, typed from the factory rather than as `any`. */
type Db = ReturnType<typeof createClient>;

interface RoutingResult {
  opportunity_id: string | null;
  account_id: string | null;
  contact_id: string | null;
  task_id: string | null;
}

/**
 * Phase 2A — turn a stored submission into something a human will actually see.
 *
 * Before this, the form wrote a row and stopped: no opportunity, no task, no
 * notification. That was the single most expensive defect in the audit.
 *
 * DESIGN RULE: this must never fail the submission. The merchant has already
 * filled in the form and the row is already saved; losing their submission
 * because a downstream insert failed would be strictly worse than routing it
 * late. Every step is best-effort and logged, and the caller swallows throws.
 */
async function routeSubmission(
  supabase: Db,
  submissionId: string,
  data: Record<string, unknown>,
): Promise<RoutingResult> {
  const result: RoutingResult = {
    opportunity_id: null,
    account_id: null,
    contact_id: null,
    task_id: null,
  };

  const email = cleanStr(data.contact_email);
  const legalName = cleanStr(data.legal_business_name);
  const firstName = cleanStr(data.contact_first_name);
  const lastName = cleanStr(data.contact_last_name);
  const phone = cleanStr(data.contact_phone);
  const providedOppId = cleanStr(data.opportunity_id);
  const serviceType = deriveServiceType(data.integration_route as string[] | null);

  // 1. If the form came from a rep's link, attach to that opportunity rather
  //    than creating a second one for the same deal (#182).
  if (providedOppId) {
    const { data: opp } = await supabase
      .from("opportunities")
      .select("id, account_id, contact_id")
      .eq("id", providedOppId)
      .maybeSingle();

    if (opp) {
      result.opportunity_id = opp.id;
      result.account_id = opp.account_id;
      result.contact_id = opp.contact_id;
    } else {
      // A token that does not resolve is worth knowing about; carry on and
      // create a fresh opportunity rather than dropping the submission.
      console.warn("[submit-scoping-request] opportunity_id did not resolve:", providedOppId);
    }
  }

  // 2. Otherwise match on contact email first, then business name, then create.
  if (!result.opportunity_id) {
    if (email) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, account_id")
        .ilike("email", escapeLike(email))
        .limit(1)
        .maybeSingle();

      if (contact) {
        result.contact_id = contact.id;
        result.account_id = contact.account_id;
      }
    }

    if (!result.account_id && legalName) {
      const { data: account } = await supabase
        .from("accounts")
        .select("id")
        .ilike("name", escapeLike(legalName))
        .limit(1)
        .maybeSingle();

      if (account) result.account_id = account.id;
    }

    if (!result.account_id) {
      const { data: account, error } = await supabase
        .from("accounts")
        .insert({
          name: legalName ?? "Unnamed business",
          website: cleanStr(data.website_url),
          address1: cleanStr(data.business_address_line1),
          city: cleanStr(data.business_city),
          state: cleanStr(data.business_state),
          zip: cleanStr(data.business_zip),
          status: "active",
        })
        .select("id")
        .single();

      if (error) throw new Error(`account insert failed: ${error.message}`);
      result.account_id = account.id;
    }

    if (!result.contact_id) {
      const { data: contact, error } = await supabase
        .from("contacts")
        .insert({
          account_id: result.account_id,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
        })
        .select("id")
        .single();

      if (error) throw new Error(`contact insert failed: ${error.message}`);
      result.contact_id = contact.id;
    }

    const { data: opp, error: oppErr } = await supabase
      .from("opportunities")
      .insert({
        account_id: result.account_id,
        contact_id: result.contact_id,
        stage: "discovery",
        status: "active",
        // `source` stays 'web_form' — every one of the 93 existing rows uses
        // it, and introducing a new value here would hide these deals from
        // any view already filtering on it. Provenance lives in
        // scoping_submissions.opportunity_id instead.
        source: "web_form",
        service_type: serviceType,
        // assigned_to is deliberately NOT set. Decision, 10 Aug 2026: the
        // submission stays unassigned and the task goes to a queue, rather
        // than inventing an owner so the task has somewhere to land.
        // Note the column holds DISPLAY NAMES, not emails — see phase-2.md.
      })
      .select("id")
      .single();

    if (oppErr) throw new Error(`opportunity insert failed: ${oppErr.message}`);
    result.opportunity_id = opp.id;
  }

  // 3. Link the submission back to what it produced.
  const { error: linkErr } = await supabase
    .from("scoping_submissions")
    .update({
      opportunity_id: result.opportunity_id,
      account_id: result.account_id,
      contact_id: result.contact_id,
    })
    .eq("id", submissionId);

  if (linkErr) console.error("[submit-scoping-request] linkage update failed:", linkErr.message);

  // 4. The task. Unassigned by decision, so it lands on the shared queue
  //    rather than being dropped on someone who never looks at it.
  //
  //    `priority: high` is deliberate — these carry a one-business-day SLA,
  //    where 567 of the 568 existing tasks are 'medium'. Both values are in
  //    use, so this is a judgement, not an invented enum member. Easy to flip.
  const contactName = [firstName, lastName].filter(Boolean).join(" ") || null;

  const summary = buildTeamSummary({
    legalBusinessName: legalName,
    contactName,
    contactEmail: email,
    monthlyVolume: cleanStr(data.monthly_volume),
    currentlyProcessing: cleanStr(data.currently_processing),
    serviceType,
  });

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .insert({
      title: `New scoping submission: ${legalName ?? "Unnamed business"}`,
      description: `${summary}\n\nOpportunity: /opportunities/${result.opportunity_id}`,
      assignee: null,
      status: "open",
      priority: "high",
      source: "scoping",
      due_at: oneBusinessDayFrom(new Date()),
      related_opportunity_id: result.opportunity_id,
      related_contact_id: result.contact_id,
    })
    .select("id")
    .single();

  if (taskErr) {
    console.error("[submit-scoping-request] task insert failed:", taskErr.message);
  } else {
    result.task_id = task.id;
  }

  // 5. Tell the team. There is no owner to email, so this fans out to staff
  //    via the in-app notifications table rather than a hardcoded address.
  try {
    const { data: staff } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["staff", "admin"]);

    const ids = [...new Set((staff ?? []).map((r: { user_id: string }) => r.user_id))];

    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ids);

      const rows = (profiles ?? []).map((p: { id: string; email: string | null }) => ({
        user_id: p.id,
        user_email: p.email,
        title: "New scoping submission",
        message: `${legalName ?? "A merchant"} submitted the scoping form.`,
        type: "opportunity",
        link: `/opportunities/${result.opportunity_id}`,
      }));

      if (rows.length > 0) {
        const { error: notifyErr } = await supabase.from("notifications").insert(rows);
        if (notifyErr) {
          console.error("[submit-scoping-request] notify failed:", notifyErr.message);
        }
      }
    }
  } catch (err) {
    console.error("[submit-scoping-request] notify threw:", err);
  }

  return result;
}

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

    // Route it into the pipeline. Awaited so failures are logged in the same
    // invocation, but never allowed to fail the response: the row is already
    // saved, and losing a merchant's submission to a downstream insert error
    // would be worse than routing it late by hand.
    let routing: RoutingResult | null = null;
    if (inserted?.id) {
      try {
        routing = await routeSubmission(supabase, inserted.id, data);
        console.log("[submit-scoping-request] routed", inserted.id, routing);
      } catch (err) {
        console.error("[submit-scoping-request] routing failed (submission kept):", err);
      }
    }

    return json({
      success: true,
      id: inserted?.id,
      opportunity_id: routing?.opportunity_id ?? null,
    });
  } catch (err) {
    console.error("[submit-scoping-request] unexpected error:", err);
    return json({ error: "Unexpected server error" }, 500);
  }
});
