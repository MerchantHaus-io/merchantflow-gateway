/**
 * Keeping a partner attached to the merchant they introduced.
 *
 * A referral is tagged on the opportunity while it is still a deal. The moment
 * that deal goes live (closed_won) the money moves to the *account*, and the
 * affiliate ledger reads `accounts.referrer_id`. If nobody copies the tag
 * across, the partner earns nothing on a merchant they brought in.
 *
 * Rules:
 *  - Only copy when the deal is live.
 *  - Never overwrite a referrer already set on the account — a manual
 *    assignment by an admin wins.
 *  - Earnings themselves are gateway-only and are worked out elsewhere; this
 *    module only decides ownership.
 */

import { supabase } from "@/integrations/supabase/client";

/** Stages that mean the merchant is live and billable. */
export const LIVE_STAGES = ["closed_won"] as const;

export function isLiveStage(stage: string | null | undefined): boolean {
  return !!stage && (LIVE_STAGES as readonly string[]).includes(stage);
}

/**
 * Should the partner tag on the deal be copied onto the account?
 * Pure so the rule is testable without a database.
 */
export function shouldAssignAccountReferrer(args: {
  stage: string | null | undefined;
  opportunityReferrerId: string | null | undefined;
  accountReferrerId: string | null | undefined;
}): boolean {
  if (!isLiveStage(args.stage)) return false;
  if (!args.opportunityReferrerId) return false;
  return !args.accountReferrerId;
}

/**
 * Copy the deal's partner onto its account once the deal is live. Safe to call
 * on every stage change: it no-ops unless the rule above holds. Returns the
 * account id when an assignment happened, otherwise null.
 */
export async function syncAccountReferrerForOpportunity(
  opportunityId: string,
  stage?: string | null,
): Promise<string | null> {
  const { data: opp } = await supabase
    .from("opportunities")
    .select("id, stage, account_id, referrer_id")
    .eq("id", opportunityId)
    .maybeSingle();
  if (!opp?.account_id) return null;

  const effectiveStage = stage ?? opp.stage;
  const oppReferrer = (opp as { referrer_id?: string | null }).referrer_id ?? null;
  if (!isLiveStage(effectiveStage) || !oppReferrer) return null;

  const { data: account } = await supabase
    .from("accounts")
    .select("id, referrer_id")
    .eq("id", opp.account_id)
    .maybeSingle();
  if (!account) return null;

  if (
    !shouldAssignAccountReferrer({
      stage: effectiveStage,
      opportunityReferrerId: oppReferrer,
      accountReferrerId: (account as { referrer_id?: string | null }).referrer_id ?? null,
    })
  ) {
    return null;
  }

  const { error } = await supabase
    .from("accounts")
    .update({ referrer_id: oppReferrer })
    .eq("id", account.id);
  if (error) return null;
  return account.id;
}
