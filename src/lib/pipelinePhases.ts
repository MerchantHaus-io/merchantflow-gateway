import { OpportunityStage } from "@/types/opportunity";

/**
 * The funnel has three phases, and they are not decoration — they are three
 * different owners on three different clocks.
 *
 * A rep sells, underwriting decides, and technical setup boards the merchant.
 * The board rendered all ten stages as equal columns, which said none of that
 * and did not fit: ten columns at 245px is ~2,550px against about 1,176px of
 * viewport on a 1440px laptop with the rail expanded. Grouping by owner both
 * fits and finally puts the domain into the composition instead of leaving it
 * in the callbacks.
 *
 * "Underwrite" is the one a rep cannot advance — those deals are waiting on
 * someone else's clock, so a rep reads that phase rather than working it.
 */

export type PhaseId = "sell" | "underwrite" | "board";

export interface Phase {
  id: PhaseId;
  label: string;
  /** Whose clock the deals in this phase are on. */
  owner: string;
  stages: OpportunityStage[];
}

export const PIPELINE_PHASES: Phase[] = [
  {
    id: "sell",
    label: "Sell",
    owner: "your clock",
    stages: ["discovery", "qualified", "application_prep"],
  },
  {
    id: "underwrite",
    label: "Underwrite",
    owner: "their clock",
    stages: ["underwriting_review", "processor_approval"],
  },
  {
    id: "board",
    label: "Board",
    owner: "setup",
    stages: ["gateway_submitted", "integration_setup", "testing", "go_live_ready", "closed_won"],
  },
];

/**
 * Splits a lane's stages into its phases, preserving the order the lane gave
 * them and dropping phases the lane has no stages for — the gateway-only lane
 * has no underwriting, so it must not render an empty Underwrite rail.
 */
export function phasesFor(stages: OpportunityStage[]): { phase: Phase; stages: OpportunityStage[] }[] {
  const groups = PIPELINE_PHASES.map((phase) => ({
    phase,
    stages: stages.filter((s) => phase.stages.includes(s)),
  })).filter((g) => g.stages.length > 0);

  // A stage belonging to no phase would silently vanish. Nothing in
  // ACTIVE_PIPELINE_STAGES is unassigned today, but the lane can surface an
  // off-funnel stage when a deal is parked in one, and a dropped column means a
  // dropped card.
  const placed = new Set(groups.flatMap((g) => g.stages));
  const orphans = stages.filter((s) => !placed.has(s));
  if (orphans.length > 0) {
    groups.push({
      phase: { id: "board", label: "Off-funnel", owner: "needs a decision", stages: orphans },
      stages: orphans,
    });
  }

  return groups;
}
