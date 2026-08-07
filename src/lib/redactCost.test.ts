import { describe, it, expect } from "vitest";
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripInternalCostRefs } from "./redactCost";

describe("stripInternalCostRefs", () => {
  it("removes a trailing 'NMI partner cost $…' sentence", () => {
    expect(
      stripInternalCostRefs(
        "Pay-by-text payment links. NMI partner cost $5/mo + $0.18/txn.",
      ),
    ).toBe("Pay-by-text payment links.");
  });

  it("handles decimals in the partner-cost figure", () => {
    expect(
      stripInternalCostRefs(
        "Swiped/dipped/keyed mobile acceptance via card reader. NMI partner cost $2.50/mo/device.",
      ),
    ).toBe("Swiped/dipped/keyed mobile acceptance via card reader.");
  });

  it("removes an 'NMI partner: …' colon variant", () => {
    expect(
      stripInternalCostRefs(
        "B2B/B2G interchange optimization. NMI partner: $25 setup + $25/mo + $0.25/txn.",
      ),
    ).toBe("B2B/B2G interchange optimization.");
  });

  it("removes a '(partner cost $…)' parenthetical and keeps the merchant rate", () => {
    expect(stripInternalCostRefs("Merchant rate: $0.95 (partner cost $0.45).")).toBe(
      "Merchant rate: $0.95.",
    );
  });

  it("removes a bare 'partner cost' clause", () => {
    expect(
      stripInternalCostRefs("Level III optimization. Partner cost $25 setup."),
    ).toBe("Level III optimization.");
  });

  it("leaves a clean description untouched (idempotent)", () => {
    const clean = "Refreshes saved cards to reduce involuntary churn.";
    expect(stripInternalCostRefs(clean)).toBe(clean);
    expect(stripInternalCostRefs(stripInternalCostRefs(clean))).toBe(clean);
  });

  it("does not strip legitimate merchant pass-through language", () => {
    const desc = "Merchant rate: $0.50 (pass-through).";
    expect(stripInternalCostRefs(desc)).toBe(desc);
  });

  it("returns '' for empty/undefined input", () => {
    expect(stripInternalCostRefs(undefined)).toBe("");
    expect(stripInternalCostRefs(null)).toBe("");
    expect(stripInternalCostRefs("")).toBe("");
  });
});

describe('merchant-facing surfaces are wired to the scrubber', () => {
  // CLAUDE.md: "Any new merchant-facing document generator MUST run line
  // descriptions through this helper." These assertions fail loudly if a
  // generator is added, or an existing one refactored, without it — the
  // failure mode otherwise is silent partner-cost disclosure to a merchant.
  const MERCHANT_FACING = [
    'src/lib/quotePdf.ts',        // quote PDF + MSA Exhibit A
    'src/lib/billingDocPdf.ts',   // invoices / receipts
    'src/pages/QuoteAcceptance.tsx', // the public /q/:token signing page
  ];

  it.each(MERCHANT_FACING)('%s calls stripInternalCostRefs', (file) => {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(src).toMatch(/stripInternalCostRefs/);
  });

  it('scrubs the cost phrasings that appear in persisted snapshots', () => {
    // Old accepted quotes still carry these strings in lines_snapshot.
    const samples = [
      'Pay-by-text payment links. NMI partner cost $5/mo + $0.18/txn.',
      'Chargeback alerts (partner cost $0.45 each)',
      'Tokenization vault (wholesale cost $10/mo)',
      'Account updater — underlying cost $0.25 per update',
    ];
    for (const s of samples) {
      const cleaned = stripInternalCostRefs(s);
      expect(cleaned).not.toMatch(/partner\s+cost|wholesale\s+cost|underlying\s+cost/i);
      expect(cleaned.length).toBeGreaterThan(0);
    }
  });
});
