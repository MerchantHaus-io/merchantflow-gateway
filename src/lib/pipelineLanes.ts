import { ACTIVE_PIPELINE_STAGES, migrateStage, Opportunity, OpportunityStage } from "@/types/opportunity";

/**
 * The columns one swimlane should render.
 *
 * A lane draws its own funnel — processing has nine stages, gateway-only has
 * seven — but a lane that renders *only* its canonical stages will silently
 * drop any deal sitting somewhere else. That happens for real: legacy rows,
 * and a service type edited after the deal had already moved. A vanished card
 * reads as lost data, which is far worse than an unexpected column.
 *
 * So the lane shows its canonical stages plus any stage its own deals actually
 * occupy, in funnel order rather than appended, and the extra column exists
 * only while a deal is standing in it.
 */
export function laneStagesFor(
  canonicalStages: OpportunityStage[],
  opportunities: Opportunity[],
): OpportunityStage[] {
  const allowed = new Set(canonicalStages);
  const occupied = new Set(opportunities.map((o) => migrateStage(o.stage)));
  return ACTIVE_PIPELINE_STAGES.filter((stage) => allowed.has(stage) || occupied.has(stage));
}
