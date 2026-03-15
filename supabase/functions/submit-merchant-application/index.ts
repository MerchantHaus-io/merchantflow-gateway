import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Validation Schemas ───

const text = (max: number) => z.string().trim().max(max);
const reqText = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const email = () => z.string().trim().email().max(255);
const phone = () =>
  z.string().trim().min(10, "Phone too short").max(20, "Phone too long");
const percent = () =>
  z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, "Invalid percentage").optional().or(z.literal(""));
const money = () =>
  z.string().trim().regex(/^[\d,]+(\.\d{1,2})?$/, "Invalid amount").optional().or(z.literal(""));

const PrincipalSchema = z.object({
  principal_first_name: reqText(100),
  principal_last_name: reqText(100),
  principal_title: reqText(100),
  ownership_percent: z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/),
  principal_phone: optText(20),
  principal_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  principal_address_line1: optText(200),
  principal_address_line2: optText(200),
  principal_city: optText(100),
  principal_state: optText(50),
  principal_zip: optText(20),
  principal_country: optText(100),
  date_of_birth: reqText(20),
  ssn_full: z.string().trim().regex(/^\d{9}$/, "SSN must be exactly 9 digits"),
});

const ProcessingSchema = z.object({
  service_type: z.literal("processing"),
  // Business Profile
  dba_name: reqText(200),
  product_description: reqText(2000),
  nature_of_business: reqText(500),
  dba_contact_first_name: reqText(100),
  dba_contact_last_name: reqText(100),
  dba_contact_phone: phone(),
  dba_contact_email: email(),
  dba_address_line1: reqText(200),
  dba_address_line2: optText(200),
  dba_city: reqText(100),
  dba_state: reqText(50),
  dba_zip: reqText(20),
  dba_country: optText(10),
  // Legal
  legal_entity_name: reqText(200),
  federal_tax_id: z.string().trim().min(1).max(20),
  ownership_type: reqText(100),
  business_formation_date: reqText(20),
  state_incorporated: reqText(50),
  tax_exempt: z.boolean().optional().default(false),
  legal_address_line1: reqText(200),
  legal_address_line2: optText(200),
  legal_city: reqText(100),
  legal_state: reqText(50),
  legal_zip: reqText(20),
  legal_country: optText(10),
  // Processing Profile
  monthly_volume: reqText(50),
  average_transaction: reqText(50),
  high_ticket: reqText(50),
  percent_swiped: reqText(10),
  percent_keyed: reqText(10),
  percent_moto: reqText(10),
  percent_ecommerce: reqText(10),
  percent_b2b: optText(10),
  percent_b2c: optText(10),
  website_url: optText(500),
  sic_mcc_code: optText(20),
  // Principals
  principals: z.array(PrincipalSchema).min(1).max(5),
  // Banking
  bank_name: reqText(200),
  account_holder_name: reqText(200),
  routing_number: z.string().trim().regex(/^\d{9}$/, "Routing number must be 9 digits"),
  account_number: z.string().trim().regex(/^\d{4,17}$/, "Account number must be 4-17 digits"),
  // Agreements
  merchant_agreement_accepted: z.literal(true, { errorMap: () => ({ message: "Agreement required" }) }),
  account_authorization_accepted: z.literal(true, { errorMap: () => ({ message: "Authorization required" }) }),
  beneficial_owner_certification: z.boolean(),
  // Notes
  additional_notes: optText(5000),
  // Pricing
  pricing_plan: optText(50),
});

const GatewaySchema = z.object({
  service_type: z.literal("gateway_only"),
  dba_name: reqText(200),
  dba_contact_first_name: reqText(100),
  dba_contact_last_name: reqText(100),
  dba_contact_phone: phone(),
  dba_contact_email: email(),
  dba_address_line1: reqText(200),
  dba_address_line2: optText(200),
  dba_city: reqText(100),
  dba_state: reqText(50),
  dba_zip: reqText(20),
  dba_country: optText(10),
  username: reqText(100),
  current_processor: reqText(200),
  additional_notes: optText(5000),
  pricing_plan: optText(50),
});

const DocSubmissionSchema = z.object({
  service_type: z.literal("document_submission"),
  dba_contact_first_name: reqText(100),
  dba_contact_last_name: reqText(100),
  dba_contact_email: email(),
  additional_notes: optText(5000),
});

const InputSchema = z.discriminatedUnion("service_type", [
  ProcessingSchema,
  GatewaySchema,
  DocSubmissionSchema,
]);

