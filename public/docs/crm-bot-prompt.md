# MERCHANT HAUS — CRM BOT PROMPT
# Milestone-Based Portal Merchant Intake
# Lovable Project: d4e766df · Supabase Ref: cuqjaddtmkotgvfsgcol
# clients.merchant.haus

---

## OBJECTIVE

Implement the milestone-based merchant intake system for portal merchants.
The Client Portal (portal.merchanthaus.io, Supabase ref: csusakykwlxixwiimrld)
fires webhooks at lifecycle milestones. This CRM receives and acts on
Milestones 1, 2, 3, and 6. Milestones 4 and 5 are internal team actions
using existing CRM tools.

---

## CRITICAL RULES

- **All existing flows are unchanged.** Public `/merchant-apply` submissions
  continue through `submit-merchant-application` → `applications` table →
  `notify_on_new_web_submission()` → `/admin/web-submissions` exactly as
  today. Portal submissions are additive only.
- **Portal submissions are identified** by `source: 'merchant_portal'` in
  the payload and on the `applications` row.
- **No SSN is ever received or stored** from the portal. The team handles
  SSN manually as a document during their manual submission process.
- **The two Supabase instances are completely separate.** This CRM
  (cuqjaddtmkotgvfsgcol) and the portal (csusakykwlxixwiimrld) share no
  database. All cross-project writes use `PORTAL_SUPABASE_URL` +
  `PORTAL_SERVICE_ROLE_KEY` vault secrets.

---

## SCHEMA ADDITIONS

Run these before any other changes:

```sql
-- applications table
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS portal_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web_form';

-- opportunities table
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS portal_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web_form';

-- Index for fast lookup by portal_merchant_id
CREATE INDEX IF NOT EXISTS idx_applications_portal_merchant_id
  ON applications(portal_merchant_id);

CREATE INDEX IF NOT EXISTS idx_opportunities_portal_merchant_id
  ON opportunities(portal_merchant_id);
```

---

## NEW VAULT SECRETS REQUIRED

Add to Supabase Dashboard → Settings → Edge Function Secrets:

```
PORTAL_WEBHOOK_SECRET    = <shared secret — must match portal project>
PORTAL_SUPABASE_URL      = https://csusakykwlxixwiimrld.supabase.co
PORTAL_SERVICE_ROLE_KEY  = <service role key for portal Supabase project>
```

---

## INFRASTRUCTURE — receive-portal-milestone

Create `supabase/functions/receive-portal-milestone/index.ts`

