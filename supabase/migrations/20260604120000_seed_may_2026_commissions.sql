-- Seed the May 2026 commission period + per-merchant records from the monthly NMI
-- transaction export (transactions_1.csv, 2026-04-30 → 2026-05-31).
--
-- Context: NMI Payments and Kurv/TSYS residuals have no webhook feed, so the live
-- `nmi-commissions` sync returns 0 merchants and the commission tables are empty
-- for May 2026. Commission therefore has to be derived manually from the monthly
-- export using each merchant's agreed Kurv metrics and our 85% residual split
-- (EMS Agent Marketing Agreement, Schedule A: "All Retail Merchants — 85%").
--
-- Kurv processing model (per merchant):
--   merchant_billing_markup = volume × vol_rate_pct/100  +  txn_count × per_txn_fee
--   our_residual            = merchant_billing_markup × residual_split
--
-- For Improv the agreed metrics are 0.5% of volume + $0.25/txn, at our 85% split.
-- Volume/count use the same rule as the edge function: settled or pending sales
-- only (status complete|pending), excluding refunds/voids.
--
-- Only Improv is active under this model at this stage; the same formula extends
-- to the other processing-with-Kurv merchants once their metrics are confirmed
-- (add a row to the VALUES list below). referrer_payout is left to the existing
-- BEFORE INSERT/UPDATE trigger (compute_referrer_payout). Merchants are matched to
-- accounts by name; an unmatched merchant — or one without an NMI gateway id — is
-- skipped with a NOTICE rather than inserting an orphan. Fully idempotent.

DO $$
DECLARE
  v_period_start date := '2026-05-01';
  v_period_end   date := '2026-05-31';
  v_period_id    uuid;
  m              record;
  v_acc          record;
  v_gateway      text;
  v_markup       numeric;
  v_commission   numeric;
  v_seeded       int := 0;
BEGIN
  -- 1) Upsert the monthly period (rollup totals refreshed from records at the end).
  INSERT INTO public.commission_periods (period_start, period_end, status, fetched_at)
  VALUES (v_period_start, v_period_end, 'complete', now())
  ON CONFLICT (period_start, period_end)
  DO UPDATE SET status = 'complete', fetched_at = now(), updated_at = now()
  RETURNING id INTO v_period_id;

  -- 2) Per-merchant figures from the export + agreed Kurv metrics.
  --    (export_name, name patterns, txn_count, volume, vol_rate_pct, per_txn_fee, residual_split)
  FOR m IN
    SELECT * FROM (VALUES
      ('IMPROVLearning', ARRAY['%Improv%'], 40, 2682.24::numeric, 0.5::numeric, 0.25::numeric, 0.85::numeric)
    ) AS t(export_name, patterns, txn_count, volume, vol_rate_pct, per_txn_fee, residual_split)
  LOOP
    -- Resolve the CRM account by name.
    SELECT a.id, a.name, a.nmi_merchant_id
      INTO v_acc
      FROM public.accounts a
     WHERE a.name ILIKE ANY (m.patterns)
     ORDER BY a.updated_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE NOTICE 'Skipping "%" — no matching account', m.export_name;
      CONTINUE;
    END IF;

    -- Resolve the NMI gateway id (account first, then a boarding submission).
    v_gateway := NULLIF(v_acc.nmi_merchant_id, '');
    IF v_gateway IS NULL THEN
      SELECT NULLIF(b.nmi_gateway_id, '')
        INTO v_gateway
        FROM public.nmi_boarding_submissions b
       WHERE b.account_id = v_acc.id
         AND COALESCE(b.nmi_gateway_id, '') <> ''
       ORDER BY b.updated_at DESC
       LIMIT 1;
    END IF;

    IF v_gateway IS NULL THEN
      RAISE NOTICE 'Skipping "%" — account "%" has no NMI gateway id', m.export_name, v_acc.name;
      CONTINUE;
    END IF;

    -- Kurv processing model: markup billed to the merchant, then our 85% residual.
    v_markup     := round(m.volume * m.vol_rate_pct / 100.0 + m.txn_count * m.per_txn_fee, 2);
    v_commission := round(v_markup * m.residual_split, 2);

    INSERT INTO public.commission_records (
      period_id, account_id, nmi_gateway_id, company_name,
      transaction_count, transaction_volume, transaction_fees,
      chargeback_fees, residual_rate, residual_amount, total_commission
    ) VALUES (
      v_period_id, v_acc.id, v_gateway, COALESCE(v_acc.name, m.export_name),
      m.txn_count, m.volume, v_markup,
      0, m.residual_split, v_markup, v_commission
    )
    ON CONFLICT (period_id, nmi_gateway_id) DO UPDATE SET
      account_id         = EXCLUDED.account_id,
      company_name       = EXCLUDED.company_name,
      transaction_count  = EXCLUDED.transaction_count,
      transaction_volume = EXCLUDED.transaction_volume,
      transaction_fees   = EXCLUDED.transaction_fees,
      residual_rate      = EXCLUDED.residual_rate,
      residual_amount    = EXCLUDED.residual_amount,
      total_commission   = EXCLUDED.total_commission;

    v_seeded := v_seeded + 1;
    RAISE NOTICE 'Seeded "%" (account "%", gateway %): % txns / $% volume → $% markup → $% residual',
      m.export_name, v_acc.name, v_gateway, m.txn_count, m.volume, v_markup, v_commission;
  END LOOP;

  -- 3) Refresh the period rollups from the records actually seeded.
  UPDATE public.commission_periods p
     SET total_volume       = COALESCE(s.vol, 0),
         total_transactions = COALESCE(s.cnt, 0),
         total_commission   = COALESCE(s.comm, 0),
         updated_at         = now()
    FROM (
      SELECT period_id,
             SUM(transaction_volume) AS vol,
             SUM(transaction_count)  AS cnt,
             SUM(total_commission)   AS comm
        FROM public.commission_records
       WHERE period_id = v_period_id
       GROUP BY period_id
    ) s
   WHERE p.id = v_period_id;

  RAISE NOTICE 'May 2026 commission seed complete: % merchant record(s) written.', v_seeded;
END $$;
