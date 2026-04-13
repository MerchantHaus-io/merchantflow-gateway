import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Validate shared secret
  const secret = req.headers.get("x-portal-secret");
  if (secret !== Deno.env.get("PORTAL_WEBHOOK_SECRET")) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log(`Portal milestone received: ${payload.event}`, JSON.stringify(payload).substring(0, 500));

    switch (payload.event) {
      case "merchant_registered":
        return await handleRegistered(payload, supabase);
      case "application_progress":
        return await handleProgress(payload, supabase);
      case "application_submitted":
        return await handleSubmitted(payload, supabase);
      case "documents_complete":
        return await handleDocsComplete(payload, supabase);
      default:
        return json({ ok: false, error: "Unknown event" }, 400);
    }
  } catch (err) {
    console.error("Portal milestone error:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});

// ── MILESTONE 1 — merchant_registered ──
async function handleRegistered(payload: any, supabase: any) {
  // 1. Create minimal applications row so it appears in Web Submissions immediately
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("portal_merchant_id", payload.portal_merchant_id)
    .maybeSingle();

  if (!existing) {
    const fullName = payload.contact_first && payload.contact_last
      ? `${payload.contact_first} ${payload.contact_last}`
      : payload.business_name || "Portal Merchant";

    await supabase.from("applications").insert({
      status: "registered",
      source: "merchant_portal",
      portal_merchant_id: payload.portal_merchant_id,
      full_name: fullName,
      email: payload.contact_email || `portal-${payload.portal_merchant_id}@pending`,
      phone: payload.contact_phone || null,
      company_name: payload.business_name || null,
      service_type: payload.service_type || "processing",
      raw_portal_data: payload,
    });
    // NOTE: The INSERT triggers notify_on_new_web_submission automatically,
    // so we no longer need to manually create notification rows.
  } else {
    // Row already exists (e.g. from a prior progress event) — send manual notifications
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .not("email", "is", null);

    for (const p of profiles || []) {
      await supabase.from("notifications").insert({
        user_id: p.id,
        user_email: p.email,
        title: "New Portal Lead",
        message: `${payload.contact_first} ${payload.contact_last} from ${payload.business_name} has registered on the merchant portal.`,
        type: "portal_lead",
        link: "/web-submissions",
      });
    }
  }

  return json({ ok: true });
}

// ── PROGRESSIVE SYNC — application_progress ──
async function handleProgress(payload: any, supabase: any) {
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("portal_merchant_id", payload.portal_merchant_id)
    .maybeSingle();

  const firstPrincipal = (payload.principals || [])[0] || {};

  // Build update data from whatever fields are present — only set non-undefined
  const appData: Record<string, unknown> = {
    source: "merchant_portal",
    portal_merchant_id: payload.portal_merchant_id,
    raw_portal_data: payload,
  };

  // Contact
  if (payload.contact_first && payload.contact_last) {
    appData.full_name = `${payload.contact_first} ${payload.contact_last}`;
  }
  if (payload.contact_email) appData.email = payload.contact_email;
  if (payload.contact_phone) appData.phone = payload.contact_phone;

  // Business profile
  if (payload.business_name) appData.company_name = payload.business_name;
  if (payload.trading_name) appData.dba_name = payload.trading_name;
  if (payload.service_type) appData.service_type = payload.service_type;
  if (payload.monthly_volume_range) appData.monthly_volume = payload.monthly_volume_range;
  if (payload.business_type) appData.business_structure = payload.business_type;
  if (payload.tax_id_masked) appData.federal_tax_id = payload.tax_id_masked;
  if (payload.current_processor) appData.current_processor = payload.current_processor;
  if (payload.website) appData.website = payload.website;
  if (payload.business_description) appData.nature_of_business = payload.business_description;
  if (payload.avg_txn_range) appData.avg_ticket = payload.avg_txn_range;
  if (payload.high_ticket) appData.high_ticket = payload.high_ticket;
  if (payload.product_description) appData.products = payload.product_description;

  // Legal
  if (payload.legal_entity_name) appData.legal_name = payload.legal_entity_name;
  if (payload.state_incorporated) appData.state_of_incorporation = payload.state_incorporated;
  if (payload.business_formation_date) appData.date_established = payload.business_formation_date;

  // DBA address
  if (payload.dba_address_line1) appData.address = payload.dba_address_line1;
  if (payload.dba_address_line2) appData.address2 = payload.dba_address_line2;
  if (payload.dba_city) appData.city = payload.dba_city;
  if (payload.dba_state) appData.state = payload.dba_state;
  if (payload.dba_zip) appData.zip = payload.dba_zip;

  // Processing profile
  if (payload.swiped_pct) appData.in_person_percent = payload.swiped_pct;
  if (payload.keyed_pct) appData.keyed_percent = payload.keyed_pct;
  if (payload.ecommerce_pct) appData.ecommerce_percent = payload.ecommerce_pct;

  // Owner from first principal
  if (firstPrincipal.first_name) {
    appData.owner_name = `${firstPrincipal.first_name} ${firstPrincipal.last_name}`;
    if (firstPrincipal.title) appData.owner_title = firstPrincipal.title;
    if (firstPrincipal.dob) appData.owner_dob = firstPrincipal.dob;
    if (firstPrincipal.id_number_masked) appData.owner_ssn_last4 = firstPrincipal.id_number_masked;
    if (firstPrincipal.address) appData.owner_address = firstPrincipal.address;
  }

  if (existing) {
    // Update — do NOT change status
    await supabase
      .from("applications")
      .update(appData)
      .eq("id", existing.id);
  } else {
    // Create with 'registered' status so partial apps are visible
    appData.status = "registered";
    appData.underwriting_status = "pending";
    // email is required — use contact_email or a placeholder
    if (!appData.email) appData.email = payload.contact_email || `portal-${payload.portal_merchant_id}@pending`;
    if (!appData.full_name) appData.full_name = payload.contact_first
      ? `${payload.contact_first} ${payload.contact_last}`
      : payload.business_name || "Portal Merchant";

    await supabase.from("applications").insert(appData);
  }

  return json({ ok: true });
}

// ── MILESTONE 2 — application_submitted ──
async function handleSubmitted(payload: any, supabase: any) {
  // 1. Upsert applications row (idempotent on portal_merchant_id)
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("portal_merchant_id", payload.portal_merchant_id)
    .maybeSingle();

  let applicationId = existing?.id;

  const firstPrincipal = (payload.principals || [])[0] || {};

  const appData = {
    source: "merchant_portal",
    portal_merchant_id: payload.portal_merchant_id,
    status: "submitted",
    underwriting_status: "pending",

    // Contact
    full_name: `${payload.contact_first} ${payload.contact_last}`,
    email: payload.contact_email,
    phone: payload.contact_phone,

    // Business profile
    company_name: payload.business_name,
    dba_name: payload.trading_name,
    service_type: payload.service_type,
    monthly_volume: payload.monthly_volume_range,
    business_structure: payload.business_type,
    federal_tax_id: payload.tax_id_masked,
    current_processor: payload.current_processor || null,
    website: payload.website || null,
    nature_of_business: payload.business_description || null,
    avg_ticket: payload.avg_txn_range || null,
    high_ticket: payload.high_ticket || null,
    products: payload.product_description || null,

    // Legal
    legal_name: payload.legal_entity_name || null,
    state_of_incorporation: payload.state_incorporated || null,
    date_established: payload.business_formation_date || null,

    // DBA address → primary address
    address: payload.dba_address_line1 || null,
    address2: payload.dba_address_line2 || null,
    city: payload.dba_city || null,
    state: payload.dba_state || null,
    zip: payload.dba_zip || null,

    // Processing profile
    in_person_percent: payload.swiped_pct || null,
    keyed_percent: payload.keyed_pct || null,
    ecommerce_percent: payload.ecommerce_pct || null,

    // Owner from first principal
    owner_name: firstPrincipal.first_name
      ? `${firstPrincipal.first_name} ${firstPrincipal.last_name}`
      : null,
    owner_title: firstPrincipal.title || null,
    owner_dob: firstPrincipal.dob || null,
    owner_ssn_last4: firstPrincipal.id_number_masked || null,
    owner_address: firstPrincipal.address || null,

    // Submission timestamp
    submitted_at: payload.submitted_at || new Date().toISOString(),

    // Full unabridged payload — never lose data
    raw_portal_data: payload,
  };

  if (!applicationId) {
    // INSERT triggers notify_on_new_web_submission automatically
    const { data: newApp, error } = await supabase
      .from("applications")
      .insert(appData)
      .select("id")
      .single();
    if (error) throw error;
    applicationId = newApp.id;
  } else {
    await supabase
      .from("applications")
      .update(appData)
      .eq("id", applicationId);
  }

  // 2. Insert application_documents (idempotent on file_path)
  for (const doc of payload.documents || []) {
    const { data: existingDoc } = await supabase
      .from("application_documents")
      .select("id")
      .eq("application_id", applicationId)
      .eq("file_path", doc.storage_path)
      .maybeSingle();

    if (!existingDoc) {
      await supabase.from("application_documents").insert({
        application_id: applicationId,
        file_name: doc.filename,
        file_path: doc.storage_path,
        document_type: doc.doc_type,
      });
    }
  }

  // 3. Find or create account + contact
  let accountId: string;
  let contactId: string;

  const { data: existingAccount } = await supabase
    .from("accounts")
    .select("id")
    .ilike("name", payload.business_name)
    .maybeSingle();

  if (existingAccount) {
    accountId = existingAccount.id;
  } else {
    const { data: newAccount, error } = await supabase
      .from("accounts")
      .insert({
        name: payload.business_name,
        status: "prospect",
        address1: payload.dba_address_line1,
        city: payload.dba_city,
        state: payload.dba_state,
        zip: payload.dba_zip,
        country: payload.dba_country,
        website: payload.website,
      })
      .select("id")
      .single();
    if (error) throw error;
    accountId = newAccount.id;
  }

  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id")
    .eq("email", payload.contact_email)
    .maybeSingle();

  if (existingContact) {
    contactId = existingContact.id;
  } else {
    const { data: newContact, error } = await supabase
      .from("contacts")
      .insert({
        account_id: accountId,
        first_name: payload.contact_first,
        last_name: payload.contact_last,
        email: payload.contact_email,
        phone: payload.contact_phone,
      })
      .select("id")
      .single();
    if (error) throw error;
    contactId = newContact.id;
  }

  // 4. Create opportunity (idempotent on portal_merchant_id)
  const { data: existingOpp } = await supabase
    .from("opportunities")
    .select("id")
    .eq("portal_merchant_id", payload.portal_merchant_id)
    .maybeSingle();

  let opportunityId: string | null = existingOpp?.id || null;

  if (!existingOpp) {
    const { data: newOpp } = await supabase
      .from("opportunities")
      .insert({
        portal_merchant_id: payload.portal_merchant_id,
        source: "merchant_portal",
        account_id: accountId,
        contact_id: contactId,
        stage: "Application Received",
        service_type: payload.service_type,
        sic_mcc_code: payload.mcc_code,
        assigned_to: null,
      })
      .select("id")
      .single();
    opportunityId = newOpp?.id || null;
  }

  // 5. Insert beneficial owners from principals (idempotent on name + opportunity)
  if (opportunityId && payload.principals?.length) {
    for (const p of payload.principals) {
      const fullName = `${p.first_name} ${p.last_name}`;
      const { data: existingOwner } = await supabase
        .from("beneficial_owners")
        .select("id")
        .eq("opportunity_id", opportunityId)
        .eq("full_name", fullName)
        .maybeSingle();

      if (!existingOwner) {
        await supabase.from("beneficial_owners").insert({
          opportunity_id: opportunityId,
          full_name: fullName,
          title: p.title || null,
          ownership_percentage: p.ownership_pct || 0,
          date_of_birth: p.dob || null,
          address_line1: p.address || null,
        });
      }
    }
  }

  return json({ ok: true, application_id: applicationId });
}

// ── MILESTONE 3 — documents_complete ──
async function handleDocsComplete(payload: any, supabase: any) {
  const { data: application, error: appErr } = await supabase
    .from("applications")
    .select("id")
    .eq("portal_merchant_id", payload.portal_merchant_id)
    .single();

  if (appErr || !application) {
    return json({ ok: false, error: "Application not found" }, 404);
  }

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, assigned_to")
    .eq("portal_merchant_id", payload.portal_merchant_id)
    .single();

  // Insert new documents (idempotent)
  for (const doc of payload.documents || []) {
    const { data: existingDoc } = await supabase
      .from("application_documents")
      .select("id")
      .eq("application_id", application.id)
      .eq("file_path", doc.storage_path)
      .maybeSingle();

    if (!existingDoc) {
      await supabase.from("application_documents").insert({
        application_id: application.id,
        file_name: doc.filename,
        file_path: doc.storage_path,
        document_type: doc.doc_type,
      });
    }
  }

  // Advance opportunity stage
  if (opportunity) {
    await supabase
      .from("opportunities")
      .update({ stage: "Docs Complete / Ready for Review" })
      .eq("id", opportunity.id);

    // Notify assigned team member
    if (opportunity.assigned_to) {
      const { data: assignedProfile } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("email", opportunity.assigned_to)
        .maybeSingle();

      if (assignedProfile) {
        await supabase.from("notifications").insert({
          user_id: assignedProfile.id,
          user_email: assignedProfile.email,
          title: "Documents Complete",
          message: "All requested documents have been submitted and are ready for review.",
          type: "milestone",
          link: `/opportunities/${opportunity.id}`,
        });
      }
    }
  }

  return json({ ok: true });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
