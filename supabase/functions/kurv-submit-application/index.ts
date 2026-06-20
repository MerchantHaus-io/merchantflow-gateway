import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ───────────────────────────────────────────────────────────────────────────
// Kurv / EMS "MyPortfolio" Developer API — Deal (merchant application) submission
// Docs: https://apidocs.emscorporate.com/docs/getting-started
//
// Auth is a JWT token-exchange flow:
//   1. POST {UserName, Password} to /API/Token/GET  → { Token, Expires } (24h, UTC)
//   2. Send `Authorization: Bearer <Token>` on every subsequent call.
// Applications are submitted as a "Signed Deal": POST /api/v2/Deals/Signed.
//
// Supabase function secrets:
//   KURV_USERNAME  — API username (e.g. Merchanthaus_Test_API)         [required]
//   KURV_PASSWORD  — API password                                       [required]
//   KURV_BASE_URL  — base host (default sandbox apitest.emscorporate.com)
//   KURV_OFFICE    — Office code the deal belongs to (must belong to user) [required]
//   KURV_BRANCH    — 4-digit branch code                                [optional]
//   KURV_REP       — 4-digit rep code                                   [optional]
//   KURV_PARTNER   — 4-digit partner office                             [optional]
//
// NOTE: the EMS estate is US-geofenced — this function must egress from a US IP.
//
// CALIBRATION: the inner object schemas (MerchantData / BankData / Owners /
// DealProcessing / Pricings / Equipments) and the ID-based lookups (MccId,
// OwnershipType, Owner Title) are not yet fully documented. The sandbox returns
// a 400 with a `{ Title, Errors[] }` body listing exactly what is wrong — that
// response is surfaced in the UI so the payload can be tightened iteratively.
// ───────────────────────────────────────────────────────────────────────────
const DEFAULT_BASE_URL = 'https://apitest.emscorporate.com';
const TOKEN_PATH = '/API/Token/GET';
const SUBMIT_PATH = '/api/v2/Deals/Signed';

const last4 = (v: unknown): string | null => {
  if (!v) return null;
  const s = String(v).replace(/\D/g, '');
  return s ? s.slice(-4) : null;
};

const numOrNull = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Module-level token cache — reused across warm invocations until ~1 min before
// expiry (tokens are valid 24h; Expires is UTC).
let cachedToken: { token: string; expiresMs: number } | null = null;

