# Merge the referral list into Affiliates

Today there are two separate lists that mean the same thing to people but behave differently:

- **Referral list** — 5 names (Dan K, Gayle Edmond, Jason Gibson, Josue Sanchez, Urle Johnson), managed on the Administration page, pickable when logging a new lead or converting a web submission. No login, no commission, no payouts. Currently no deal is tagged with any of them.
- **Affiliates** — 4 partners on Admin -> Affiliates, each with a portal login, 50% revenue share, monthly amount per account and clawback window.

We will keep **Affiliates** as the single list.

## What changes for you

- The "who referred this?" picker on the new-lead dialog and on web-submission conversion will list **Affiliates** instead of the old referral names.
- The old referral-list editor disappears from Administration; everything is managed in one place, Admin -> Affiliates.
- The Affiliates screen gains an "Inactive" state that is already there today (the Active switch), so a name can exist purely for attribution with no login and no payouts.
- The 5 existing names are carried over as **inactive** affiliates so nothing in the history is lost. They will show no commission terms and generate no payouts until you switch one to Active and give it a login.
- Affiliate rows created this way have no email login attached; the Affiliates screen will make that visible with a small "attribution only" marker and no Login button.

## Technical notes

Done in two separate sessions, database first, then screens.

**Session 1 — database**
- Add nullable `attribution_only` flag and make `email` tolerant of attribution-only rows on `public.referrers` (unique index becomes partial, ignoring null/placeholder emails).
- Add `opportunities.referrer_id` / `scoping_submissions.referrer_id`-style linkage where the old `lead_referrer_id` was used, keeping the old column in place (unused, 0 rows) so nothing breaks mid-flight.
- Data step: insert the 5 `lead_referrers` rows into `referrers` with `active=false`, `attribution_only=true`, `commission_rate=0`, `monthly_cap_per_merchant=0`, carrying `institution` into `notes`.
- `lead_referrers` is left in place, read by nothing, to be dropped in a later cleanup.

**Session 2 — app**
- `src/components/LeadReferrerSelect.tsx`: query `referrers` (all rows, active and inactive) instead of `lead_referrers`; label as `full_name — notes/institution`.
- `src/components/NewLeadDialog.tsx` and `src/pages/WebSubmissions.tsx`: write the selected id to the new referrer linkage column.
- `src/pages/Administration.tsx`: remove `LeadReferrerManager`; add a link through to Admin -> Affiliates. Delete `src/components/admin/LeadReferrerManager.tsx`.
- `src/pages/Referrers.tsx`: show an "Attribution only" badge, hide the Login action and grey the commission inputs for those rows; add a way to promote one to a full affiliate (issues the login through the existing create flow).
- Checks after each session: `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`, `npx vitest run`, `npm run build`.
