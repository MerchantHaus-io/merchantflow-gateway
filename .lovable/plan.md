
## Root causes confirmed

**1. "Claimed as admin, assigned to Jamie"**
Jamie's roster entry lists `admin@merchanthaus.io` as an alias — in both `src/config/team.ts` (line 47) **and** the `team_roster` DB row. So `getTeamMemberFromEmail("admin@merchanthaus.io")` matches Jamie *before* Darryn's real entry, and the claim writes `assigned_to_name: "Jamie"`.

**2. `sales@merchanthaus.io` still wired in**
Profile row still exists, plus references in: `ai-assistant`, `send-quote-email`, `send-qualified-docs-request`, `accept-quote`, `send-contact-form-email`, `send-application-declined`, `send-account-closed`, `google-gmail-sync`, `Integrations.tsx`, `Contact.tsx`.

**3. Profile save**
Schema (`full_name`, `phone`) and RLS (`UPDATE ... USING auth.uid() = id`) are both correct, so the most likely failure is the toast firing on a silent error path. Plan adds proper diagnostics and a re-fetch after save to confirm persistence.

---

## Changes

### A. Fix the alias bug (one-line root fix)
- **`src/config/team.ts`** — remove `"admin@merchanthaus.io"` from Jamie's `aliases`.
- **Migration** — `UPDATE public.team_roster SET aliases = '{}' WHERE id = 'jamie';`

After this, `admin@merchanthaus.io` resolves to **Darryn** everywhere (claim, comments, system notes, calendar columns, opportunity assignment).

### B. Harden every claim/assign site to use canonical resolver
Replace the `teamMemberName || user.email || "Agent"` fallback with `resolveDisplayName(user.email) ?? teamMemberName ?? user.email` so a stale `teamMemberName` from context can never overwrite an authoritative roster lookup.

- `src/pages/SupportTicketDetail.tsx` — `claim()` and `authorName`
- `src/pages/SupportTriage.tsx` — `handleClaim()`

### C. Deregister `sales@merchanthaus.io`
- **Migration**
  - Delete `profiles` row for `sales@merchanthaus.io`
  - Delete `user_roles` rows, `team_roster` row if any, and the `auth.users` row
  - (Tasks/opps were already reassigned in the prior cleanup)
- **Edge functions** — swap outbound `from` / `reply_to` / cc lists from `sales@merchanthaus.io` to `support@merchanthaus.io`:
  - `send-quote-email`, `accept-quote`, `send-qualified-docs-request`, `send-contact-form-email`, `send-application-declined`, `send-account-closed`
- **`ai-assistant/index.ts`** — drop the Wesley/sales entry and the "shared mailbox" line.
- **`google-gmail-sync/index.ts`** — remove `sales@merchanthaus.io` from the synced mailbox list.
- **`src/pages/Integrations.tsx`** — remove the Sales mailbox connection card + related status logic.
- **`src/pages/Contact.tsx`** — public contact address changes from `sales@` to `support@`.

### D. Profile save repair
- **`src/pages/Settings.tsx#handleSaveProfile`**
  - Trim inputs; reject empty `full_name`.
  - Use `.select().single()` after `.update()` so RLS failures surface as a real error instead of a silent success.
  - Re-hydrate local state from the returned row and bust `teamMemberName` cache by emitting an auth context refresh.
  - On error, show `error.message` in the toast (not just "Failed to save profile") so we can see what's actually failing for the user next time.
- Verify after deploy by saving the admin profile and confirming the row updates in DB.

---

## Verification

1. Sign in as `admin@merchanthaus.io`, open any unassigned support ticket, claim it → expect `assigned_to_name = "Darryn"`.
2. Trigger any outbound email (quote, declined, etc.) → `From:` header reads `support@merchanthaus.io`.
3. Edit name/phone in Settings → toast confirms, row persists across reload, header shows new name.
4. `SELECT * FROM profiles WHERE email = 'sales@merchanthaus.io'` returns 0 rows.

No UI redesign, no business-logic changes outside the above.