This is the single inbound receiver for all portal milestone webhooks.
Its URL becomes `OPS_TERMINAL_WEBHOOK_URL` in the portal project.

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  // Validate shared secret
  const secret = req.headers.get('x-portal-secret')
  if (secret !== Deno.env.get('PORTAL_WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  switch (payload.event) {
    case 'merchant_registered':   return handleRegistered(payload, supabase)
    case 'application_submitted': return handleSubmitted(payload, supabase)
    case 'documents_complete':    return handleDocsComplete(payload, supabase)
    default:
      return new Response(
        JSON.stringify({ ok: false, error: 'Unknown event' }),
        { status: 400 }
      )
  }
})
```

---

## MILESTONE 1 — merchant_registered

**What happens:**
- A lightweight notification row is created so the team knows a new portal
  lead has registered
- **Do NOT insert into `applications` table at this milestone** — the
  `notify_on_new_web_submission()` trigger fires on every `applications`
  INSERT and would notify the team of an incomplete registration. The full
  `applications` INSERT happens at Milestone 2 only.
- Insert a notification for the team:

```typescript
async function handleRegistered(payload, supabase) {
  await supabase.from('notifications').insert({
    title: 'New Portal Lead',
    message: `${payload.contact_first} ${payload.contact_last} from
              ${payload.business_name} has registered on the merchant portal.`,
    type: 'portal_lead',
    link: '/admin/web-submissions'
  })
  // user_id: leave null or assign to system user — team sees it in
  // notification center, no assignment needed at this stage

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
```

---

## MILESTONE 2 — application_submitted

**What happens:**
1. Upsert `applications` row (match on `portal_merchant_id` to handle retries)
2. Upsert `principals` rows
3. Insert `application_documents` rows
4. Find or create `accounts` + `contacts`
5. Create `opportunities` row
6. `notify_on_new_web_submission()` trigger fires automatically on
   `applications` INSERT — team is notified and submission appears in
   `/admin/web-submissions`

```typescript
async function handleSubmitted(payload, supabase) {

  // ── 1. UPSERT APPLICATIONS ROW ──────────────────────────────────
  // Check for existing row first to handle webhook retries (idempotency)
  const { data: existing } = await supabase
    .from('applications')
    .select('id')
    .eq('portal_merchant_id', payload.portal_merchant_id)
    .maybeSingle()

  let applicationId = existing?.id

  if (!applicationId) {
    const { data: newApp } = await supabase
      .from('applications')
      .insert({
        source:              'merchant_portal',
        portal_merchant_id:  payload.portal_merchant_id,
        full_name:           `${payload.contact_first} ${payload.contact_last}`,
        email:               payload.contact_email,
        phone:               payload.contact_phone,
        company_name:        payload.business_name,
        dba_name:            payload.trading_name,
        service_type:        payload.service_type,
        status:              'submitted',
        underwriting_status: 'pending',
        monthly_volume:      payload.monthly_volume_range,
        business_structure:  payload.business_type,
        federal_tax_id:      payload.tax_id_masked
        // notify_on_new_web_submission() trigger fires here automatically
      })
      .select('id')
      .single()

    applicationId = newApp.id
  } else {
    // Update existing row with full payload
    await supabase
      .from('applications')
      .update({
        full_name:           `${payload.contact_first} ${payload.contact_last}`,
        email:               payload.contact_email,
        phone:               payload.contact_phone,
        company_name:        payload.business_name,
        dba_name:            payload.trading_name,
        service_type:        payload.service_type,
        status:              'submitted',
        underwriting_status: 'pending',
        monthly_volume:      payload.monthly_volume_range,
        business_structure:  payload.business_type,
        federal_tax_id:      payload.tax_id_masked
      })
      .eq('id', applicationId)
  }


  // ── 2. UPSERT PRINCIPALS ─────────────────────────────────────────
  // CRM principals table uses full_name (single field) and
  // ownership_percentage (not ownership_pct)
  // Address comes as a single string from portal — store in address_line1
  for (const p of payload.principals || []) {
    await supabase.from('principals').upsert({
      application_id:       applicationId,
      full_name:            `${p.first_name} ${p.last_name}`,
      title:                p.title,
      ownership_percentage: p.ownership_pct,
      dob:                  p.dob,
      address_line1:        p.address   // single string — best we can do
      // ssn_enc: NOT SET — SSN handled manually as document
    }, { onConflict: 'application_id, full_name' })
  }


  // ── 3. INSERT APPLICATION_DOCUMENTS ─────────────────────────────
  // file_path stores the portal's Supabase Storage path
  // file_size and uploaded_at are not columns in application_documents —
  // created_at defaults automatically
  // ip_address and user_agent are nullable — left null for portal docs
  for (const doc of payload.documents || []) {
    const { data: existingDoc } = await supabase
      .from('application_documents')
      .select('id')
      .eq('application_id', applicationId)
      .eq('file_path', doc.storage_path)
      .maybeSingle()

    if (!existingDoc) {
      await supabase.from('application_documents').insert({
        application_id: applicationId,
        file_name:      doc.filename,
        file_path:      doc.storage_path,
        document_type:  doc.doc_type
      })
    }
  }


  // ── 4. FIND OR CREATE ACCOUNT + CONTACT ──────────────────────────
  let accountId, contactId

  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('id')
    .ilike('name', payload.business_name)
    .maybeSingle()

  if (existingAccount) {
    accountId = existingAccount.id
  } else {
    const { data: newAccount } = await supabase
      .from('accounts')
      .insert({
        name:    payload.business_name,
        status:  'prospect',
        address1: payload.dba_address_line1,
        city:    payload.dba_city,
        state:   payload.dba_state,
        zip:     payload.dba_zip,
        country: payload.dba_country,
        website: payload.website
      })
      .select('id')
      .single()
    accountId = newAccount.id
  }

  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('email', payload.contact_email)
    .maybeSingle()

  if (existingContact) {
    contactId = existingContact.id
  } else {
    const { data: newContact } = await supabase
      .from('contacts')
      .insert({
        account_id:  accountId,
        first_name:  payload.contact_first,
        last_name:   payload.contact_last,
        email:       payload.contact_email,
        phone:       payload.contact_phone
      })
      .select('id')
      .single()
    contactId = newContact.id
  }


  // ── 5. CREATE OPPORTUNITY ────────────────────────────────────────
  // Check idempotency — don't create duplicate opportunity
  const { data: existingOpp } = await supabase
    .from('opportunities')
    .select('id')
    .eq('portal_merchant_id', payload.portal_merchant_id)
    .maybeSingle()

  if (!existingOpp) {
    await supabase.from('opportunities').insert({
      portal_merchant_id: payload.portal_merchant_id,
      source:             'merchant_portal',
      account_id:         accountId,
      contact_id:         contactId,
      stage:              'Application Received',
      service_type:       payload.service_type,
      sic_mcc_code:       payload.mcc_code,
      assigned_to:        null   // team assigns manually — triggers notification
    })
  }

  return new Response(JSON.stringify({ ok: true, application_id: applicationId }), { status: 200 })
}
```

---

## MILESTONE 3 — documents_complete

**What happens:**
1. Insert any new documents into `application_documents`
2. Advance opportunity stage
3. Notify assigned team member

```typescript
async function handleDocsComplete(payload, supabase) {

  // Get application and opportunity by portal_merchant_id
  const { data: application } = await supabase
    .from('applications')
    .select('id')
    .eq('portal_merchant_id', payload.portal_merchant_id)
    .single()

  const { data: opportunity } = await supabase
    .from('opportunities')
    .select('id, assigned_to')
    .eq('portal_merchant_id', payload.portal_merchant_id)
    .single()

  // Insert new documents (idempotent — check file_path first)
  for (const doc of payload.documents || []) {
    const { data: existing } = await supabase
      .from('application_documents')
      .select('id')
      .eq('application_id', application.id)
      .eq('file_path', doc.storage_path)
      .maybeSingle()

    if (!existing) {
      await supabase.from('application_documents').insert({
        application_id: application.id,
        file_name:      doc.filename,
        file_path:      doc.storage_path,
        document_type:  doc.doc_type
      })
    }
  }

  // Advance opportunity stage
  await supabase
    .from('opportunities')
    .update({ stage: 'Docs Complete / Ready for Review' })
    .eq('id', opportunity.id)

  // Notify assigned team member (if assigned)
  if (opportunity.assigned_to) {
    await supabase.from('notifications').insert({
      user_id: opportunity.assigned_to,
      title:   'Documents Complete',
      message: `All requested documents have been submitted and are ready for review.`,
      type:    'milestone',
      link:    `/opportunities/${opportunity.id}`
    })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
```

---

## MILESTONE 4 — Gateway Boarded (INTERNAL — NO WEBHOOK)

**Team action:** Use existing `/tools/nmi-boarding` wizard.
Data is already in the CRM from Milestone 2 — pre-fill from the opportunity.

**After successful NMI boarding**, in addition to the existing flow that
writes `nmi_gateway_id` to `accounts.nmi_merchant_id`, also write back to
the portal's `merchants` table:

```typescript
// Add this to nmi-board-merchant edge function after successful boarding
const portalSupabase = createClient(
  Deno.env.get('PORTAL_SUPABASE_URL')!,
  Deno.env.get('PORTAL_SERVICE_ROLE_KEY')!
)

// Get portal_merchant_id from the opportunity linked to this boarding
const { data: opportunity } = await supabase
  .from('opportunities')
  .select('portal_merchant_id')
  .eq('account_id', accountId)
  .not('portal_merchant_id', 'is', null)
  .maybeSingle()

if (opportunity?.portal_merchant_id) {
  await portalSupabase
    .from('merchants')
    .update({
      nmi_gateway_id: gatewayId,
      mid:            `MH-${gatewayId}`
    })
    .eq('id', opportunity.portal_merchant_id)
}
```

Advance opportunity stage to `'Gateway Boarded'`.

---

## MILESTONE 5 — Processing Submitted (INTERNAL — NO WEBHOOK)

**Team action:** Manual processor submission using their tools.

**On confirmation**, advance stage to `'Processing Submitted'` and execute
the compliance document shred:

Add a "Submit for Processing" button to the opportunity detail page
(`OpportunityDetail.tsx`) that:

1. Shows a confirmation dialog:
   *"This will permanently delete all uploaded documents for this merchant
   from secure storage. This action cannot be undone. Confirm?"*

2. On confirm, calls a new edge function `shred-portal-documents`:

```typescript
// supabase/functions/shred-portal-documents/index.ts
// Called from OpportunityDetail.tsx — requires authenticated CRM user

serve(async (req) => {
  const { portal_merchant_id, application_id } = await req.json()

  const portalSupabase = createClient(
    Deno.env.get('PORTAL_SUPABASE_URL')!,
    Deno.env.get('PORTAL_SERVICE_ROLE_KEY')!
  )

  // Get all non-shredded document paths from portal
  const { data: docs } = await portalSupabase
    .from('merchant_documents')
    .select('storage_path')
    .eq('merchant_id', portal_merchant_id)
    .neq('status', 'shredded')
    .not('storage_path', 'is', null)

  const paths = docs?.map(d => d.storage_path).filter(Boolean) || []

  if (paths.length > 0) {
    // Delete files from portal storage
    await portalSupabase.storage
      .from('merchant-documents')
      .remove(paths)
  }

  // Update portal merchant_documents rows — keep metadata, null the path
  await portalSupabase
    .from('merchant_documents')
    .update({
      status:       'shredded',
      storage_path: null,
      reviewed_at:  new Date().toISOString()
    })
    .eq('merchant_id', portal_merchant_id)
    .neq('status', 'shredded')

  return new Response(
    JSON.stringify({ ok: true, shredded: paths.length }),
    { status: 200 }
  )
})
```

3. After shred completes, advance opportunity stage to `'Processing Submitted'`.

---

## MILESTONE 6 — ACTIVATION

**Team action:** "Activate Merchant" button on the opportunity detail page
or pipeline card.

**This is the only direct cross-project database write in the system.**

Build a new edge function `activate-portal-merchant`:

```typescript
// supabase/functions/activate-portal-merchant/index.ts
// Requires authenticated CRM user — verify JWT

serve(async (req) => {

  // Verify caller is authenticated CRM user
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Verify against CRM Supabase auth
  const crmSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )
  const { data: { user }, error } = await crmSupabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (error || !user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const {
    portal_merchant_id,
    nmi_api_key,
    nmi_public_key,
    pricing_model
  } = await req.json()

  const portalSupabase = createClient(
    Deno.env.get('PORTAL_SUPABASE_URL')!,
    Deno.env.get('PORTAL_SERVICE_ROLE_KEY')!
  )

  await portalSupabase
    .from('merchants')
    .update({
      account_status: 'active',
      activated_at:   new Date().toISOString(),
      nmi_api_key,
      nmi_public_key,
      pricing_model
    })
    .eq('id', portal_merchant_id)

  // Portal real-time subscription picks this up instantly —
  // merchant sees full unlock without page refresh

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
```

**The "Activate Merchant" UI** must require the team to enter before firing:
- NMI API Key (from NMI control panel — Security Keys section)
- NMI Public Key (from NMI control panel — Security Keys section)
- Pricing Model (flat_rate / interchange_plus)

After activation, advance opportunity stage to `'Won / Live'`.

---

## DOCUMENT ACCESS (generate-portal-doc-url)

Portal merchant documents are stored in the portal's Supabase Storage bucket
(`merchant-documents` on ref `csusakykwlxixwiimrld`). The CRM team needs to
download them from the pipeline and opportunity detail views.

Build edge function `generate-portal-doc-url`:

```typescript
// Accepts { storage_path }
// Returns { signed_url } — 1 hour expiry
// Called on-click — never cached

serve(async (req) => {
  const { storage_path } = await req.json()

  const portalSupabase = createClient(
    Deno.env.get('PORTAL_SUPABASE_URL')!,
    Deno.env.get('PORTAL_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await portalSupabase
    .storage
    .from('merchant-documents')
    .createSignedUrl(storage_path, 3600)

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Could not generate URL' }),
      { status: 500 }
    )
  }

  return new Response(
    JSON.stringify({ signed_url: data.signedUrl }),
    { status: 200 }
  )
})
```

Wire to a "Download" button on `application_documents` rows in
`OpportunityDetail.tsx` — but only where `source = 'merchant_portal'`.
Existing documents (from `/merchant-apply`) use the existing
`opportunity-documents` bucket and are unaffected.

---

## /admin/web-submissions DISPLAY UPDATE

Update `WebSubmissions.tsx`:

- Add a `source` badge on each submission row:
  - `'merchant_portal'` → gold badge labelled "Portal"
  - `'web_form'` or null → neutral badge labelled "Web Form"
- Add filter toggle: All / Web Form / Portal
- For Portal submissions, show milestone progress indicator:
  ```
  Registered → Submitted → Docs Complete → Gateway → Processing → Active
  ```
  Derive from `applications.status` + linked `opportunities.stage`
- Everything else — table structure, sorting, detail view — unchanged

---

## WHAT DOES NOT CHANGE

- `/merchant-apply` form and `MerchantApply.tsx` — unchanged
- `submit-merchant-application` edge function — unchanged
- `applications` table existing flow — unchanged
- `notify_on_new_web_submission()` trigger — unchanged
- Pipeline board, preboarding wizard, NMI boarding wizard — unchanged
- All existing edge functions, triggers, and notifications — unchanged
- No SSN is received, stored, or transmitted programmatically at any point
