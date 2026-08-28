import { describe, it, expect } from "vitest";
import {
  dealAttention,
  AGEING_DAYS,
  FAILING_SCORE,
  MEETING_IMMINENT_HOURS,
  NEEDS_ATTENTION_NOW,
  STALLED_DAYS,
  type AttentionInputs,
} from "./dealAttention";

const base: AttentionInputs = {
  daysInStage: 1,
  stageLabel: "Discovery",
  assignedTo: "Darryn",
};

describe("dealAttention", () => {
  it("says nothing is wrong with a young, owned deal", () => {
    const a = dealAttention(base);
    expect(a.tone).toBe("steady");
    expect(a.rank).toBe(0);
    expect(a.text).toBe("1 day in Discovery");
  });

  it("puts an unassigned deal above everything else", () => {
    // Even with a meeting in an hour and a stalled clock, nobody owns it.
    const a = dealAttention({
      ...base,
      assignedTo: null,
      daysInStage: 30,
      hoursToMeeting: 1,
      meetingLabel: "2:30 PM",
    });
    expect(a.rank).toBe(100);
    expect(a.text).toContain("Unassigned");
    expect(a.text).toContain("30 days in Discovery");
  });

  it("treats an empty-string owner as unassigned", () => {
    expect(dealAttention({ ...base, assignedTo: "" }).rank).toBe(100);
    expect(dealAttention({ ...base, assignedTo: undefined }).rank).toBe(100);
  });

  it("ranks an imminent meeting above a stalled stage", () => {
    const meeting = dealAttention({
      ...base,
      daysInStage: 40,
      hoursToMeeting: MEETING_IMMINENT_HOURS,
      meetingLabel: "2:30 PM",
    });
    const stalled = dealAttention({ ...base, daysInStage: 40 });
    expect(meeting.rank).toBeGreaterThan(stalled.rank);
    expect(meeting.text).toBe("Meeting at 2:30 PM");
  });

  it("ignores a meeting that has already passed", () => {
    const a = dealAttention({ ...base, hoursToMeeting: -3, meetingLabel: "9:00 AM" });
    expect(a.text).toBe("1 day in Discovery");
    expect(a.rank).toBe(0);
  });

  it("calls a stage stalled only at the threshold", () => {
    expect(dealAttention({ ...base, daysInStage: STALLED_DAYS - 1 }).tone).toBe("soon");
    const stalled = dealAttention({ ...base, daysInStage: STALLED_DAYS });
    expect(stalled.tone).toBe("critical");
    expect(stalled.text).toBe(`Stalled — ${STALLED_DAYS} days in Discovery`);
  });

  it("flags a failing underwriting score, and says the number", () => {
    const a = dealAttention({ ...base, underwritingScore: FAILING_SCORE - 1 });
    expect(a.tone).toBe("critical");
    expect(a.text).toContain(String(FAILING_SCORE - 1));
    expect(a.text).toContain("at risk");
    // A passing score is not news.
    expect(dealAttention({ ...base, underwritingScore: FAILING_SCORE }).rank).toBe(0);
  });

  it("treats a ready activation as an action, not a decoration", () => {
    const a = dealAttention({ ...base, stageLabel: "Go Live Ready", activationReady: true });
    expect(a.tone).toBe("ready");
    expect(a.text).toContain("activation ready");
    expect(a.rank).toBeGreaterThan(0);
  });

  it("mentions an ageing stage before it is stalled", () => {
    const a = dealAttention({ ...base, daysInStage: AGEING_DAYS });
    expect(a.tone).toBe("soon");
    expect(a.text).toBe(`${AGEING_DAYS} days in Discovery`);
  });

  it("never returns a bare number or an empty sentence", () => {
    const cases: AttentionInputs[] = [
      base,
      { ...base, assignedTo: null },
      { ...base, daysInStage: 0 },
      { ...base, daysInStage: 99 },
      { ...base, underwritingScore: 0 },
      { ...base, activationReady: true },
      { ...base, hoursToMeeting: 0.5, meetingLabel: "11:00 AM" },
      { ...base, hoursToMeeting: 0.5, meetingLabel: null },
    ];
    for (const c of cases) {
      const { text } = dealAttention(c);
      expect(text.length).toBeGreaterThan(3);
      expect(text).toMatch(/[a-z]/i);
    }
  });

  it("pluralises the day count", () => {
    expect(dealAttention({ ...base, daysInStage: 1 }).text).toContain("1 day in");
    expect(dealAttention({ ...base, daysInStage: 2 }).text).toContain("2 days in");
    expect(dealAttention({ ...base, daysInStage: 0 }).text).toContain("0 days in");
  });

  it("orders the whole priority ladder as documented", () => {
    const rank = (i: Partial<AttentionInputs>) => dealAttention({ ...base, ...i }).rank;
    const ladder = [
      rank({ assignedTo: null }),
      rank({ hoursToMeeting: 1, meetingLabel: "2:30 PM" }),
      rank({ daysInStage: STALLED_DAYS }),
      rank({ underwritingScore: 10 }),
      rank({ activationReady: true }),
      rank({ daysInStage: AGEING_DAYS }),
      rank({}),
    ];
    expect(ladder).toEqual([...ladder].sort((a, b) => b - a));
    expect(new Set(ladder).size).toBe(ladder.length);
  });
});

describe("NEEDS_ATTENTION_NOW", () => {
  // The mobile Today screen splits the day on this line. These assertions are
  // about which situations a rep sees above the fold, so a change to the
  // ladder that moves one across the line has to change this test too.
  const rank = (i: Partial<AttentionInputs>) => dealAttention({ ...base, ...i }).rank;

  it("puts nobody-owns-it, someone-is-waiting and out-of-time above the line", () => {
    expect(rank({ assignedTo: null })).toBeGreaterThanOrEqual(NEEDS_ATTENTION_NOW);
    expect(rank({ hoursToMeeting: 1, meetingLabel: "2:30 PM" })).toBeGreaterThanOrEqual(NEEDS_ATTENTION_NOW);
    expect(rank({ daysInStage: STALLED_DAYS })).toBeGreaterThanOrEqual(NEEDS_ATTENTION_NOW);
  });

  it("leaves the merely notable below it", () => {
    expect(rank({ underwritingScore: 10 })).toBeLessThan(NEEDS_ATTENTION_NOW);
    expect(rank({ activationReady: true })).toBeLessThan(NEEDS_ATTENTION_NOW);
    expect(rank({ daysInStage: AGEING_DAYS })).toBeLessThan(NEEDS_ATTENTION_NOW);
  });

  it("keeps a healthy deal out of the day entirely", () => {
    expect(rank({})).toBe(0);
  });
});
