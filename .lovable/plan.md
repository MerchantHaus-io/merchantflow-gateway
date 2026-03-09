

## Audit: Integrate PageHeader, StatCard, and EmptyState into Remaining Pages

### Current State

All four pages use `AppLayout` with `pageTitle` prop and ad-hoc inline headers/stat rows. None use the new shared components (`PageHeader`, `StatCard`, `EmptyState`).

| Page | Header | Stats | Empty State |
|------|--------|-------|-------------|
| **Contacts.tsx** | `pageTitle="Contacts"` + inline stat pills | Inline text (`{stats.total} Contacts`, unassigned count) | Plain `<TableCell>` text: "No contacts found" |
| **Accounts.tsx** | `pageTitle="Accounts"` + inline stat text | Inline text (`{totalAccounts} Accounts`, with contacts, active deals) | No explicit empty state (table just renders empty) |
| **MyTasks.tsx** | `pageTitle="My Tasks"` | None | Plain div: "No tasks yet. Create one to get started." |
| **Opportunities.tsx** | Inline `<h1>Opportunities</h1>` with tab toggle | Inline stat pills (Active, in progress, won, lost) | Plain `<TableCell>` text: "No opportunities found" |

### Plan

#### 1. Contacts.tsx
- Add `PageHeader` with `Users` icon, title "Contacts", description with live count, and the "New Contact" button as `actions`
- Remove `pageTitle` from `AppLayout` since PageHeader handles it
- Replace "No contacts found" `<TableCell>` with `<EmptyState icon={Users} title="No contacts found" description="Try adjusting your filters or add a new contact." actionLabel="New Contact" onAction={openNewDialog} size="sm" />`

#### 2. Accounts.tsx
- Add `PageHeader` with `Building2` icon, title "Accounts", description with live count, search + add button as `actions`
- Remove `pageTitle` and `headerActions` from `AppLayout`
- Add `<EmptyState>` when `filteredAccounts.length === 0` inside the table card

#### 3. MyTasks.tsx
- Add `PageHeader` with `CheckCircle2` (or similar task icon) icon, title "My Tasks", description "Manage your assigned tasks and reminders"
- Remove `pageTitle` from `AppLayout`
- Replace the plain "No tasks yet" div with `<EmptyState icon={ClipboardList} title="No tasks yet" description="Create one to get started." size="sm" />`

#### 4. Opportunities.tsx
- Replace the inline `<h1>Opportunities</h1>` + tab toggle with `PageHeader` using `TrendingUp` icon, title "Opportunities", and the All/Archive tab toggle as `actions`
- Replace "No opportunities found" `<TableCell>` with `<EmptyState icon={TrendingUp} title="No opportunities found" description="Adjust your filters or create a new application." size="sm" />`

#### 5. Badge semantic variants sweep
- MyTasks: Change `<Badge variant="outline">24h SLA</Badge>` to `variant="warning"` with `withDot`
- MyTasks: Change `<Badge variant="secondary">` on Application/Contact tags to `variant="muted"`
- Contacts/Accounts: Upgrade any stage badges to use semantic variants matching stage colors
- Opportunities: Same stage badge upgrades

#### Files Modified
- `src/pages/Contacts.tsx`
- `src/pages/Accounts.tsx`
- `src/pages/MyTasks.tsx`
- `src/pages/Opportunities.tsx`

No new files needed. All imports come from existing `PageHeader`, `EmptyState`, and `Badge` components.

