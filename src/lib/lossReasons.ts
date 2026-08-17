/**
 * Loss-reason aggregation — Gauntlet 8.4a (#204).
 *
 * `outcome_reason` has been captured on every closed opportunity for a while
 * and never aggregated. These pure helpers roll it up by reason, by the stage
 * the deal died in, and by pricing tier.
 */
import { OUTCOME_REASONS } from "@/config/outcomeReasons";

export type LossOutcome = "closed_lost" | "disqualified" | "no_decision" | "underwriting_declined";

/** Outcomes that count as a loss. `closed_won` is deliberately excluded. */
export const LOSS_OUTCOMES: LossOutcome[] = [
  "closed_lost",
  "disqualified",
  "no_decision",
  "underwriting_declined",
];

export interface LossOpp {
  outcome_status?: string | null;
  outcome_reason?: string | null;
  stage?: string | null;
  gateway_tier?: string | null;
}

export interface LossReasonRow {
  reason: string;
  label: string;
  outcome: string | null;
  count: number;
  /** Share of all losses, 0-100. */
  share: number;
  /** count keyed by stage. */
  byStage: Record<string, number>;
  /** count keyed by tier. */
  byTier: Record<string, number>;
}

const LABELS = new Map<string, { label: string; outcome: string }>();
for (const [outcome, list] of Object.entries(OUTCOME_REASONS)) {
  for (const r of list) {
    if (!LABELS.has(r.value)) LABELS.set(r.value, { label: r.label, outcome });
  }
}

export function reasonLabel(value: string): string {
  return (
    LABELS.get(value)?.label ??
    value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

export function isLoss(opp: LossOpp): boolean {
  return !!opp.outcome_status && (LOSS_OUTCOMES as string[]).includes(opp.outcome_status);
}

export const UNSPECIFIED = "unspecified";

/**
 * Roll losses up by reason, descending by count. Losses with no reason
 * recorded are bucketed under `unspecified` so the gap stays visible.
 */
export function aggregateLossReasons(opps: LossOpp[]): LossReasonRow[] {
  const losses = opps.filter(isLoss);
  const total = losses.length;
  const byReason = new Map<string, LossReasonRow>();

  for (const o of losses) {
    const reason = o.outcome_reason || UNSPECIFIED;
    let row = byReason.get(reason);
    if (!row) {
      row = {
        reason,
        label: reason === UNSPECIFIED ? "No reason recorded" : reasonLabel(reason),
        outcome: LABELS.get(reason)?.outcome ?? o.outcome_status ?? null,
        count: 0,
        share: 0,
        byStage: {},
        byTier: {},
      };
      byReason.set(reason, row);
    }
    row.count += 1;
    const stage = o.stage || "unknown";
    row.byStage[stage] = (row.byStage[stage] || 0) + 1;
    const tier = o.gateway_tier || "untiered";
    row.byTier[tier] = (row.byTier[tier] || 0) + 1;
  }

  return [...byReason.values()]
    .map((r) => ({ ...r, share: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export interface LossBucket {
  key: string;
  count: number;
  share: number;
}

/** Loss counts grouped by the stage the deal died in. */
export function lossesByStage(opps: LossOpp[]): LossBucket[] {
  return bucket(opps, (o) => o.stage || "unknown");
}

/** Loss counts grouped by pricing tier. */
export function lossesByTier(opps: LossOpp[]): LossBucket[] {
  return bucket(opps, (o) => o.gateway_tier || "untiered");
}

function bucket(opps: LossOpp[], key: (o: LossOpp) => string): LossBucket[] {
  const losses = opps.filter(isLoss);
  const counts = new Map<string, number>();
  for (const o of losses) {
    const k = key(o);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const total = losses.length;
  return [...counts.entries()]
    .map(([k, count]) => ({ key: k, count, share: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