// ─── Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { client_ip, user_agent, ...formData } = body;
    const parsed = InputSchema.parse(formData);
    const clientIp = client_ip || "unknown";
    const userAgent = user_agent || "unknown";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const applicationId = crypto.randomUUID();

    if (parsed.service_type === "document_submission") {
      const { error } = await supabase.from("applications").insert({
        id: applicationId,
        full_name: `${parsed.dba_contact_first_name} ${parsed.dba_contact_last_name}`.trim(),
        email: parsed.dba_contact_email,
        service_type: "document_submission",
        status: "pending",
        notes: parsed.additional_notes || null,
      });
      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, application_id: applicationId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (parsed.service_type === "gateway_only") {
      const { error } = await supabase.from("applications").insert({
        id: applicationId,
        full_name: `${parsed.dba_contact_first_name} ${parsed.dba_contact_last_name}`.trim(),
        email: parsed.dba_contact_email,
        phone: parsed.dba_contact_phone,
        company_name: parsed.dba_name,
        service_type: "gateway_only",
        status: "pending",
        dba_name: parsed.dba_name,
        notes: `[Gateway Only] Processor: ${parsed.current_processor}. Username: ${parsed.username}. ${parsed.additional_notes || ""}`.trim(),
        address: parsed.dba_address_line1,
        address2: parsed.dba_address_line2 || null,
        city: parsed.dba_city,
        state: parsed.dba_state,
        zip: parsed.dba_zip,
        website: null,
      });
      if (error) throw error;

      // Record consent
      await supabase.from("merchant_consents").insert({
        application_id: applicationId,
        applicant_name: `${parsed.dba_contact_first_name} ${parsed.dba_contact_last_name}`.trim(),
        applicant_email: parsed.dba_contact_email,
        consent_type: "merchant_agreement",
        ip_address: clientIp,
        user_agent: userAgent,
        terms_version: "1.0",
        beneficial_ownership_accepted: false,
        merchant_agreement_accepted: false,
        account_authorization_accepted: false,
      });

      return new Response(
        JSON.stringify({ success: true, application_id: applicationId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Processing flow ──

    // Validate tx mix = 100%
    const txMix = [parsed.percent_swiped, parsed.percent_keyed, parsed.percent_moto, parsed.percent_ecommerce]
      .map((v) => parseFloat(v) || 0)
      .reduce((a, b) => a + b, 0);
    if (Math.abs(txMix - 100) > 0.01) {
      return new Response(
        JSON.stringify({ error: `Transaction mix must equal 100% (currently ${txMix}%)` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate b2b+b2c if both provided
    if (parsed.percent_b2b && parsed.percent_b2c) {
      const salesMix = (parseFloat(parsed.percent_b2b) || 0) + (parseFloat(parsed.percent_b2c) || 0);
      if (Math.abs(salesMix - 100) > 0.01) {
        return new Response(
          JSON.stringify({ error: `B2B + B2C must equal 100% (currently ${salesMix}%)` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate ownership = 100%
    const ownershipTotal = parsed.principals.reduce(
      (sum, p) => sum + (parseFloat(p.ownership_percent) || 0),
      0
    );
    if (Math.abs(ownershipTotal - 100) > 0.01) {
      return new Response(
        JSON.stringify({ error: `Ownership must total 100% (currently ${ownershipTotal}%)` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Insert application
    const p0 = parsed.principals[0];
    const { error: appError } = await supabase.from("applications").insert({
      id: applicationId,
      full_name: `${parsed.dba_contact_first_name} ${parsed.dba_contact_last_name}`.trim(),
      email: parsed.dba_contact_email,
      phone: parsed.dba_contact_phone,
      company_name: parsed.dba_name,
      service_type: "processing",
      status: "pending",
      dba_name: parsed.dba_name,
      nature_of_business: parsed.nature_of_business,
      monthly_volume: parsed.monthly_volume,
      notes: parsed.additional_notes || null,
      address: parsed.dba_address_line1,
      address2: parsed.dba_address_line2 || null,
      city: parsed.dba_city,
      state: parsed.dba_state,
      zip: parsed.dba_zip,
      website: parsed.website_url || null,
      legal_name: parsed.legal_entity_name,
      federal_tax_id: parsed.federal_tax_id,
      state_of_incorporation: parsed.state_incorporated,
      business_structure: parsed.ownership_type,
      date_established: parsed.business_formation_date,
      avg_ticket: parsed.average_transaction,
      high_ticket: parsed.high_ticket,
      products: parsed.product_description,
      in_person_percent: parsed.percent_swiped,
      keyed_percent: parsed.percent_keyed,
      ecommerce_percent: parsed.percent_ecommerce,
      owner_name: `${p0.principal_first_name} ${p0.principal_last_name}`.trim(),
      owner_title: p0.principal_title || null,
      owner_dob: p0.date_of_birth || null,
      owner_ssn_last4: p0.ssn_full ? p0.ssn_full.slice(-4) : null,
      owner_address: p0.principal_address_line1 || null,
      owner_city: p0.principal_city || null,
      owner_state: p0.principal_state || null,
      owner_zip: p0.principal_zip || null,
    });
    if (appError) throw appError;

    // 2. Insert merchant
    const { error: merchantError } = await supabase.from("merchants").insert({
      application_id: applicationId,
      dba_name: parsed.dba_name,
      product_description: parsed.product_description,
      nature_of_business: parsed.nature_of_business,
      dba_contact_first_name: parsed.dba_contact_first_name,
      dba_contact_last_name: parsed.dba_contact_last_name,
      dba_contact_phone: parsed.dba_contact_phone,
      dba_contact_email: parsed.dba_contact_email,
      dba_address_line1: parsed.dba_address_line1,
      dba_address_line2: parsed.dba_address_line2 || null,
      dba_city: parsed.dba_city,
      dba_state: parsed.dba_state,
      dba_zip: parsed.dba_zip,
      dba_country: parsed.dba_country || "US",
      legal_entity_name: parsed.legal_entity_name,
      federal_tax_id: parsed.federal_tax_id,
      ownership_type: parsed.ownership_type,
      business_formation_date: parsed.business_formation_date,
      state_incorporated: parsed.state_incorporated,
      tax_exempt: parsed.tax_exempt ?? false,
      legal_address_line1: parsed.legal_address_line1,
      legal_address_line2: parsed.legal_address_line2 || null,
      legal_city: parsed.legal_city,
      legal_state: parsed.legal_state,
      legal_zip: parsed.legal_zip,
      legal_country: parsed.legal_country || "US",
      monthly_volume: parsed.monthly_volume,
      average_transaction: parsed.average_transaction,
      high_ticket: parsed.high_ticket,
      percent_swiped: parsed.percent_swiped,
      percent_keyed: parsed.percent_keyed,
      percent_moto: parsed.percent_moto,
      percent_ecommerce: parsed.percent_ecommerce,
      percent_b2b: parsed.percent_b2b || null,
      percent_b2c: parsed.percent_b2c || null,
      website_url: parsed.website_url || null,
      sic_mcc_code: parsed.sic_mcc_code || null,
    });
    if (merchantError) console.error("Merchant insert error:", merchantError);

    // 3. Insert principals
    for (const principal of parsed.principals) {
      await supabase.from("principals").insert({
        application_id: applicationId,
        principal_first_name: principal.principal_first_name,
        principal_last_name: principal.principal_last_name,
        principal_title: principal.principal_title,
        ownership_percent: parseFloat(principal.ownership_percent) || 0,
        principal_phone: principal.principal_phone || null,
        principal_email: principal.principal_email || null,
        principal_address_line1: principal.principal_address_line1 || null,
        principal_address_line2: principal.principal_address_line2 || null,
        principal_city: principal.principal_city || null,
        principal_state: principal.principal_state || null,
        principal_zip: principal.principal_zip || null,
        principal_country: principal.principal_country || "US",
        date_of_birth: principal.date_of_birth,
        ssn_last4: principal.ssn_full ? principal.ssn_full.slice(-4) : null,
      });
    }

    // 4. Insert bank account
    await supabase.from("bank_accounts").insert({
      application_id: applicationId,
      bank_name: parsed.bank_name,
      account_holder_name: parsed.account_holder_name,
      account_last4: parsed.account_number ? parsed.account_number.slice(-4) : null,
    });

    // 5. Encrypt sensitive data
    const hasSensitive = parsed.principals.some((p) => p.ssn_full) || parsed.routing_number || parsed.account_number;
    if (hasSensitive) {
      const encryptPayload: Record<string, string> = { application_id: applicationId };
      if (parsed.principals[0]?.ssn_full) encryptPayload.ssn_full = parsed.principals[0].ssn_full;
      if (parsed.routing_number) encryptPayload.routing_number = parsed.routing_number;
      if (parsed.account_number) encryptPayload.account_number = parsed.account_number;

      try {
        await fetch(`${supabaseUrl}/functions/v1/encrypt-secrets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify(encryptPayload),
        });
      } catch (encErr) {
        console.error("Encryption call failed (non-blocking):", encErr);
      }
    }

    // 6. Record consent
    await supabase.from("merchant_consents").insert({
      application_id: applicationId,
      applicant_name: `${parsed.dba_contact_first_name} ${parsed.dba_contact_last_name}`.trim(),
      applicant_email: parsed.dba_contact_email,
      consent_type: "merchant_agreement",
      ip_address: clientIp,
      user_agent: userAgent,
      terms_version: "1.0",
      beneficial_ownership_accepted: parsed.beneficial_owner_certification,
      merchant_agreement_accepted: parsed.merchant_agreement_accepted,
      account_authorization_accepted: parsed.account_authorization_accepted,
    });

    return new Response(
      JSON.stringify({ success: true, application_id: applicationId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      return new Response(
        JSON.stringify({ error: "Validation failed", issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error("submit-merchant-application error:", err);
    return new Response(
      JSON.stringify({ error: (err as any)?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
