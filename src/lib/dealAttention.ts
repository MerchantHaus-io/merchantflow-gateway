/**
 * What a deal needs, in one sentence.
 *
 * The card used to render up to fifteen data points and leave the rep to
 * assemble the meaning: an amber chip could be a meeting within two hours, a
 * middling underwriting score, a stage sitting a week, or an SLA band, and
 * nothing on the card said which. Colour was the carrier, and it carried five
 * or six different things at once.
 *
 * This decides once, in priority order, and returns prose. The tone only
 * reinforces the sentence — a rep who cannot distinguish the colours still
 * reads the same information. The rank drives the "needs you today" queue, so
 * the queue and the card can never disagree about which deals are urgent.
 */

export type AttentionTone = "critical" | "soon" | "ready" | "steady";

export interface DealAttention {
  tone: AttentionTone;
  /** Complete on its own. Never a bare number, never a bare colour. */
  text: string;
  /** Higher sorts first. 0 means the deal is not asking for anything. */
  rank: number;
}

export interface AttentionInputs {
  /** Whole days since the deal entered its current stage. */
  daysInStage: number;
  /** Human stage name, e.g. "Underwriting". */
  stageLabel: string;
  assignedTo?: string | null;
  /** Hours until the next confirmed meeting; null when there is none. */
  hoursToMeeting?: number | null;
  /** Rendered meeting time, e.g. "2:30 PM". */
  meetingLabel?: string | null;
  underwritingScore?: number | null;
  /** Portal activation is available and unsent. */
  activationReady?: boolean;
}

/**
 * The line between "now" and "later" on the mobile Today screen.
 *
 * Named here rather than as a bare number in the view, because it is a
 * statement about this ladder: at or above it are the things that are already
 * going wrong or about to — nobody owns it, someone is expecting a call, or
 * the clock has run out. Reordering the ladder without moving this line would
 * silently reclassify a rep's day.
 */
export const NEEDS_ATTENTION_NOW = 80;

/** A meeting this close is the most actionable thing on a rep's board. */
export const MEETING_IMMINENT_HOURS = 2;
/** Past this, a stage is stalled rather than simply in progress. */
export const STALLED_DAYS = 14;
/** Past this, a stage is worth a second look. */
export const AGEING_DAYS = 7;
/** Below this, underwriting is a real risk to the deal, not a note. */
export const FAILING_SCORE = 40;

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export function dealAttention(input: AttentionInputs): DealAttention {
  const {
    daysInStage,
    stageLabel,
    assignedTo,
    hoursToMeeting,
    meetingLabel,
    underwritingScore,
    activationReady,
  } = input;

  // Nobody owns it, so nobody is working it. Outranks everything else because
  // every other line describes work someone is already doing.
  if (!assignedTo) {
    return {
      tone: "critical",
      text: `Unassigned — ${days(daysInStage)} in ${stageLabel}`,
      rank: 100,
    };
  }

  if (hoursToMeeting != null && hoursToMeeting >= 0 && hoursToMeeting <= MEETING_IMMINENT_HOURS) {
    return {
      tone: "soon",
      text: meetingLabel ? `Meeting at ${meetingLabel}` : "Meeting within the hour",
      rank: 90,
    };
  }

  if (daysInStage >= STALLED_DAYS) {
    return {
      tone: "critical",
      text: `Stalled — ${days(daysInStage)} in ${stageLabel}`,
      rank: 80,
    };
  }

  if (underwritingScore != null && underwritingScore < FAILING_SCORE) {
    return {
      tone: "critical",
      text: `Underwriting score ${Math.round(underwritingScore)} — at risk`,
      rank: 70,
    };
  }

  // Good news, but still an action: someone has to send it.
  if (activationReady) {
    return { tone: "ready", text: "Approved — activation ready to send", rank: 60 };
  }

  if (daysInStage >= AGEING_DAYS) {
    return {
      tone: "soon",
      text: `${days(daysInStage)} in ${stageLabel}`,
      rank: 50,
    };
  }

  if (hoursToMeeting != null && hoursToMeeting >= 0 && meetingLabel) {
    return { tone: "steady", text: `Meeting ${meetingLabel}`, rank: 20 };
  }

  return {
    tone: "steady",
    text: `${days(daysInStage)} in ${stageLabel}`,
    rank: 0,
  };
}