async function getKurvToken(baseUrl: string, username: string, password: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresMs - 60_000 > now) return cachedToken.token;

  const res = await fetch(`${baseUrl}${TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ UserName: username, Password: password }),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  const jwt = (data?.Token as string) || (data?.token as string);
  if (!res.ok || !jwt) {
    const detail = (data?.Title as string) || (data?.message as string) || text?.slice(0, 300);
    throw new Error(`Kurv token request failed (HTTP ${res.status}): ${detail || 'no token returned'}`);
  }
  const expiresMs = data?.Expires ? Date.parse(data.Expires as string) : now + 23 * 3600 * 1000;
  cachedToken = { token: jwt, expiresMs: Number.isFinite(expiresMs) ? expiresMs : now + 23 * 3600 * 1000 };
  return jwt;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Verify the caller is an authenticated CRM user ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub;
    const userEmail = claimsData.claims.email;

    const body = await req.json();
    const {
      submission_id,
      opportunity_id,
      account_id,
      // Business
      legal_name,
      dba_name,
      business_type,
      mcc,
      business_start_date,
      ein,
      website_url,
      // Principal / owner
      first_name,
      last_name,
      title,
      email,
      phone,
      owner_dob,
      ssn,
      ownership_percent,
      // Address
      address1,
      address2,
      city,
      state,
      zip,
      country = 'US',
      // Processing
      average_ticket,
      high_ticket,
      monthly_volume,
      // Banking
      bank_name,
      routing_number,
      account_number,
      account_type = 'checking',
      // Optional underwriting notes
      udw_notes,
    } = body;

    // ── Validate required fields ──
    const required = { legal_name, first_name, last_name, email, phone, address1, city, state, zip };
    const missing = Object.entries(required).filter(([_, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
      return new Response(JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Build the Signed Deal (v2) envelope ──
    // The top-level field names match the documented contract. Inner objects are
    // best-effort pending the (still-gated) Deal Submission Guide; the sandbox's
    // 400 `Errors[]` response drives the remaining field-name calibration.
    const office = Deno.env.get('KURV_OFFICE') || undefined;
    const branch = Deno.env.get('KURV_BRANCH') || undefined;
    const rep = Deno.env.get('KURV_REP') || undefined;
    const partner = Deno.env.get('KURV_PARTNER') || undefined;

    const dealPayload: Record<string, unknown> = {
      Office: office,
      Branch: branch,
      Rep: rep,
      Partner: partner,
      UniqueId: opportunity_id || undefined,
      UDWNotes: udw_notes || undefined,
      MerchantData: {
        DBA: dba_name || legal_name,
        LegalName: legal_name,
        FederalTaxId: ein || undefined,
        MccId: numOrNull(mcc) ?? undefined,            // expects an MccId from /api/v1/MCCs
        OwnershipType: business_type || undefined,     // expects an Id from /api/v1/OwnershipTypes
        BusinessStartDate: business_start_date || undefined,
        Website: website_url || undefined,
        Phone: phone,
        Email: email,
        Address: { Address1: address1, Address2: address2 || undefined, City: city, State: state, Zip: zip },
        AverageTicket: numOrNull(average_ticket) ?? undefined,
        HighTicket: numOrNull(high_ticket) ?? undefined,
        MonthlyVolume: numOrNull(monthly_volume) ?? undefined,
      },
      Owners: [
        {
          FirstName: first_name,
          LastName: last_name,
          Title: title || undefined,                   // expects an Id from /api/v1/OwnerTitles
          Email: email,
          Phone: phone,
          DOB: owner_dob || undefined,
          SSN: ssn || undefined,
          OwnershipPercent: numOrNull(ownership_percent) ?? undefined,
          Address: { Address1: address1, Address2: address2 || undefined, City: city, State: state, Zip: zip },
        },
      ],
      BankData: (routing_number && account_number) ? {
        BankName: bank_name || undefined,
        RoutingNum: routing_number,
        AccountNum: account_number,
        AccountType: account_type,
      } : undefined,
      DealProcessing: {},   // TODO: schema pending Deal Submission Guide
      Pricings: {},         // TODO: schema pending Deal Submission Guide
      Equipments: {},       // TODO: schema pending Deal Submission Guide
      Documents: [],        // TODO: base64 document objects (see /api/v1/Documents)
    };

    // A masked copy for our own audit record — never persist raw EIN/SSN/account.
    const maskedPayload = JSON.parse(JSON.stringify(dealPayload));
    if (maskedPayload.MerchantData?.FederalTaxId) maskedPayload.MerchantData.FederalTaxId = `***${last4(ein) ?? ''}`;
    if (maskedPayload.Owners?.[0]?.SSN) maskedPayload.Owners[0].SSN = `***${last4(ssn) ?? ''}`;
    if (maskedPayload.BankData?.RoutingNum) maskedPayload.BankData.RoutingNum = `***${last4(routing_number) ?? ''}`;
    if (maskedPayload.BankData?.AccountNum) maskedPayload.BankData.AccountNum = `***${last4(account_number) ?? ''}`;

    const KURV_USERNAME = Deno.env.get('KURV_USERNAME');
    const KURV_PASSWORD = Deno.env.get('KURV_PASSWORD');
    const baseUrl = (Deno.env.get('KURV_BASE_URL') || DEFAULT_BASE_URL).replace(/\/$/, '');
    const submitUrl = `${baseUrl}${SUBMIT_PATH}`;

    // Shared record skeleton persisted regardless of outcome.
    const baseRecord = {
      opportunity_id: opportunity_id || null,
      account_id: account_id || null,
      submitted_by: userId,
      submitted_by_email: userEmail,
      legal_name,
      dba_name: dba_name || null,
      business_type: business_type || null,
      mcc: mcc || null,
      business_start_date: business_start_date || null,
      ein_last4: last4(ein),
      website_url: website_url || null,
      first_name,
      last_name,
      title: title || null,
      email,
      phone,
      owner_dob: owner_dob || null,
      ssn_last4: last4(ssn),
      ownership_percent: numOrNull(ownership_percent),
      address1,
      address2: address2 || null,
      city,
      state,
      zip,
      country,
      average_ticket: numOrNull(average_ticket),
      high_ticket: numOrNull(high_ticket),
      monthly_volume: numOrNull(monthly_volume),
      bank_name: bank_name || null,
      routing_number_last4: last4(routing_number),
      account_number_last4: last4(account_number),
      account_type,
      submitted_payload: maskedPayload,
    };

    // ── Credentials not configured yet → save as a draft, don't fail loudly ──
    if (!KURV_USERNAME || !KURV_PASSWORD) {
      const saved = await upsertSubmission(supabaseAdmin, submission_id, {
        ...baseRecord,
        kurv_status: 'pending_credentials',
        error_message: 'Kurv credentials not configured — application saved as a draft. Add KURV_USERNAME and KURV_PASSWORD to go live.',
      });
      return new Response(JSON.stringify({
        success: false,
        pending_credentials: true,
        submission_id: saved?.id,
        error: 'Kurv API access is not configured yet. The application has been saved as a draft and can be re-submitted once credentials are added.',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 1. Acquire a JWT token ──
    let jwt: string;
    try {
      jwt = await getKurvToken(baseUrl, KURV_USERNAME, KURV_PASSWORD);
    } catch (authErr) {
      const msg = authErr instanceof Error ? authErr.message : 'Kurv authentication failed';
      const saved = await upsertSubmission(supabaseAdmin, submission_id, {
        ...baseRecord,
        kurv_status: 'failed',
        error_message: msg,
        kurv_response: { stage: 'token', error: msg },
      });
      return new Response(JSON.stringify({ success: false, submission_id: saved?.id, error: msg, kurv_response: { stage: 'token', error: msg } }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Submit the signed deal ──
    console.log('Submitting deal to Kurv:', { legal_name, office, opportunity_id, account_id });
    let kurvData: Record<string, unknown> = {};
    let kurvOk = false;
    let httpStatus = 0;
    try {
      const kurvResponse = await fetch(submitUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(dealPayload),
      });
      httpStatus = kurvResponse.status;
      const text = await kurvResponse.text();
      try { kurvData = text ? JSON.parse(text) : {}; } catch { kurvData = { raw: text }; }
      kurvOk = kurvResponse.ok;
    } catch (fetchErr) {
      kurvData = { error: fetchErr instanceof Error ? fetchErr.message : 'Network error contacting Kurv' };
      kurvOk = false;
    }

    // Success returns an EMS deal id (e.g. "H-2597"); errors return { Title, Errors[] }.
    const dealId =
      (kurvData?.EMSDealId as string) ||
      (kurvData?.DealId as string) ||
      (kurvData?.Id as string) ||
      null;

    const errorList = Array.isArray(kurvData?.Errors) ? (kurvData.Errors as string[]) : [];
    const errorMessage = kurvOk ? null : (
      errorList.length
        ? `${(kurvData?.Title as string) || 'Submission rejected'}: ${errorList.join('; ')}`
        : (kurvData?.Title as string) || (kurvData?.Message as string) || (kurvData?.message as string) || `HTTP ${httpStatus || 'error'}`
    );

    const saved = await upsertSubmission(supabaseAdmin, submission_id, {
      ...baseRecord,
      kurv_application_id: dealId,
      kurv_status: kurvOk ? 'submitted' : 'failed',
      kurv_response: kurvData,
      error_message: errorMessage,
    });

    return new Response(JSON.stringify({
      success: kurvOk,
      application_id: dealId,
      submission_id: saved?.id,
      kurv_response: kurvData,
      error: errorMessage,
    }), {
      status: kurvOk ? 200 : 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Kurv deal submission error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Insert a new submission row or update an existing draft.
async function upsertSubmission(
  supabaseAdmin: any,
  submissionId: string | undefined,
  record: Record<string, unknown>,
) {
  if (submissionId) {
    const { data, error } = await supabaseAdmin
      .from('kurv_application_submissions')
      .update({ ...record, updated_at: new Date().toISOString() })
      .eq('id', submissionId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabaseAdmin
    .from('kurv_application_submissions')
    .insert(record)
    .select()
    .single();
  if (error) throw error;
  return data;
}
