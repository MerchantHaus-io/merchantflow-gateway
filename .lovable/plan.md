## Why the totals look empty

The portal earnings page reads from the `referrer_commission_records` view, which only has rows once the NMI commission sync writes into `commission_records`. Right now that table is empty (latest NMI v3 boarding sync returned 0 merchants for every period), and none of the four referred accounts have a `nmi_merchant_id` or a `closed_won` outcome yet — so the view legitimately returns nothing and every tile renders as $0.

In other words: the math is correct, but the page has no forward-looking signal. There is no notion of a *projection* anywhere — only realized, settled payouts.

## What to add

Introduce a **Projected** layer on `src/pages/portal/PortalCommissions.tsx` that uses the referrer's linked CRM accounts so partners always see meaningful numbers, even before the first NMI payout lands.

### New data fetch (client-only, scoped to current referrer)

Add a second query that pulls referred accounts and their most recent application:

```text
accounts (where referrer_id = me)
  ├─ opportunities (latest, for stage / outcome_status / status)
  └─ applications  (latest by created_at, for monthly_volume)
```

Classify each account into one of:
- **Live** — `nmi_merchant_id` set OR opportunity `stage='closed_won'`
- **In pipeline** — opportunity `status='active'` and not dead
- **Dead** — `status='dead'` or `outcome_status in ('disqualified','closed_lost','no_decision')` → excluded from projection

### Projection formula (per account, per month)

Reuse the project-wide deal-value model from memory:

```text
projected_company_commission_per_month
  = monthly_volume × 0.0292 × 0.30
projected_partner_payout_per_month
  = min(projected_company_commission_per_month × commission_rate, monthly_cap_per_merchant)
```

If `monthly_volume` is missing for an account, fall back to a conservative `$25,000` placeholder and badge it as "Estimate — volume not provided."

### New tiles / panel

Replace the current 4-tile row with 5 tiles plus a small projection breakdown:

1. **This period (realized)** — unchanged, from `cappedRecords`
2. **Lifetime earnings (realized)** — unchanged
3. **Projected monthly run-rate** *(new)* — sum of capped projected payouts for **Live** accounts only
4. **Pipeline potential / month** *(new)* — sum of capped projected payouts for **In pipeline** accounts (shown muted, labeled "if all activate")
5. **Active accounts** — split into `live / in pipeline` (e.g., `0 live · 4 in pipeline`)

Add a thin secondary panel "Projected breakdown" listing each non-dead referred account with: company name, stage badge (Live / In pipeline), projected monthly payout, and a "Cap hit" badge when the projection clips at `$1,000`.

### Copy / disclaimers

- Add a one-line note under the projection tiles: *"Projections estimate monthly earnings from your referred accounts using stated processing volume and the 50% rev share, capped at $1,000 per account per month. Actual payouts populate once merchants begin processing."*
- Keep the existing "settled payouts" disclaimer untouched.

## Out of scope

- No backend / view / migration changes.
- No change to realized payout logic (`cappedRecords`, `accountSummaries`, bonus math).
- No change to the admin `/referrers` page (can be a follow-up if desired).
- Not investigating why NMI v3 returns 0 merchants — separate issue from projection display.
