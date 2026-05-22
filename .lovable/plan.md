# Replace `unknown`/`any` casts with proper types

The previous fix used a bulk `unknown → any` sed to unblock the build. The app currently compiles, but type safety was lost across ~60 files. This plan restores proper typing in waves so we don't reintroduce build breakage.

## Current state

- `src/integrations/supabase/types.ts` is the generated source of truth (`Database`, `Tables<>`, `Enums<>`).
- Most components now use `any` for: Supabase query results, catch errors, event payloads, state arrays.
- A small number of legitimate `unknown` casts remain — Proxy in `activeClient.ts`, SSR storage shim, type-bridges for shape-incompatible DB rows.

## Approach

Refactor in 4 waves. After each wave: run `bunx tsc --noEmit`, fix fallout, commit.

### Wave 1 — Shared utilities (low risk, high leverage)

1. Create `src/types/db.ts` re-exporting common row types:
   ```ts
   import type { Tables, Enums } from "@/integrations/supabase/types";
   export type Opportunity   = Tables<"opportunities">;
   export type Account       = Tables<"accounts">;
   export type Contact       = Tables<"contacts">;
   export type Document      = Tables<"opportunity_documents">;
   export type Interaction   = Tables<"client_interactions">;
   export type Campaign      = Tables<"outreach_campaigns">;
   export type CampaignContact = Tables<"outreach_campaign_contacts">;
   // …etc
   ```
2. Add a narrow error helper in `src/lib/friendly-errors.ts`:
   ```ts
   export const errorMessage = (e: unknown): string =>
     e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
   ```
3. Codemod every `catch (err: any) { … err.message }` → `catch (err) { … errorMessage(err) }`.

### Wave 2 — Page-level state arrays (the noisy ones)

Files with `useState<any[]>` / `useState<any>(null)` that map to a single table:

- `OpportunityDetail.tsx` — `emails: Interaction[]`, `documents: Document[]`
- `LiveAccountDetail.tsx` — `previewDoc: PreviewableDocument | null`
- `LiveBilling.tsx` — `GroupedAccount.account/contact` → `Account | null`, `Contact | null`
- `Reports.tsx` — `campaigns: Campaign[]`
- `Outreach.tsx` / `OutreachDetail.tsx` — `Campaign`, `CampaignContact`
- `Accounts.tsx`, `Opportunities.tsx`, `Contacts.tsx` — list rows
- `Calendar.tsx`, `calendar/EventDetailSheet.tsx` — define a local `CalendarEvent` + `Attendee` interface (no DB table)

Replace `any` with these types. Use `?? null` instead of optional-chaining-with-any.

### Wave 3 — Supabase query result casts

For joined queries that don't fit the generated row type, declare a local intersection instead of `as any`:

```ts
type OppWithRelations = Opportunity & {
  account: Account | null;
  contact: Contact | null;
};
const { data } = await supabase.from("opportunities").select("*, account:accounts(*), contact:contacts(*)").returns<OppWithRelations[]>();
```

Apply to: `LiveBilling`, `Opportunities`, `Index`, `Home`, `Accounts`, `OpportunityDetailModal`, hooks under `src/hooks/`.

### Wave 4 — Event handler / payload types

- Realtime: `payload: RealtimePostgresChangesPayload<Tables<"x">>` from `@supabase/supabase-js`.
- Chart `chart.tsx` formatter signatures — use Recharts' `TooltipProps`.
- Quo API responses (`src/lib/api/quo.ts`) — declare interfaces matching the actual JSON.

### Out of scope (intentionally keep `unknown`)

- `activeClient.ts` Proxy generic forwarding.
- SSR `Storage` shim in `impersonationClient.ts`.
- Cross-shape bridge casts (`as unknown as OnboardingWizardState`) where the DB JSONB column legitimately doesn't match the runtime shape — these would need schema work first.
- Edge functions (Deno) — separate pass; their `unknown` in catch blocks is the TS-recommended default.

## Risks

- Joined Supabase queries often have `null` relations that current `any` code accesses unguarded → fixing types will surface real null-deref bugs. We'll add `?.` and fallbacks as they appear.
- `Tables<"…">` keys must match actual table names; if any have been renamed since type regen, regenerate types first.

## Deliverable per wave

- All edits + `bunx tsc --noEmit` clean.
- No new `any` introduced; PR diff should show `any` count decreasing.

Confirm and I'll start with Wave 1.
