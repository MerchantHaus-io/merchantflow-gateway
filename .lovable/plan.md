## Goal

Make the **Pricing Plan** (Flat Rate vs Interchange+) and **Gateway Tier** (Foundation / Growth / Scale) first-class fields on every opportunity — auto-derived from monthly volume, editable, and visible everywhere an opportunity appears.

## Tier rule (from monthly volume)

| Monthly Volume | Tier |
|---|---|
| ≤ $50,000 | Foundation |
| $50,001 – $100,000 | Growth |
| > $100,000 | Scale |

(Enterprise stays a manual override only — not auto-assigned.)

## What to build

### 1. Database — add two fields to `opportunities`
- `pricing_plan` text — `flat_rate` | `interchange_plus` | null
- `gateway_tier` text — `foundation` | `growth` | `scale` | `enterprise` | null
- Backfill from related `applications.pricing_plan` and `merchants.monthly_volume` where available.

### 2. Shared helper
`src/lib/pricing-tier.ts` exporting `tierFromVolume(monthlyVolume)` and label/color maps for both fields, reused everywhere.

### 3. Auto-population on creation
- **Web submission → opportunity conversion** (`WebSubmissions.tsx` / submit-merchant-application edge function): copy `pricing_plan` from the application and compute `gateway_tier` from `monthly_volume`.
- **Manual new opportunity** (`NewApplicationModal.tsx`): when a monthly volume is entered, auto-fill `gateway_tier` (still editable).

### 4. Auto-recompute on volume change
When a user edits `monthly_volume` on an opportunity/merchant and `gateway_tier` hasn't been manually overridden, recompute. (Track via a simple `gateway_tier_locked` flag — or keep it simple and always recompute unless user explicitly picks Enterprise.)

### 5. Surface the fields everywhere

| Location | What to show |
|---|---|
| `OpportunityCard` (kanban + list) | Two compact badges: tier (color-coded) + pricing plan abbreviation (`IC+` / `Flat`) |
| `OpportunityDetailModal` / `OpportunityDetail` header | Both badges next to stage path; editable in the right-side panel |
| `Opportunities.tsx` table view | New "Tier" and "Plan" columns, sortable + filterable |
| `LiveBilling.tsx` / `LiveAccountDetail.tsx` | Show on closed-won/live accounts so billing can confirm pricing |
| `Accounts.tsx` detail | Show on each related opportunity row |

### 6. Edit affordance
On the opportunity detail right panel, add a small "Pricing" section with:
- Pricing Plan select (Flat Rate / Interchange+)
- Gateway Tier select (Foundation / Growth / Scale / Enterprise) with "auto from volume" hint

## Visual treatment (matches existing dark-luxury-tech badge system)

- **Foundation** — slate badge
- **Growth** — emerald badge (the "popular" tier)
- **Scale** — violet badge
- **Enterprise** — gold/amber badge
- **Flat Rate** — neutral outline
- **Interchange+** — primary-tinted

## Out of scope

- Add-on selections (Kount, Level III, etc.) — not requested here.
- Changing the Quote Generator math.
- Touching merchant-portal pricing display.

## Technical notes

- Migration adds 2 nullable text columns + a CHECK-style validation trigger (per project rule against immutable CHECK constraints).
- Backfill SQL: `UPDATE opportunities o SET pricing_plan = a.pricing_plan FROM applications a WHERE …` matched via account email/name, plus volume-based tier calc.
- Types regenerate automatically after migration.
- All UI uses semantic tokens from `index.css` — no hardcoded colors.
