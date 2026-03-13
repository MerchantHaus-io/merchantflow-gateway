

## Grey Out Unassigned Cards on Pipeline

### What Changes

Cards on the pipeline board that are **not assigned to the current user** will render in a muted/greyed-out state, showing only:
- Company name (greyed)
- Contact/applicant name (greyed)
- Assignee name pill (in their team colour)

Admins and the card's assignee see the full card as normal.

### Technical Approach

**1. Pass `isAdmin` to OpportunityCard**

- In `src/pages/Index.tsx`: import `useUserRole`, get `isAdmin`, pass it through `UnifiedPipelineBoard` -> `PipelineColumn` -> `OpportunityCard`.
- Add `isAdmin?: boolean` prop to `UnifiedPipelineBoardProps`, `PipelineColumnProps`, and `OpportunityCardProps`.

**2. Determine greyed-out state in OpportunityCard**

```
const isOwnCard = opportunity.assigned_to === currentUser;
const isGreyed = !isOwnCard && !isAdmin && !!opportunity.assigned_to;
```

Unassigned cards (no assignee) remain normal for everyone.

**3. Render greyed-out variant**

When `isGreyed` is true:
- Card wrapper: `opacity-50 bg-muted border-l-muted-foreground/20` (no team colour border)
- Show only: account name, contact name, and assignee pill
- Hide: service badge (GW/CC), referral source, deal value, SLA badge, days-in-stage, avatar popover, delete button
- Assignee pill always visible and rendered in the assignee's team colour (not greyed)

When `isGreyed` is false (own card or admin): render exactly as today, no changes.

**4. Files Modified**

| File | Change |
|------|--------|
| `src/pages/Index.tsx` | Import `useUserRole`, pass `isAdmin` to board |
| `src/components/UnifiedPipelineBoard.tsx` | Accept + forward `isAdmin` prop |
| `src/components/PipelineColumn.tsx` | Accept + forward `isAdmin` prop |
| `src/components/OpportunityCard.tsx` | Accept `isAdmin`, compute `isGreyed`, conditionally render simplified card |

