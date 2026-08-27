---
target: the pipeline UX
total_score: 14
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-27T23-27-49Z
slug: src-pages-index-tsx
---
Method: dual-agent (A: design review · B: detector + source evidence), isolated and parallel.
Browser inspection not possible: /pipeline is behind Supabase auth with no credentials in this container.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | Drop → nothing moves. `setOpportunities` runs only after the whole await chain (Index.tsx:765); no pending state on the card. |
| 2 | Match System / Real World | 3 | Stage names are good domain language, but "Gateway Setup" is on the board and absent from `PROCESSING_PIPELINE_STAGES`, so a processing deal there shows an empty stage Select. |
| 3 | User Control and Freedom | 0 | No undo on drop. A drag writes the DB, inserts an activity row, and emails the assignee (Index.tsx:712) with no confirmation and no reversal. |
| 4 | Consistency and Standards | 1 | Board sorts `created_at`, the list 200px below sorts `updated_at`. Board silently swallows an illegal drop; the modal toasts an error for the same rule. |
| 5 | Error Prevention | 3 | Real gates exist (underwriting gate, duplicate check, mark-dead AlertDialog, one-outcome guard) — but all post-hoc; no drop target is dimmed during a drag. |
| 6 | Recognition Rather Than Recall | 2 | Mid-drag the rep must recall which stages are illegal for a gateway card, four uwScore bands, three daysInStage bands, and what the gold figure measures. |
| 7 | Flexibility and Efficiency | 1 | Zero tabIndex, zero role, zero key handlers across all four board files. No keyboard path, no bulk select, no search, no persisted filter. |
| 8 | Aesthetic and Minimalist Design | 1 | 15 data points on a 245px card, 13 of 14 text elements under 12px. Emerald carries five meanings, amber six. |
| 9 | Error Recovery | 1 | Illegal drop is rejected by a branch commented `// Silently reject`. The non-blocking duplicate warning ships as a red destructive toast. |
| 10 | Help and Documentation | 1 | Nothing explains the underwriting score, the deal value, the SLA bands, or why most cards are grey. |
| **Total** | | **14/40** | **Poor — structural rework, not polish** |

## Design Specificity Verdict

The logic is deeply specific to merchant payments; the interface is a generic kanban with a gold accent.

Everything that knows this is a payments business lives below the render layer: the underwriting gate, the duplicate-merchant check on leaving discovery, the auto-created gateway card at processor approval, the NMI boarding-ID lookup feeding portal activation, and an expert loss taxonomy. None of it reaches the composition. Ten equal columns, newest-first, express none of the fact that this funnel has three phases with three different owners and three different clocks.

The loudest visual state on the board is a solid emerald plate meaning "the onboarding wizard form is 100% filled in" — form completeness outranks Go Live Ready and outranks SLA-overdue.

Deterministic scan: `detect.mjs --json` on all five files returned `[]`, exit 0. This is a true negative on a rule set that does not cover this surface: the registry holds 59 rules and zero accessibility rules, and the run is additionally DEGRADED (HTML parser modules unavailable, regex fallback). A probe file containing `text-[9px]`, `focus:outline-none`, `h-4 w-4`, `<div onClick>` and drag handlers returned only the two positive controls. The `[]` means the files are free of visual-slop patterns; it says nothing about the defects below.

## Priority Issues

**[P0] A deal in Discovery cannot be dragged past the middle of the funnel.** 10 × 245px + gaps = 2,546px of board. At 1440px with the rail expanded the viewport is 1,176px — 4.6 of 10 columns. There is no edge auto-scroll in `handleDragOver`, so scrolling to reach the target puts the source card off-screen. The board's headline interaction only works for one-column nudges.

**[P0] "Mark as dead" confirms, toasts success, and leaves the card on the board.** `onMarkAsDead` is never passed to `PipelineColumn` (UnifiedPipelineBoard.tsx:221), so the card's handler no-ops while the modal's works. Same word, two outcomes. It also sets `status: 'dead'` with no outcome reason, bypassing the OUTCOME_REASONS taxonomy the modal captures.

**[P1] Every card the rep doesn't own is stripped of the data a rep needs — including the control to claim it.** `isGreyed = !isOwnCard` makes unassigned cards grey too, and the assign popover lives entirely in the non-greyed branch. A new deal lands unassigned and cannot be claimed from the board. `isAdmin` is threaded four levels deep and never read.

**[P1] The board never confirms, never explains, and never lets go.** No optimistic move; silent rejection of illegal drops; no undo, while the drop emails the assignee within seconds; and the duplicate warning that the code comments "don't block, just inform" ships as a destructive toast.

**[P2] The board is buckets, not priorities.** Every column sorts `created_at` desc inside a `no-scrollbar` list. Ordering is inversely correlated with urgency: a 31-day-stalled deal sits at the bottom, below an invisible fold, with its amber/red SLA styling rendered onto a card nobody scrolls to.

## Persona Red Flags

**Power rep, 40 deals/day** — 40 unskippable 2s "LEVEL UP" splashes, fired identically for backward moves; 40 emails; vertical wheel over a column also scrolls the board sideways; Refresh unmounts the page and resets scroll; no bulk select or keyboard; 120 network requests on load (each card fetches calendar_events, validation_reports and profiles independently).

**New rep, week one** — the gold figure has no unit or noun; the UW score has no tooltip; HIGH/MED at 8px have no legend; emerald means five things and amber six; their own first deal is a grey plate they cannot claim; their first illegal drop is answered with silence.

**Rep on an iPad, landscape** — drag-and-drop does not exist at all: touch-drag props are declared and plumbed through both components and never passed by any caller, and HTML5 draggable does not fire on touch. The mobile pager is gated at 768px so it does not render at 1024×768. Every control is hover-revealed. Touch targets: mark-dead 12×12, add-deal 16×16, avatar 20×20, pager dots 6×6.

## Minor Observations

- The list view under the board has no view toggle: its wrapper is `{( … )}`, a conditional with no condition left behind when a toggle was removed.
- "Add Deal" is hardcoded `bg-indigo-600` while `--primary` is crimson.
- `isClosedWon` styling is unreachable from the board — `getOpportunitiesByStage` filters out any deal with an outcome.
- `migrateStage` maps legacy `closed_lost` → `discovery`, so old lost deals resurface at the top of Discovery.
- MEMBER_PALETTE and TEAM_ROSTER disagree: `neil` has no roster member, `xavier` has no palette entry and renders with no colour identity.
- An explicit `sla_status: 'green'` renders the LOW badge with no background or text colour.
- Card fetches never read the `error` field; a failed query is indistinguishable from no data.

## Questions to Consider

- Why is this one board? Gateway-only deals are forbidden from 2 of the 10 columns and have their own seven-stage funnel. Two funnels crammed into one row, reconciled by a silent rejection.
- What if the board were a queue? Every input for "what do I touch next" is already computed per card and then discarded by a created_at sort.
- Underwriting is not the rep's column — deals there wait on someone else's clock. Why is it rendered identically to columns the rep controls?
- Is a 245px card the wrong container for 15 data points, or the wrong container for 4?
