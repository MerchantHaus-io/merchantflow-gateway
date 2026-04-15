

# Universal Back Navigation

## Problem
Detail pages (OpportunityDetail, LiveAccountDetail, OutreachDetail, etc.) hardcode their back destination (e.g., always goes to `/opportunities`). If you arrived from Contacts or Accounts, clicking "Back" takes you to the wrong place.

## Solution
Two changes:

### 1. AppLayout — Add a back button to the page header
When `pageTitle` is rendered in the gradient-header bar, add a back arrow button before the title that calls `navigate(-1)` (browser history back). This gives every page using `AppLayout` with a `pageTitle` an automatic back button. Exclude the homepage (`/` and `/dashboard`) since there's nowhere to go back to.

### 2. Detail pages — Replace hardcoded routes with `navigate(-1)`
Update these pages to use `navigate(-1)` instead of hardcoded paths for their back buttons:

| Page | Current target | Change to |
|------|---------------|-----------|
| `OpportunityDetail.tsx` | `/opportunities` | `navigate(-1)` |
| `LiveAccountDetail.tsx` | `/live-billing` | `navigate(-1)` |
| `OutreachDetail.tsx` | `/outreach` | `navigate(-1)` |

Error/redirect navigations (e.g., "opportunity not found → go to /opportunities") stay hardcoded — those are fallbacks, not user-initiated back actions.

### Technical detail
- Uses browser history stack via React Router's `navigate(-1)`
- Fallback: if there's no history (direct URL visit), `navigate(-1)` is a no-op in the browser — we'll add a guard that checks `window.history.length > 1` before going back, otherwise navigates to `/`
- The AppLayout back button only shows on inner pages, not on top-level dashboard

### Files changed
- `src/components/AppLayout.tsx` — back button in gradient-header
- `src/pages/OpportunityDetail.tsx` — replace hardcoded `/opportunities` back buttons with `navigate(-1)`
- `src/pages/LiveAccountDetail.tsx` — replace hardcoded `/live-billing` back buttons
- `src/pages/OutreachDetail.tsx` — replace hardcoded `/outreach` back button

