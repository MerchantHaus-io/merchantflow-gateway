

# Full-Screen Opportunity Detail View

## Summary
Replace the current `<Dialog>`-based `OpportunityDetailModal` with a full-screen overlay using a three-column layout matching the approved mockup. All 1836 lines of business logic, auto-save, stage gates, outcome handling, portal activation, and alert dialogs are preserved — only the layout wrapper and navigation change.

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│  STICKY HEADER                                           │
│  [← Back]  Company Name  ●Type  Stage▾  Owner▾           │
│  [Edit/Save] [Outcome] [Switch] [Download] [Delete] ...  │
│  StagePath stepper (horizontal)                          │
├────────────┬─────────────────────────┬───────────────────┤
│  LEFT      │  CENTER                 │  RIGHT            │
│  SIDEBAR   │  PRIMARY                │  CONTEXT          │
│  (260px)   │  (flex-1, scrollable)   │  (320px, scroll)  │
│            │                         │                   │
│  Quick     │  Overview / UW /        │  Activity feed    │
│  Info      │  Notes / Docs /         │  (always visible) │
│  Card      │  Details                │                   │
│            │                         │  Status/Blocker   │
│  Section   │                         │  (inline)         │
│  Nav       │                         │                   │
│  (labeled) │                         │  Comments         │
│            │                         │  (inline)         │
│  Wizard    │                         │                   │
│  Progress  │                         │                   │
└────────────┴─────────────────────────┴───────────────────┘

MOBILE: single column, header compact, left nav → pills, right panel → tab
```

## Files to Create

### 1. `src/components/opportunity-detail/DetailSidebar.tsx`
- **Quick Info card**: Company name, contact name, phone (click-to-call), email, deal value, website link
- **Section navigation**: Labeled text links with icons and active left-border accent (replaces IconRail's tiny icons)
- **Wizard progress**: Four mini progress bars (Business, Legal, Processing, Documents) with percentage labels
- Receives `opportunity`, `resolvedAccount`, `resolvedContact`, `wizardSectionProgress`, `activeSection`, `onSelect` as props

### 2. `src/components/opportunity-detail/DetailRightPanel.tsx`
- **Activity feed**: Renders `<ActivitiesTab>` in compact scrollable area (always visible, no tab switch needed)
- **Status/Blocker**: Renders `<StatusBlockerFloating>` inline instead of as a floating popover
- **Comments**: Renders `<CommentsTab>` inline below activity
- Receives `opportunityId`, `opportunity`, `wizardProgress`, `onUpdate`

## Files to Modify

### 3. `src/components/OpportunityDetailModal.tsx` — Major restructure
**What changes:**
- Remove `<Dialog>` / `<DialogContent>` wrapper → replace with `fixed inset-0 z-50 bg-background` overlay
- Remove `isMaximized` state (always full-screen now)
- Remove `<IconRail>` usage → use new `<DetailSidebar>` on desktop
- Move Activity tab content and Comments to `<DetailRightPanel>` (remove `activity` from `MODAL_SECTIONS`)
- Move `StatusBlockerFloating` from header area into `<DetailRightPanel>`
- Extract header into a dedicated sticky section with `← Back` button calling `onClose()`
- `StagePath` sits permanently below header (not conditional on active section)
- Live badge overlay repositioned for full-screen context
- Slide-in animation: `translate-x-full → translate-x-0` on mount

**What stays identical (no logic changes):**
- All state variables and handlers (stage change, outcome, owner, edit/save, auto-save, portal, delete, mark dead, reactivation, pipeline switch, download, service type change)
- All `AlertDialog` instances (reactivate, dead, delete, pipeline switch, request deletion)
- `GameSplash` death animation
- All sub-panels (`ApplicationProgress`, `BeneficialOwners`, `OverviewUnderwritingSummary`, `AIValidatePanel`, `NotesSection`, `DocumentsTab`)
- `InfoItem` and `EditField` helper components
- Keyboard shortcuts (adjusted: sections reduced from 6 to 5 since activity moves to right panel)
- Wizard field management, resolved account/contact logic, auto-save with cross-sync

**Mobile adaptation:**
- Three columns collapse to single column with full width
- Left sidebar becomes horizontal scrollable pills below the header
- Right panel (Activity/Comments/Status) becomes an additional tab in the pill nav
- Header actions collapse into an overflow dropdown menu
- Stage path remains horizontally scrollable with existing touch drag support

### 4. `src/components/opportunity-detail/IconRail.tsx` — Keep file, no longer imported by the modal
- File remains for potential reuse elsewhere but is replaced by `DetailSidebar` in the opportunity detail view

## No Changes Required
- `src/pages/Index.tsx`, `src/pages/Opportunities.tsx`, `src/components/UnifiedPipelineBoard.tsx` — same props interface (`opportunity`, `onClose`, `onUpdate`, etc.), no changes needed
- All sub-panel components remain untouched
- No database changes
- No edge function changes

## Animation
- Mount: `translate-x-full → translate-x-0` with 200ms ease-out
- Unmount: `translate-x-0 → translate-x-full` with 150ms ease-in
- Backdrop: fade in/out synchronized

