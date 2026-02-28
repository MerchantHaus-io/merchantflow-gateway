import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Cloud, Bug, Zap, Wrench, AlertTriangle, Lightbulb, ClipboardCopy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AuditEntry {
  date: string;
  prompt: string;
  items: {
    id: string;
    type: "bug" | "missing" | "improvement";
    title: string;
    description: string;
    expectedOutcome: string;
  }[];
}

const typeConfig = {
  bug: { label: "Bug", icon: Bug, className: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400" },
  missing: { label: "Missing", icon: AlertTriangle, className: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400" },
  improvement: { label: "Improvement", icon: Lightbulb, className: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400" },
};

const auditEntries: AuditEntry[] = [
  {
    date: "2026-02-28",
    prompt: `You are working on the Ops Terminal (Merchant Haus Onboarding Portal), a React + Vite + TypeScript SPA using shadcn/ui, Supabase, React Router v6, and TanStack React Query. Fix the following bugs, restore missing functionality, and apply improvements. After each fix, confirm the expected outcome is met.

---

BUG 1 — /chat route renders the wrong component
File: src/App.tsx (line 94)
Problem: The /chat route maps to <Index /> instead of the <Chat /> component. Chat.tsx exists at src/pages/Chat.tsx but is never imported.
Fix: Import Chat from "./pages/Chat" and change the route element to <Chat />.
Expected outcome: Navigating to /chat renders the Chat page, not the dashboard.

---

BUG 2 — "New Application" sidebar button fails silently when no handler is passed
File: src/AppSidebar.tsx (line 167)
Problem: The onClick calls onNewApplication which is an optional prop. When undefined, clicking does nothing with no user feedback.
Fix: Add a fallback that navigates to /opportunities?new=true when onNewApplication is not provided (same pattern used in MegaMenuHeader.tsx line 187).
Expected outcome: Clicking "New Application" always either opens the modal or navigates to the opportunities page with new=true query param.

---

BUG 3 — Non-functional contacts dropdown in Accounts page
File: src/pages/Accounts.tsx (line ~346)
Problem: The Select component for contacts uses onValueChange={() => {}} — an empty handler that ignores user selection.
Fix: Change the handler to navigate to the selected contact's detail or open a contact sheet, or at minimum set the selected value and show contact details.
Expected outcome: Selecting a contact from the dropdown performs a visible action (e.g., navigating to /contacts?highlight=<id> or showing contact info).

---

BUG 4 — Documents page: partial delete leaves orphaned database records
File: src/pages/Documents.tsx (lines ~212-231)
Problem: If the storage file is deleted successfully but the subsequent database delete fails, the file is gone but the DB record remains, creating a ghost entry.
Fix: Reverse the operation order — delete the database record first, then delete from storage. If storage delete fails, the record is already gone which is the safer inconsistency. Alternatively, wrap both in a try/catch with rollback logic.
Expected outcome: Deleting a document either fully succeeds or fully fails without leaving orphaned records.

---

MISSING 1 — Admin pages not accessible from sidebar navigation
File: src/AppSidebar.tsx
Problem: The sidebar only shows "Deletion Requests" for admins in the footer. Missing links for: /admin/data-export, /admin/web-submissions, /admin/analytics.
Fix: Add a collapsible "Admin" section to the sidebar (similar to the Tools section) that appears only when isAdmin is true, containing all four admin routes.
Expected outcome: Admin users see an "Admin" collapsible section in the sidebar with links to Deletion Requests, Data Export, Web Submissions, and Analytics.

---

MISSING 2 — /live-billing and /supported-processors not in any navigation menu
Files: src/AppSidebar.tsx, src/components/MobileBottomNav.tsx
Problem: These routes exist in App.tsx but are only accessible via the MegaMenuHeader or by typing the URL directly. They are absent from the sidebar and mobile nav.
Fix: Add "Live & Billing" to the sidebar Reports section or as a standalone item. Add "Supported Processors" to the Tools section in all three nav components.
Expected outcome: Users can access Live & Billing and Supported Processors from the sidebar and mobile nav menus.

---

MISSING 3 — CsvImport has no error handling on duplicate-detection queries
File: src/pages/CsvImport.tsx (lines ~57-58)
Problem: Queries for existing accounts/contacts don't check for errors. If they fail, duplicate detection silently breaks.
Fix: Add error checks after each query. If either fails, show a warning toast and skip duplicate detection rather than silently proceeding.
Expected outcome: If duplicate-detection queries fail, the user sees a warning toast and import continues without duplicate checking rather than silently missing duplicates.

---

IMPROVEMENT 1 — Replace window.confirm with AlertDialog for account deletion
File: src/pages/Accounts.tsx (line ~163)
Problem: Uses the browser's native window.confirm() dialog for account deletion, which is visually inconsistent with the rest of the app that uses shadcn AlertDialog.
Fix: Replace window.confirm with an AlertDialog component (same pattern as used in Settings.tsx and OpportunityDetail.tsx).
Expected outcome: Account deletion uses a styled AlertDialog matching the app's design system.

---

IMPROVEMENT 2 — Navigation inconsistencies between sidebar, mega menu, and mobile nav
Files: src/AppSidebar.tsx, src/components/MegaMenuHeader.tsx, src/components/MobileBottomNav.tsx
Problem: Each navigation component defines its own item arrays independently. The mega menu includes "Data Export" in Tools but the sidebar doesn't. The mobile nav includes "NMI Payments" but the sidebar doesn't. Terminal Updates is missing from mobile nav tools.
Fix: Create a shared navigation config file (e.g., src/config/navigation.ts) that all three components import from, ensuring consistency.
Expected outcome: All navigation menus show the same set of links, and future changes only need to be made in one place.

---

IMPROVEMENT 3 — MyTasks page: no error handling on data fetch
File: src/pages/MyTasks.tsx (lines ~74-84)
Problem: Fetching opportunities and contacts doesn't handle errors. Users see empty dropdowns without knowing if it's a failure or just no data.
Fix: Add error handling that shows a toast notification when data fails to load, and display an error state in the dropdowns.
Expected outcome: If data loading fails, users see a toast notification and the UI shows an error state instead of appearing empty.

---

IMPROVEMENT 4 — Add loading and error states to all Supabase queries
Files: Multiple pages (Contacts.tsx, Accounts.tsx, MyTasks.tsx)
Problem: Several pages don't display error states when Supabase queries fail. They only show loading skeletons or nothing.
Fix: Add isError/error handling from useQuery and display a retry-able error card when queries fail.
Expected outcome: When data loading fails, users see a clear error message with a retry button instead of a blank page or infinite loading.`,
    items: [
      {
        id: "bug-1",
        type: "bug",
        title: "/chat route renders wrong component",
        description: "The /chat route in App.tsx (line 94) maps to <Index /> instead of the existing <Chat /> component. Chat.tsx exists but is never imported, making the chat page completely inaccessible.",
        expectedOutcome: "Navigating to /chat renders the Chat page, not the dashboard.",
      },
      {
        id: "bug-2",
        type: "bug",
        title: "\"New Application\" sidebar button fails silently",
        description: "In AppSidebar.tsx (line 167), onClick calls onNewApplication which is optional. When undefined, clicking does nothing — no navigation, no feedback.",
        expectedOutcome: "Clicking \"New Application\" always opens a modal or navigates to /opportunities?new=true.",
      },
      {
        id: "bug-3",
        type: "bug",
        title: "Non-functional contacts dropdown in Accounts",
        description: "Accounts.tsx uses onValueChange={() => {}} on the contacts Select — an empty handler that ignores user input entirely.",
        expectedOutcome: "Selecting a contact from the dropdown performs a visible action.",
      },
      {
        id: "bug-4",
        type: "bug",
        title: "Document delete can leave orphaned database records",
        description: "Documents.tsx deletes the storage file first, then the DB record. If DB delete fails, the file is gone but a ghost record remains.",
        expectedOutcome: "Deleting a document fully succeeds or fully fails without orphaned records.",
      },
      {
        id: "missing-1",
        type: "missing",
        title: "Admin pages not accessible from sidebar",
        description: "Only \"Deletion Requests\" appears in the sidebar for admins. Data Export, Web Submissions, and Analytics are completely hidden from sidebar navigation.",
        expectedOutcome: "Admin users see an \"Admin\" collapsible section in the sidebar with all admin routes.",
      },
      {
        id: "missing-2",
        type: "missing",
        title: "Live & Billing and Supported Processors not in sidebar or mobile nav",
        description: "These routes exist in App.tsx but are absent from the sidebar and mobile navigation. Only accessible via MegaMenuHeader or direct URL.",
        expectedOutcome: "Users can access these pages from all navigation menus.",
      },
      {
        id: "missing-3",
        type: "missing",
        title: "CSV Import has no error handling on duplicate-detection queries",
        description: "CsvImport.tsx queries for accounts/contacts don't check for errors. If queries fail, duplicate detection silently breaks.",
        expectedOutcome: "Failed queries show a warning toast and import proceeds without duplicate checking.",
      },
      {
        id: "improve-1",
        type: "improvement",
        title: "Replace window.confirm with AlertDialog for account deletion",
        description: "Accounts.tsx uses browser's native window.confirm() for deletion, inconsistent with the rest of the app which uses shadcn AlertDialog.",
        expectedOutcome: "Account deletion uses a styled AlertDialog matching the app's design system.",
      },
      {
        id: "improve-2",
        type: "improvement",
        title: "Consolidate navigation config across all menus",
        description: "Sidebar, MegaMenuHeader, and MobileBottomNav each define their own nav arrays independently, causing inconsistencies (e.g., Data Export in mega menu but not sidebar).",
        expectedOutcome: "All navigation menus share a single source of truth and stay in sync.",
      },
      {
        id: "improve-3",
        type: "improvement",
        title: "Add error handling to MyTasks data fetching",
        description: "MyTasks.tsx fetches opportunities and contacts without error handling. Users see empty dropdowns without knowing if it's a failure or empty data.",
        expectedOutcome: "Failed data loads show a toast notification and error state in the UI.",
      },
      {
        id: "improve-4",
        type: "improvement",
        title: "Add loading and error states to all Supabase queries",
        description: "Several pages (Contacts, Accounts, MyTasks) don't display error states when Supabase queries fail — only loading skeletons or nothing.",
        expectedOutcome: "Failed queries show a clear error message with a retry button.",
      },
    ],
  },
];

export default function NetlifyHub() {
  const handleCopyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    toast.success("Prompt copied to clipboard");
  };

  return (
    <AppLayout pageTitle="Netlify">
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Cloud className="h-6 w-6 text-[#00AD9F]" />
            <h1 className="text-2xl font-bold tracking-tight">Netlify</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Deployment audit log — bugs found, fixes needed, and improvements suggested. Copy the prompt to action them.
          </p>
        </div>

        <Separator />

        {auditEntries.map((entry) => (
          <div key={entry.date} className="space-y-6">
            {/* Date heading + copy prompt */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                  Audit — {entry.date}
                </h2>
                <Badge variant="outline" className="text-xs">
                  {entry.items.length} items
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyPrompt(entry.prompt)}
                className="gap-1.5"
              >
                <ClipboardCopy className="h-4 w-4" />
                Copy Fix Prompt
              </Button>
            </div>

            {/* Summary counts */}
            <div className="flex gap-3 flex-wrap">
              {(["bug", "missing", "improvement"] as const).map((type) => {
                const count = entry.items.filter((i) => i.type === type).length;
                if (count === 0) return null;
                const config = typeConfig[type];
                const Icon = config.icon;
                return (
                  <div key={type} className="flex items-center gap-1.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {count} {config.label}{count > 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Items list */}
            <div className="space-y-3">
              {entry.items.map((item) => {
                const config = typeConfig[item.type];
                const Icon = config.icon;
                return (
                  <Card key={item.id} className="transition-colors hover:bg-muted/30">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{item.title}</span>
                            <Badge variant="outline" className={config.className + " text-xs"}>
                              {config.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {item.description}
                          </p>
                        </div>
                      </div>
                      <div className="ml-11 flex items-start gap-2 bg-muted/50 rounded-lg p-3">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expected Outcome</span>
                          <p className="text-sm text-foreground mt-0.5">{item.expectedOutcome}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Collapsible full prompt */}
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  Full Fix Prompt
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-lg p-4 max-h-64 overflow-y-auto font-mono leading-relaxed">
                    {entry.prompt}
                  </pre>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopyPrompt(entry.prompt)}
                    className="absolute top-2 right-2 gap-1.5"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
