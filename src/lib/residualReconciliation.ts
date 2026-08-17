/**
 * Residual reconciliation — Gauntlet 8.1.
 *
 * Puts an arithmetic figure between what we *expect* to earn (our internal
 * estimate: processing residual + gateway margin) and what the processor
 * *actually* paid (NMI's published partner residual for the month).
 *
 * Pure functions only — no Supabase, no React — so the maths is testable.
 * Nothing here is merchant-facing.
 */

/** Our internal estimate for a merchant-month. */
export interface EstimateInput {
  /** Processing residual (Kurv markup x our split). */
  total_commission: number;
  /** Gateway margin from the accepted quote. */
  gateway_margin: number;
  /** Card volume we measured for the period. */
  transaction_volume: number;
  /** Transactions we measured for the period. */
  transaction_count: number;
  /** Gateway amount invoiced to the merchant (accepted quote monthly resale). */
  gateway_invoiced: number;
}

/** The processor's published actual for the same merchant-month. */
export interface ActualInput {
  partner_residual: number;
  gross_volume: number;
  transaction_count: number;
}

export type ReconciliationSeverity = "ok" | "watch" | "alert";

export interface Reconciliation {
  /** Expected revenue = processing residual + gateway margin. */
  expected: number;
  /** What NMI actually paid, or null when no residual line exists. */
  actual: number | null;
  /** actual - expected, or null when there is no actual. */
  variance: number | null;
  /** Variance as a percentage of expected, or null when not computable. */
  variance_pct: number | null;
  /** Actual residual as a percentage of actual gross volume. */
  effective_rate: number | null;
  /** The rate our own estimate implies, as a percentage of measured volume. */
  expected_rate: number | null;
  /** effective_rate - expected_rate, in percentage points. */
  rate_drift: number | null;
  /**
   * A live merchant (volume, transactions or a gateway invoice) with no
   * residual line at all — the single most valuable signal on the page.
   */
  no_residual_alert: boolean;
  severity: ReconciliationSeverity;
}

/** Variance beyond this (absolute %) is an alert. */
export const VARIANCE_ALERT_PCT = 10;
/** Variance beyond this (absolute %) is worth watching. */
export const VARIANCE_WATCH_PCT = 5;
/** Effective-rate drift beyond this (percentage points) is an alert. */
export const RATE_DRIFT_ALERT_PP = 0.15;

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

/** True when the merchant did anything at all this month. */
export function isLive(est: EstimateInput): boolean {
  return est.transaction_count > 0 || est.transaction_volume > 0 || est.gateway_invoiced > 0;
}

export function reconcile(est: EstimateInput, actual: ActualInput | null | undefined): Reconciliation {
  const expected = round((est.total_commission || 0) + (est.gateway_margin || 0));
  const live = isLive(est);

  if (!actual) {
    return {
      expected,
      actual: null,
      variance: null,
      variance_pct: null,
      effective_rate: null,
      expected_rate: null,
      rate_drift: null,
      no_residual_alert: live,
      severity: live ? "alert" : "ok",
    };
  }

  const actualAmount = round(actual.partner_residual || 0);
  const variance = round(actualAmount - expected);
  const variance_pct = expected !== 0 ? round((variance / Math.abs(expected)) * 100) : null;

  const effective_rate =
    actual.gross_volume > 0 ? round((actualAmount / actual.gross_volume) * 100, 4) : null;
  const expected_rate =
    est.transaction_volume > 0 ? round(expected / est.transaction_volume * 100, 4) : null;
  const rate_drift =
    effective_rate != null && expected_rate != null ? round(effective_rate - expected_rate, 4) : null;

  let severity: ReconciliationSeverity = "ok";
  const absPct = variance_pct != null ? Math.abs(variance_pct) : 0;
  const absDrift = rate_drift != null ? Math.abs(rate_drift) : 0;
  if (absPct >= VARIANCE_ALERT_PCT || absDrift >= RATE_DRIFT_ALERT_PP) severity = "alert";
  else if (absPct >= VARIANCE_WATCH_PCT) severity = "watch";

  return {
    expected,
    actual: actualAmount,
    variance,
    variance_pct,
    effective_rate,
    expected_rate,
    rate_drift,
    no_residual_alert: false,
    severity,
  };
}

export interface ReconciliationSummary {
  merchants: number;
  expected: number;
  actual: number;
  variance: number;
  variance_pct: number | null;
  /** Live merchants with no residual line at all. */
  no_residual_count: number;
  /** Merchants whose variance or rate drift breaches the alert thresholds. */
  alert_count: number;
  /** Merchants reconciled with a residual line present. */
  reconciled_count: number;
}

export function summarise(rows: Reconciliation[]): ReconciliationSummary {
  let expected = 0;
  let actual = 0;
  let no_residual_count = 0;
  let alert_count = 0;
  let reconciled_count = 0;

  for (const r of rows) {
    expected += r.expected;
    if (r.actual != null) {
      actual += r.actual;
      reconciled_count += 1;
    }
    if (r.no_residual_alert) no_residual_count += 1;
    if (r.severity === "alert") alert_count += 1;
  }

  const variance = round(actual - expected);
  return {
    merchants: rows.length,
    expected: round(expected),
    actual: round(actual),
    variance,
    variance_pct: expected !== 0 ? round((variance / Math.abs(expected)) * 100) : null,
    no_residual_count,
    alert_count,
    reconciled_count,
  };
}
