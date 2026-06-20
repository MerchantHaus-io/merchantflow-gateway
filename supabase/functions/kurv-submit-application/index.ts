import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ───────────────────────────────────────────────────────────────────────────
// Kurv / EMS Onboarding API configuration
//
// The Kurv "Onboarding and Transaction Data API Suite" (docs:
// https://apidocs.emscorporate.com/docs/getting-started) is partner-gated. The
// exact base URL, auth scheme, endpoint path and payload schema are confirmed
// only once Kurv issues developer credentials. Everything that is specific to
// Kurv's contract lives in this block so it is a one-line swap when the token
// and docs arrive — nothing downstream needs to change.
//
// Set these as Supabase function secrets:
//   KURV_API_KEY   — the API token Kurv provides (required to go live)
//   KURV_API_URL   — application-submission endpoint (overrides the default)
//   KURV_AUTH_SCHEME — "bearer" (default) | "apikey" | "basic"
//   KURV_USERNAME  — API username, if Kurv issues one (used for "basic" auth and
//                    surfaced in the payload as `username`)
//   KURV_AGENT_ID  — optional agent / ISO office identifier, if Kurv requires it
// ───────────────────────────────────────────────────────────────────────────
const DEFAULT_KURV_API_URL = 'https://apidocs.emscorporate.com/api/applications';

function buildAuthHeaders(apiKey: string, username?: string): Record<string, string> {
  const scheme = (Deno.env.get('KURV_AUTH_SCHEME') || 'bearer').toLowerCase();
  switch (scheme) {
    case 'apikey':
      return { 'X-API-Key': apiKey };
    case 'basic': {
      // If a username is supplied, encode "username:token"; otherwise assume the
      // token is already a pre-encoded basic credential.
      const value = username ? btoa(`${username}:${apiKey}`) : apiKey;
      return { 'Authorization': `Basic ${value}` };
    }
    case 'bearer':
    default:
      return { 'Authorization': `Bearer ${apiKey}` };
  }
}

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

    // ── Build the Kurv application payload ──
    // NOTE: field names below are our best mapping pending verification against
    // the gated apidocs.emscorporate.com schema. When Kurv supplies the docs,
    // adjust only this object — persistence and the UI are schema-agnostic.
    const agentId = Deno.env.get('KURV_AGENT_ID') || undefined;
    const apiUsername = Deno.env.get('KURV_USERNAME') || undefined;
    const kurvPayload: Record<string, unknown> = {
      agentId,
      username: apiUsername,
      business: {
        legalName: legal_name,
        dbaName: dba_name || legal_name,
        businessType: business_type || undefined,
        mcc: mcc || undefined,
        startDate: business_start_date || undefined,
        ein: ein || undefined,
        website: website_url || undefined,
        address: { address1, address2: address2 || undefined, city, state, zip, country },
        phone,
      },
      principal: {
        firstName: first_name,
        lastName: last_name,
        title: title || undefined,
        email,
        phone,
        dateOfBirth: owner_dob || undefined,
        ssn: ssn || undefined,
        ownershipPercent: numOrNull(ownership_percent) ?? undefined,
      },
      processing: {
        averageTicket: numOrNull(average_ticket) ?? undefined,
        highTicket: numOrNull(high_ticket) ?? undefined,
        monthlyVolume: numOrNull(monthly_volume) ?? undefined,
      },
      bankAccount: (routing_number && account_number) ? {
        bankName: bank_name || undefined,
        routingNumber: routing_number,
        accountNumber: account_number,
        accountType: account_type,
      } : undefined,
    };

    // A masked copy for our own audit record — never persist raw EIN/SSN/account.
    const maskedPayload = JSON.parse(JSON.stringify(kurvPayload));
    if (maskedPayload.business?.ein) maskedPayload.business.ein = `***${last4(ein) ?? ''}`;
    if (maskedPayload.principal?.ssn) maskedPayload.principal.ssn = `***${last4(ssn) ?? ''}`;
    if (maskedPayload.bankAccount?.routingNumber) maskedPayload.bankAccount.routingNumber = `***${last4(routing_number) ?? ''}`;
    if (maskedPayload.bankAccount?.accountNumber) maskedPayload.bankAccount.accountNumber = `***${last4(account_number) ?? ''}`;

    const KURV_API_KEY = Deno.env.get('KURV_API_KEY');
    const KURV_API_URL = Deno.env.get('KURV_API_URL') || DEFAULT_KURV_API_URL;

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
    if (!KURV_API_KEY) {
      const draftRecord = {
        ...baseRecord,
        kurv_status: 'pending_credentials',
        error_message: 'KURV_API_KEY is not configured yet — application saved as a draft. Add the Kurv API token to go live.',
      };
      const saved = await upsertSubmission(supabaseAdmin, submission_id, draftRecord);
      return new Response(JSON.stringify({
        success: false,
        pending_credentials: true,
        submission_id: saved?.id,
        error: 'Kurv API access is not configured yet. The application has been saved as a draft and can be re-submitted once the API token is added.',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Submit to Kurv / EMS ──
    console.log('Submitting application to Kurv:', { legal_name, opportunity_id, account_id });
    let kurvData: Record<string, unknown> = {};
    let kurvOk = false;
    let httpStatus = 0;
    try {
      const kurvResponse = await fetch(KURV_API_URL, {
        method: 'POST',
        headers: {
          ...buildAuthHeaders(KURV_API_KEY, apiUsername),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(kurvPayload),
      });
      httpStatus = kurvResponse.status;
      const text = await kurvResponse.text();
      try { kurvData = text ? JSON.parse(text) : {}; } catch { kurvData = { raw: text }; }
      kurvOk = kurvResponse.ok;
    } catch (fetchErr) {
      kurvData = { error: fetchErr instanceof Error ? fetchErr.message : 'Network error contacting Kurv' };
      kurvOk = false;
    }

    // Defensive: Kurv's identifier field name is unverified — try common shapes.
    const applicationId =
      (kurvData?.applicationId as string) ||
      (kurvData?.application_id as string) ||
      (kurvData?.id as string) ||
      ((kurvData?.data as Record<string, unknown>)?.id as string) ||
      null;

    const errorMessage = kurvOk ? null : (
      (kurvData?.message as string) ||
      (kurvData?.error as string) ||
      `HTTP ${httpStatus || 'error'}`
    );

    const saved = await upsertSubmission(supabaseAdmin, submission_id, {
      ...baseRecord,
      kurv_application_id: applicationId,
      kurv_status: kurvOk ? 'submitted' : 'failed',
      kurv_response: kurvData,
      error_message: errorMessage,
    });

    return new Response(JSON.stringify({
      success: kurvOk,
      application_id: applicationId,
      submission_id: saved?.id,
      kurv_response: kurvData,
      error: errorMessage,
    }), {
      status: kurvOk ? 200 : 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Kurv application submission error:', err);
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
