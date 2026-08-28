import { describe, it, expect } from "vitest";
import { phasesFor, PIPELINE_PHASES } from "./pipelinePhases";
import {
  ACTIVE_PIPELINE_STAGES,
  GATEWAY_ONLY_PIPELINE_STAGES,
  PROCESSING_PIPELINE_STAGES,
  type OpportunityStage,
} from "@/types/opportunity";

describe("phasesFor", () => {
  it("covers every active stage exactly once, with no stage in two phases", () => {
    const all = PIPELINE_PHASES.flatMap((p) => p.stages);
    expect(new Set(all).size).toBe(all.length);
    for (const stage of ACTIVE_PIPELINE_STAGES) {
      expect(all).toContain(stage);
    }
  });

  it("splits the processing funnel into all three phases", () => {
    const groups = phasesFor(PROCESSING_PIPELINE_STAGES);
    expect(groups.map((g) => g.phase.id)).toEqual(["sell", "underwrite", "board"]);
    expect(groups.flatMap((g) => g.stages)).toHaveLength(PROCESSING_PIPELINE_STAGES.length);
  });

  it("gives the gateway funnel no underwriting phase at all", () => {
    const groups = phasesFor(GATEWAY_ONLY_PIPELINE_STAGES);
    expect(groups.map((g) => g.phase.id)).toEqual(["sell", "board"]);
    // An empty Underwrite rail on a lane that never underwrites would be a lie.
    expect(groups.every((g) => g.stages.length > 0)).toBe(true);
  });

  it("never loses a stage it was given", () => {
    for (const lane of [PROCESSING_PIPELINE_STAGES, GATEWAY_ONLY_PIPELINE_STAGES, ACTIVE_PIPELINE_STAGES]) {
      const out = phasesFor(lane).flatMap((g) => g.stages);
      expect([...out].sort()).toEqual([...lane].sort());
    }
  });

  it("preserves the order the lane supplied", () => {
    const groups = phasesFor(PROCESSING_PIPELINE_STAGES);
    const flat = groups.flatMap((g) => g.stages);
    const positions = flat.map((s) => PROCESSING_PIPELINE_STAGES.indexOf(s));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("returns nothing for an empty lane", () => {
    expect(phasesFor([])).toEqual([]);
  });

  it("keeps an unrecognised stage rather than dropping its column", () => {
    // A dropped column is a dropped card, which reads as deleted data.
    const stages = [...GATEWAY_ONLY_PIPELINE_STAGES, "some_future_stage" as OpportunityStage];
    const out = phasesFor(stages).flatMap((g) => g.stages);
    expect(out).toContain("some_future_stage");
    expect(out).toHaveLength(stages.length);
  });
});
