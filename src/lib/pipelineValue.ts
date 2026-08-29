import { Opportunity } from "@/types/opportunity";

/**
 * Estimated monthly revenue to MerchantHaus from an opportunity.
 *
 * Residual share of the processing fee, plus a per-transaction component. The
 * same expression was written out four times — OpportunityCard, PipelineColumn,
 * UnifiedPipelineBoard and the since-removed pipeline list — so the rate could
 * drift between a card and the column total summing it. One definition, and the
 * constants are named rather than inline decimals.
 *
 * This is an internal estimate for rep-facing pipeline totals. It is not a
 * quoted price and must never reach a merchant-facing document.
 */

/** Blended processing rate assumed for an un-quoted deal. */
export const ASSUMED_PROCESSING_RATE = 0.0292;

/** Our share of that rate. */
export const RESIDUAL_SHARE = 0.33;

/** Dollars earned per this many transactions. */
export const TRANSACTIONS_PER_DOLLAR = 10;

/** Parses the free-text currency the onboarding wizard stores, e.g. "$40,000". */
const parseAmount = (raw: string | undefined): number => {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Returns 0 for any deal without a usable monthly volume. */
export function monthlyRevenueEstimate(opportunity: Opportunity): number {
  const formState = opportunity.wizard_state?.form_state as Record<string, string> | undefined;
  const volume = parseAmount(formState?.monthly_volume);
  if (volume <= 0) return 0;

  const processingRevenue = volume * ASSUMED_PROCESSING_RATE * RESIDUAL_SHARE;

  // Transaction count is derived from volume and average ticket; without a
  // ticket there is no count, so that component is simply absent.
  const averageTicket = parseAmount(formState?.average_transaction);
  const transactionRevenue = averageTicket > 0 ? volume / averageTicket / TRANSACTIONS_PER_DOLLAR : 0;

  return processingRevenue + transactionRevenue;
}

export function sumMonthlyRevenue(opportunities: Opportunity[]): number {
  return opportunities.reduce((total, opp) => total + monthlyRevenueEstimate(opp), 0);
}
