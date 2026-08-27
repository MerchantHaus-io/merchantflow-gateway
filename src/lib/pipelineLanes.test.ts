import { describe, it, expect } from "vitest";
import { laneStagesFor } from "./pipelineLanes";
import {
  ACTIVE_PIPELINE_STAGES,
  GATEWAY_ONLY_PIPELINE_STAGES,
  PROCESSING_PIPELINE_STAGES,
  type Opportunity,
  type OpportunityStage,
} from "@/types/opportunity";

const at = (stage: string): Opportunity =>
  ({ id: `opp-${stage}`, stage, created_at: "2026-01-01T00:00:00Z" }) as unknown as Opportunity;

describe("laneStagesFor", () => {
  it("renders exactly the canonical funnel when nothing is out of place", () => {
    expect(laneStagesFor(PROCESSING_PIPELINE_STAGES, [at("discovery"), at("testing")])).toEqual(
      PROCESSING_PIPELINE_STAGES,
    );
    expect(laneStagesFor(GATEWAY_ONLY_PIPELINE_STAGES, [at("gateway_submitted")])).toEqual(
      GATEWAY_ONLY_PIPELINE_STAGES,
    );
  });

  it("keeps the canonical funnel when the lane is empty", () => {
    expect(laneStagesFor(GATEWAY_ONLY_PIPELINE_STAGES, [])).toEqual(GATEWAY_ONLY_PIPELINE_STAGES);
  });

  it("never drops a deal parked outside its lane's funnel", () => {
    // A gateway deal in Underwriting: illegal, but it exists, and hiding it
    // would read as the deal having been deleted.
    const stages = laneStagesFor(GATEWAY_ONLY_PIPELINE_STAGES, [at("underwriting_review")]);
    expect(stages).toContain("underwriting_review");

    // A processing deal in the gateway-only stage, the mirror case.
    expect(laneStagesFor(PROCESSING_PIPELINE_STAGES, [at("gateway_submitted")])).toContain(
      "gateway_submitted",
    );
  });

  it("places the extra column in funnel order, not at the end", () => {
    const stages = laneStagesFor(GATEWAY_ONLY_PIPELINE_STAGES, [at("underwriting_review")]);
    expect(stages.indexOf("underwriting_review")).toBeGreaterThan(stages.indexOf("qualified"));
    expect(stages.indexOf("underwriting_review")).toBeLessThan(stages.indexOf("integration_setup"));
    expect(stages[stages.length - 1]).toBe("closed_won");
  });

  it("resolves legacy stage names before deciding, so no phantom column appears", () => {
    // migrateStage maps legacy `closed_lost` onto discovery, which every lane
    // already has — the lane must not sprout a column for the raw value.
    const stages = laneStagesFor(GATEWAY_ONLY_PIPELINE_STAGES, [at("closed_lost")]);
    expect(stages).toEqual(GATEWAY_ONLY_PIPELINE_STAGES);
  });

  it("keeps every stage unique and in the canonical funnel's order", () => {
    const stages = laneStagesFor(GATEWAY_ONLY_PIPELINE_STAGES, [
      at("underwriting_review"),
      at("underwriting_review"),
      at("processor_approval"),
    ]);
    expect(new Set(stages).size).toBe(stages.length);
    const order = (s: OpportunityStage) => ACTIVE_PIPELINE_STAGES.indexOf(s);
    expect(stages.map(order)).toEqual([...stages.map(order)].sort((a, b) => a - b));
  });
});
