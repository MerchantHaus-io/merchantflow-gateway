

## Make Portal Data Fully Actionable in Web Submissions

### Problem
1. **`merchant_registered` doesn't create an `applications` row** — only sends notifications, so new portal sign-ups don't appear in Web Submissions until `application_progress` fires
2. **Action buttons (Convert/Reject) only work for `status === "pending"`** — portal entries use `"registered"` or `"submitted"`, so they're visible but not actionable
3. **Detail modal actions also gated on `status === "pending"`** — same issue in the slide-out detail view
4. **Missing fields from portal payload** — the `handleRegistered` handler doesn't map `service_type`, and the `handleProgress` handler is missing several portal-specific fields (e.g. `moto_pct`, `b2b_pct`, `b2c_pct`, `cnp_pct`, `pricing_model`, `bank_name`, `account_holder_name`, legal address fields)
5. **Portal documents** referenced by `storage_path` point to the ClientTerminal's storage bucket — the `ApplicationDocsBadge` looks in the CRM's `opportunity-documents` bucket, so portal docs won't show via storage listing (they're in `application_documents` table rows instead)

### Changes

#### 1. Edge Function: `receive-portal-milestone/index.ts`

**`handleRegistered`** — After sending notifications, insert a minimal `applications` row:
- `status: 'registered'`, `source: 'merchant_portal'`
- `portal_merchant_id`, `full_name`, `email`, `company_name`, `service_type`
- Guard with a check that no row with this `portal_merchant_id` already exists
- This triggers `notify_on_new_web_submission` which is fine — it's a real new submission

**`handleProgress`** — Add missing field mappings from the portal payload:
- `moto_pct` → store in `raw_portal_data` (no column exists; already captured)
- `pricing_model`, `bank_name`, `account_holder_name` — store in `raw_portal_data`
- Legal address fields: `legal_address_line1` → could map to existing columns if we add them, or rely on `raw_portal_data`

#### 2. Web Submissions UI: `src/pages/WebSubmissions.tsx`

**Status badges** — Add cases in `getStatusBadge`:
- `"registered"` → Blue badge "Registered"
- `"submitted"` → Amber badge "Submitted"

**Action buttons (table rows, lines ~761 and ~807)** — Change:
```
app.status === "pending"
```
to:
```
["pending", "registered", "submitted"].includes(app.status ?? "")
```

**Detail modal actions (line ~995)** — Same change:
```
selectedApp.status === "pending"
```
to:
```
["pending", "registered", "submitted"].includes(selectedApp.status ?? "")
```

**Document display** — Update `ApplicationDocsBadge` and `ApplicationDocsDetail` to also check the `application_documents` table (not just storage listing), since portal documents are recorded there with `file_path` references to the portal's storage:
- Query `application_documents` table for the application ID
- Show count from both sources (storage files + DB records)
- For portal docs, use the `generate-portal-doc-url` edge function to get signed URLs

#### 3. Database Migration (if needed)

No schema changes required — all portal fields either map to existing `applications` columns or are preserved in the `raw_portal_data` JSONB column. The conversion function already reads from `raw_portal_data` fallback fields.

### Files Modified
- `supabase/functions/receive-portal-milestone/index.ts` — Add applications row on registration
- `src/pages/WebSubmissions.tsx` — Unlock actions for registered/submitted statuses, fix doc display for portal entries

### Result
Portal registrations appear immediately in Web Submissions with full Convert to Pipeline / Reject actions, matching the same workflow as web form submissions. Service type (gateway vs processing) is preserved from registration through to pipeline conversion.

