# Shape the card modals — OpportunityDetailModal redesign

## Goal
Redesign the deal card modal (`OpportunityDetailModal.tsx` + `opportunity-detail/*` sub-panels) into a cleaner, magazine-styled detail surface. Locked taste from your picks:

- **Palette — Slate Editorial:** paper `#f7f7f5`, ink `#1a1d23`, accent blue `#2563eb`, muted `#6b7280`
- **Type — Terminal Mono:** JetBrains Mono for data/labels/headers, Work Sans for body
- **Layout — Magazine Detail:** editorial hero header (deal name, stage, value, owner as a masthead), asymmetric content blocks beneath

## Process
1. Capture the current modal (screenshot) as the visual anchor.
2. Generate **3 rendered design directions** with the locked palette/type/layout held constant — directions vary only in composition, density, and hierarchy (e.g. masthead-heavy editorial vs. dense ledger vs. airy dossier).
3. You pick a direction; only then do I implement it.

## Implementation scope (after pick)
- `src/components/OpportunityDetailModal.tsx` header → magazine masthead: deal name in JetBrains Mono, stage path, value strip, gateway/processing badge, owner/assignee — no color blocks, hairline dividers only.
- Content region → asymmetric magazine blocks: primary column (underwriting, notes, tasks) + narrower sidebar (documents, details), using the locked type scale.
- Design tokens: add Slate Editorial values to `src/index.css` / Tailwind config as semantic tokens (no hardcoded hex in components); dark-mode-safe.
- Keep all existing behavior: stage select, assignment, auto-save, underwriting panels, blockers, mobile `MobileDealScreen` parity — presentation only, no business-logic changes.
- Scope guardrail: card modal only — pipeline board, kanban cards, and other dialogs untouched.

## Technical notes
- Files touched: `OpportunityDetailModal.tsx`, selected `opportunity-detail/*` panels, `src/index.css`, `tailwind.config.ts`. Expected under 15 files.
- Verification: `npx tsc --noEmit -p tsconfig.app.json`, `npx vitest run`, `npm run build`, plus a visual pass in the preview at desktop + mobile widths.
