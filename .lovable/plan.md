## Problem

On `/transactions`, the four stat cards (Total Transactions, Approval Rate, Approved Volume, Refunds) read from `data.summary` returned by the `nmi-transactions` edge function. That summary is computed server-side over the full result set, so changing merchant / type / status / search filters updates the table below but leaves the totals unchanged.

## Fix

Compute the stats client-side from the already-filtered `filtered` array so every filter choice flows through to the headline numbers.

### Changes in `src/pages/Transactions.tsx`

1. Add a `useMemo` `filteredSummary` derived from `filtered`, mirroring the shape the cards consume:
   - `total_count` = `filtered.length`
   - `approved_count` / `approved_amount` — sum where `condition ∈ {complete, pending, pending_settlement}`
   - `declined_count`
   - `refund_count` / `refund_amount` — where `type ∈ {refund, credit}`
   - `total_amount`
2. Replace the four stat-card bindings (lines ~429, ~443, ~450, plus the `approvalRate` calculation at ~313) to read from `filteredSummary` instead of `summary`.
3. Update the "X of Y transactions" caption (line ~520) to keep its current meaning (it already uses `filtered.length` / `txs.length`, no change needed).
4. Leave the per-merchant analytics tab and commission tab untouched — those have their own data sources and aren't part of this complaint.

### Out of scope

- No edge-function changes; server still returns its own summary, we just stop displaying it on the main card row.
- No new filter UI — existing merchant / type / status / search / date controls already work, they just weren't wired to the totals.
