import { describe, it, expect } from "vitest";
import {
  monthlyRevenueEstimate,
  sumMonthlyRevenue,
  ASSUMED_PROCESSING_RATE,
  RESIDUAL_SHARE,
  TRANSACTIONS_PER_DOLLAR,
} from "./pipelineValue";
import type { Opportunity } from "@/types/opportunity";

const deal = (form?: Record<string, string>): Opportunity =>
  ({
    id: "opp-1",
    stage: "discovery",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    wizard_state: form ? { form_state: form } : undefined,
  }) as unknown as Opportunity;

describe("monthlyRevenueEstimate", () => {
  it("is 0 without a wizard state, a volume, or a parseable volume", () => {
    expect(monthlyRevenueEstimate(deal())).toBe(0);
    expect(monthlyRevenueEstimate(deal({}))).toBe(0);
    expect(monthlyRevenueEstimate(deal({ monthly_volume: "" }))).toBe(0);
    expect(monthlyRevenueEstimate(deal({ monthly_volume: "TBD" }))).toBe(0);
    expect(monthlyRevenueEstimate(deal({ monthly_volume: "0" }))).toBe(0);
  });

  it("takes the residual share of the processing fee when there is no ticket", () => {
    const v = monthlyRevenueEstimate(deal({ monthly_volume: "40000" }));
    expect(v).toBeCloseTo(40000 * ASSUMED_PROCESSING_RATE * RESIDUAL_SHARE, 6);
  });

  it("strips currency formatting from the wizard's free text", () => {
    const plain = monthlyRevenueEstimate(deal({ monthly_volume: "40000" }));
    expect(monthlyRevenueEstimate(deal({ monthly_volume: "$40,000" }))).toBeCloseTo(plain, 6);
    expect(monthlyRevenueEstimate(deal({ monthly_volume: " 40,000.00 " }))).toBeCloseTo(plain, 6);
  });

  it("adds the transaction component when an average ticket is present", () => {
    const withTicket = monthlyRevenueEstimate(
      deal({ monthly_volume: "40000", average_transaction: "80" }),
    );
    const expected =
      40000 * ASSUMED_PROCESSING_RATE * RESIDUAL_SHARE + 40000 / 80 / TRANSACTIONS_PER_DOLLAR;
    expect(withTicket).toBeCloseTo(expected, 6);
  });

  it("ignores a zero or unparseable ticket rather than dividing by it", () => {
    const base = monthlyRevenueEstimate(deal({ monthly_volume: "40000" }));
    expect(monthlyRevenueEstimate(deal({ monthly_volume: "40000", average_transaction: "0" }))).toBeCloseTo(base, 6);
    expect(monthlyRevenueEstimate(deal({ monthly_volume: "40000", average_transaction: "n/a" }))).toBeCloseTo(base, 6);
    expect(Number.isFinite(monthlyRevenueEstimate(deal({ monthly_volume: "40000", average_transaction: "0" })))).toBe(true);
  });
});

describe("sumMonthlyRevenue", () => {
  it("is 0 for an empty pipeline", () => {
    expect(sumMonthlyRevenue([])).toBe(0);
  });

  it("adds up only the deals that have a volume", () => {
    const list = [
      deal({ monthly_volume: "40000" }),
      deal({ monthly_volume: "10000" }),
      deal(),
    ];
    expect(sumMonthlyRevenue(list)).toBeCloseTo(
      50000 * ASSUMED_PROCESSING_RATE * RESIDUAL_SHARE,
      6,
    );
  });
});
