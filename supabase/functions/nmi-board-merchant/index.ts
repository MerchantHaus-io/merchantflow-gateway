import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const NMI_API_URL = 'https://secure.nmi.com/api/v4/merchants';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NMI_API_KEY = Deno.env.get('NMI_API_KEY');
    if (!NMI_API_KEY) {
      throw new Error('NMI_API_KEY is not configured');
    }

    // Verify auth
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
      merchant_type = 'gateway',
      company,
      dba_name,
      first_name,
      last_name,
      email,
      phone,
      address1,
      address2,
      city,
      state,
      zip,
      country = 'US',
      url: websiteUrl,
      timezone = 'America/New_York',
      language = 'en_US',
      username,
      // Banking info (NMI-required accountInfo)
      check_aba,
      check_account,
      account_holder_type = 'business',
      account_type = 'checking',
      // Legacy fields (kept for backwards compat)
      bank_name,
      routing_number,
      account_number,
    } = body;

    // Validate required fields
    const required = { company, first_name, last_name, email, phone, address1, city, state, zip, username };
    const missing = Object.entries(required).filter(([_, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
      return new Response(JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate merchant_type against NMI accepted values
    const validTypes = ['gateway', 'test', 'splitFunding', 'mobile'];
    const resolvedType = validTypes.includes(merchant_type) ? merchant_type : 'gateway';

    // Validate language against NMI accepted values
    const validLanguages = ['en_US', 'es_ES', 'es_CR', 'es_PA', 'fr_CA'];
    const resolvedLanguage = validLanguages.includes(language) ? language : 'en_US';

    // Resolve banking fields (prefer new fields, fall back to legacy)
    const resolvedAba = check_aba || routing_number || '';
    const resolvedAccount = check_account || account_number || '';

    // Build NMI request payload
    const nmiPayload: Record<string, any> = {
      type: resolvedType,
      company,
      firstName: first_name,
      lastName: last_name,
      email,
      phone,
      address1,
      city,
      state,
      zip,
      country,
      timezone,
      language: resolvedLanguage,
      username,
    };

    // accountInfo is required by NMI v4
    if (resolvedAba && resolvedAccount) {
      nmiPayload.accountInfo = {
        checkAba: resolvedAba,
        checkAccount: resolvedAccount,
        accountHolderType: account_holder_type,
        accountType: account_type,
      };
    }

    if (address2) nmiPayload.address2 = address2;
    if (websiteUrl) nmiPayload.url = websiteUrl;
    if (dba_name) nmiPayload.externalIdentifier = dba_name;

    console.log('Submitting merchant boarding to NMI:', { company, username, merchant_type });

    // Submit to NMI
    const nmiResponse = await fetch(NMI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': NMI_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(nmiPayload),
    });

    const nmiData = await nmiResponse.json();
    const nmiSuccess = nmiResponse.ok;
    const gatewayId = nmiData?.gatewayId || nmiData?.gateway_id || nmiData?.id || null;

    console.log('NMI response:', { status: nmiResponse.status, gatewayId, success: nmiSuccess });

    // Store last 4 digits only for banking
    const routingLast4 = routing_number ? routing_number.slice(-4) : null;
    const accountLast4 = account_number ? account_number.slice(-4) : null;

    // Save or update submission record
    const submissionData = {
      opportunity_id: opportunity_id || null,
      account_id: account_id || null,
      submitted_by: userId,
      submitted_by_email: userEmail,
      nmi_gateway_id: gatewayId,
      nmi_status: nmiSuccess ? 'submitted' : 'failed',
      nmi_response: nmiData,
      error_message: nmiSuccess ? null : (nmiData?.message || nmiData?.error || `HTTP ${nmiResponse.status}`),
      merchant_type,
      company_name: company,
      dba_name: dba_name || null,
      first_name,
      last_name,
      email,
      phone,
      address1,
      address2: address2 || null,
      city,
      state,
      zip,
      country,
      website_url: websiteUrl || null,
      timezone,
      language,
      username,
      bank_name: bank_name || null,
      routing_number_last4: routingLast4,
      account_number_last4: accountLast4,
      account_type,
    };

    let savedSubmission;
    if (submission_id) {
      const { data, error } = await supabaseAdmin
        .from('nmi_boarding_submissions')
        .update({ ...submissionData, updated_at: new Date().toISOString() })
        .eq('id', submission_id)
        .select()
        .single();
      if (error) throw error;
      savedSubmission = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from('nmi_boarding_submissions')
        .insert(submissionData)
        .select()
        .single();
      if (error) throw error;
      savedSubmission = data;
    }

    // Portal writeback — if this boarding is linked to a portal merchant, push gateway ID back
    if (nmiSuccess && gatewayId && account_id) {
      try {
        const portalUrl = Deno.env.get("PORTAL_SUPABASE_URL");
        const portalKey = Deno.env.get("PORTAL_SERVICE_ROLE_KEY");
        if (portalUrl && portalKey) {
          const { data: opp } = await supabaseAdmin
            .from("opportunities")
            .select("portal_merchant_id")
            .eq("account_id", account_id)
            .not("portal_merchant_id", "is", null)
            .maybeSingle();

          if (opp?.portal_merchant_id) {
            const { createClient: createPortalClient } = await import("https://esm.sh/@supabase/supabase-js@2");
            const portalSupabase = createPortalClient(portalUrl, portalKey);
            await portalSupabase
              .from("merchants")
              .update({
                nmi_gateway_id: gatewayId,
                mid: `MH-${gatewayId}`,
              })
              .eq("id", opp.portal_merchant_id);
            console.log(`Portal writeback: gateway ${gatewayId} → merchant ${opp.portal_merchant_id}`);
          }
        }
      } catch (portalErr) {
        console.warn("Portal writeback failed (non-blocking):", portalErr);
      }
    }

    return new Response(JSON.stringify({
      success: nmiSuccess,
      gateway_id: gatewayId,
      submission_id: savedSubmission?.id,
      nmi_response: nmiData,
      error: nmiSuccess ? null : (nmiData?.message || nmiData?.error || `HTTP ${nmiResponse.status}`),
    }), {
      status: nmiSuccess ? 200 : 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('NMI boarding error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
