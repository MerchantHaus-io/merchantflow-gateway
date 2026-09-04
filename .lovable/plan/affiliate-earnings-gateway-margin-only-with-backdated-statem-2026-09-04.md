# Affiliate earnings: gateway margin only, with backdated statements

Partners earn on the gateway side only, on our profit after cost, and the system
should show every month owed even though no payment run has happened yet.

## The rule being implemented

- A partner earns **50% of the gateway margin** for each merchant they referred:
  what the merchant is billed for the gateway, less our underlying cost.
- **Processing residuals earn the partner nothing.** They are excluded entirely
  from partner earnings.
- Earnings start from the **month of the merchant's first gateway invoice** and
  continue every month the gateway is billed.
- Earnings for a month become payable 30 days after that month ends, $50
  minimum, paid by bank transfer.
- The partner's own statement shows month, merchant and their own amount only —
  never our cost or markup.

## What's wrong today

- Partner earnings are currently calculated from the **processing residual**
  (`total_commission`), which is exactly the opposite of the rule.
- No earnings records exist at all yet (the ledger is empty) and no payment run
  has been made, so nothing shows as owed.
- Gateway figures on existing commission rows are all zero, so even a corrected
  calculation would produce nothing until they are filled in from accepted
  pricing.
- Only one gateway invoice exists in the system so far (June 2026), so most
  merchants' monthly gateway billing has to be derived from their accepted
  pricing rather than from issued invoices.

## Session 1 — database (no app changes in this session)

1. Rewrite the partner earnings view so each row's amount is
   `gateway_margin x partner rate`, capped at the partner's per-merchant monthly
   cap. Keep processing figures visible internally for reporting but never in
   the payout amount.
2. Fill in the gateway billed/margin figures on existing commission rows from
   each account's latest accepted pricing.
3. Add a function that builds the **monthly earnings schedule** for every
   partner-linked account: one row per merchant per month, from the month of the
   first gateway invoice (falling back to the accepted-pricing month when no
   invoice was issued for that month) through last month. It is idempotent — one
   entry per partner + merchant + month, safe to re-run.
4. Mark entries whose month ended more than 30 days ago as ready to pay, so a
   backdated schedule immediately shows a real balance owed.

## Session 2 — app changes

1. A small shared calculation module (with tests) for the gateway-only share,
   the cap, and the payable date, so the admin view, the partner portal and the
   generator all agree.
2. Admin Affiliates page: a **"Build outstanding months"** action that runs the
   backdated schedule, plus a per-partner breakdown showing each month, merchant,
   gateway margin, partner share, and whether it is on hold or ready to pay.
   Totals show what is owed right now.
3. Commission statements: label the partner column clearly as gateway-only, and
   exclude the processing residual from anything shown as partner earnings.
4. Partner portal statement: month, merchant, their amount, status, running
   balance, next payment date. No cost or margin figures anywhere.
5. Verification: typecheck, `npx vitest run` (including the cost-redaction
   guard), lint and build, with results reported.

## Notes

- The existing $1,000 per merchant per month cap and $500 five-merchant bonus
  stay as they are.
- Attribution-only legacy names stay at 0% and generate no earnings.
- Any statement or document a partner or merchant can see continues to run
  through the cost-redaction helper.
