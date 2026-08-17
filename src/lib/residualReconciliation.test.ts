import { describe, it, expect } from "vitest";
import {
  reconcile,
  summarise,
  isLive,
  VARIANCE_ALERT_PCT,
  type EstimateInput,
} from "./residualReconciliation";

const est = (over: Partial<EstimateInput> = {}): EstimateInput => ({
  total_commission: 800,
  gateway_margin: 200,
  transaction_volume: 100_000,
  transaction_count: 500,
  gateway_invoiced: 300,
  ...over,
});

describe("reconcile", () => {
  it("computes expected as processing residual + gateway margin", () => {
    const r = reconcile(est(), { partner_residual: 1000, gross_volume: 100_000, transaction_count: 500 });
    expect(r.expected).toBe(1000);
    expect(r.variance).toBe(0);
    expect(r.variance_pct).toBe(0);
    expect(r.severity).toBe("ok");
  });

  it("reports a negative variance when NMI pays less than expected", () => {
    const r = reconcile(est(), { partner_residual: 850, gross_volume: 100_000, transaction_count: 500 });
    expect(r.variance).toBe(-150);
    expect(r.variance_pct).toBe(-15);
    expect(r.severity).toBe("alert");
    expect(Math.abs(r.variance_pct!)).toBeGreaterThanOrEqual(VARIANCE_ALERT_PCT);
  });

  it("flags a mid-sized variance as watch, not alert", () => {
    const r = reconcile(
      { ...est(), transaction_volume: 0 },
      { partner_residual: 940, gross_volume: 0, transaction_count: 500 }
    );
    expect(r.variance_pct).toBe(-6);
    expect(r.severity).toBe("watch");
  });

  it("computes effective rate and rate drift", () => {
    const r = reconcile(est(), { partner_residual: 1000, gross_volume: 200_000, transaction_count: 500 });
    expect(r.effective_rate).toBe(0.5); // 1000 / 200,000
    expect(r.expected_rate).toBe(1); // 1000 / 100,000
    expect(r.rate_drift).toBe(-0.5);
    expect(r.severity).toBe("alert"); // drift breaches the threshold even at 0% variance
  });

  it("raises no_residual_alert for a live merchant with no residual line", () => {
    const r = reconcile(est(), null);
    expect(r.no_residual_alert).toBe(true);
    expect(r.actual).toBeNull();
    expect(r.variance).toBeNull();
    expect(r.severity).toBe("alert");
  });

  it("does not alert on a dormant merchant with no residual line", () => {
    const r = reconcile(
      { total_commission: 0, gateway_margin: 0, transaction_volume: 0, transaction_count: 0, gateway_invoiced: 0 },
      null
    );
    expect(r.no_residual_alert).toBe(false);
    expect(r.severity).toBe("ok");
  });

  it("treats a gateway-only merchant with an invoice as live", () => {
    expect(isLive({ total_commission: 0, gateway_margin: 90, transaction_volume: 0, transaction_count: 0, gateway_invoiced: 300 })).toBe(true);
  });

  it("leaves variance_pct null when expected is zero", () => {
    const r = reconcile(
      { total_commission: 0, gateway_margin: 0, transaction_volume: 0, transaction_count: 0, gateway_invoiced: 0 },
      { partner_residual: 50, gross_volume: 0, transaction_count: 0 }
    );
    expect(r.variance).toBe(50);
    expect(r.variance_pct).toBeNull();
  });
});

describe("summarise", () => {
  it("totals expected, actual and variance and counts the alerts", () => {
    const rows = [
      reconcile(est(), { partner_residual: 1000, gross_volume: 100_000, transaction_count: 500 }),
      reconcile(est({ total_commission: 400, gateway_margin: 100, transaction_volume: 50_000 }), {
        partner_residual: 300,
        gross_volume: 50_000,
        transaction_count: 200,
      }),
      reconcile(est({ total_commission: 100, gateway_margin: 0 }), null),
    ];
    const s = summarise(rows);
    expect(s.merchants).toBe(3);
    expect(s.expected).toBe(1000 + 500 + 100);
    expect(s.actual).toBe(1300);
    expect(s.variance).toBe(-300);
    expect(s.reconciled_count).toBe(2);
    expect(s.no_residual_count).toBe(1);
    expect(s.alert_count).toBe(2); // the -40% row and the missing-residual row
  });

  it("handles an empty period", () => {
    const s = summarise([]);
    expect(s).toMatchObject({ merchants: 0, expected: 0, actual: 0, variance: 0, variance_pct: null });
  });
});
