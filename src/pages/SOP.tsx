import { useState, useCallback } from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { ChevronDown, Download } from "lucide-react";
import { UnderwritingChecklist } from "@/components/sop/UnderwritingChecklist";
import { TeamOrganogram } from "@/components/sop/TeamOrganogram";
import { SuggestEditButton, SOPReviewPanel } from "@/components/sop/SOPChangeRequest";
import {
  MessageSquare,
  Shield,
  HelpCircle,
  Activity,
  Copy,
  Check,
  ExternalLink,
  Lock,
  CheckSquare,
  ShieldCheck,
  ArrowRight,
  Phone,
  FileText,
  Search,
  ClipboardCheck,
  CheckCircle,
  Settings,
  Zap,
  Rocket,
  Trophy,
  XCircle,
  AlertTriangle,
  Clock,
  Users,
  Mail,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AppLayout } from "@/components/AppLayout";
import {
  NMI_SCHEDULE_A_RATES,
  NMI_REVENUE_ELIGIBLE_FEES,
  NMI_NON_REVENUE_FEES,
  NMI_GATEWAY_FEATURES,
  NMI_ONE_TIME_FEES,
} from "@/config/quoteSchedule";

const SOP = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleDownloadPdf = useCallback(() => {
    setIsPrinting(true);
    toast.info("Preparing PDF — your browser print dialog will open shortly…");
    // Small delay so collapsibles can expand and toast shows
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 400);
  }, []);
  const [variantSelection, setVariantSelection] = useState<Record<string, string>>({
    step1: "standard",
    step1_2: "standard",
    step2: "standard",
    step3: "standard",
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleVariantChange = (stepKey: string, variantKey: string) => {
    setVariantSelection((prev) => ({
      ...prev,
      [stepKey]: variantKey,
    }));
  };

  const generateArchitectureDoc = useCallback(() => {
    return `# MerchantHaus CRM — Architecture & Technical Reference
## Confidential — Internal Use Only
---

## 1. Technology Stack

### Frontend
| Component | Technology |
|-----------|-----------|
| Language | TypeScript (strict mode) |
| Framework | React 18 (SPA) |
| Build Tool | Vite |
| Styling | Tailwind CSS + tailwindcss-animate |
| UI Components | shadcn/ui (Radix primitives) |
| State Management | React Query (TanStack) + React Context |
| Routing | React Router v6 |
| Forms | React Hook Form + Zod validation |
| Charts | Recharts |
| Animation | Framer Motion |
| Mobile | Capacitor (Android wrapper) |

### Backend (Lovable Cloud / Supabase)
| Component | Technology |
|-----------|-----------|
| Database | PostgreSQL (managed) |
| Authentication | Supabase Auth (email + password) |
| API | Auto-generated REST + Realtime WebSockets |
| Edge Functions | Deno runtime (serverless) |
| File Storage | Private buckets with signed URLs |
| Security | Row-Level Security (RLS) on all tables |
| Encryption | AES-256-GCM for PII (server-side) |

### SaaS Ecosystem
Resend (email), Netlify (hosting), GitHub (source control), OpenPhone (telephony via Quo API), Google Workspace, Gemini AI (via Lovable AI gateway), Lovable (development platform)

---

## 2. Authentication & User Roles

### Auth Flow
- Email + password sign-in (no anonymous signups)
- Email verification required before first login
- Password reset via email link → /update-password
- Force-password-change on first login (admin-triggered)
- Session tracking in \`user_sessions\` table

### Role Types

#### Admin (app_role: 'admin')
- Full CRUD on all data
- Master data exports (ZIP of all tables)
- User management and channel administration
- Deletion request approval
- Database schema exports
- **Users:** admin@merchanthaus.io, onboarding@merchanthaus.io

#### User (app_role: 'user')
- Pipeline management and task creation
- Chat & direct messages
- Document upload and contact editing
- Cannot manage roles, approve deletions, or export master data
- **Users:** support@merchanthaus.io, sales@merchanthaus.io, taryn@merchanthaus.io

### Access Control Architecture
- **Allowlist:** Only 5 authorized emails can authenticate (\`ALLOWED_EMAILS\` constant + \`isEmailAllowed()\` utility)
- **RLS:** All tables enforce \`auth.uid() IS NOT NULL\` for read/write
- **Admin check:** \`is_admin_email()\` SQL function (security definer)
- **Role check:** \`has_role(uuid, app_role)\` SQL function — separate \`user_roles\` table (never stored on profiles)
- **Public forms:** INSERT-only policies (no \`.select()\`) for merchant applications & consents
- **Public route isolation:** Internal-only widgets (Quo Dialler, call/message toasts, command palette, keyboard shortcuts) are automatically hidden on all public routes via the \`InternalWidgets\` guard component

### Public Routes (No Authentication Required)
| Route | Purpose |
|-------|---------|
| \`/auth\` | Sign-in / sign-up |
| \`/login\` | Alternative login entry |
| \`/forgot-password\` | Password reset request |
| \`/update-password\` | Password reset completion |
| \`/apply\` | Simplified merchant inquiry form |
| \`/contact\` | Public contact form (branded with Merchant Haus logo, honeypot spam protection, auto-redirect to merchanthaus.io on success) |
| \`/merchant-apply\` | Full 7-step merchant application wizard |
| \`/terms-processing\` | Processing terms & conditions |

---

## 3. Data Architecture

### Core Tables
| Table | Purpose |
|-------|---------|
| \`accounts\` | Merchant businesses |
| \`contacts\` | People linked to accounts |
| \`opportunities\` | Pipeline deals (FK → accounts, contacts) |
| \`tasks\` | Assignable work items (FK → opportunities, contacts) |
| \`documents\` | Files per opportunity (private bucket) |
| \`activities\` | Audit trail per opportunity |
| \`comments\` | Discussion threads per opportunity |
| \`validation_reports\` | AI-powered underwriting readiness assessments |

### Onboarding & Compliance
| Table | Purpose |
|-------|---------|
| \`applications\` | Public merchant submissions (web form intake) |
| \`merchants\` | Detailed business profiles (1:1 with application) |
| \`principals\` | Beneficial owners (1:many with application) |
| \`bank_accounts\` | Settlement details (1:1 with application) |
| \`application_secrets\` | Encrypted PII (auto-purged on underwriting) |
| \`merchant_consents\` | Legal agreements with IP/user agent |
| \`application_documents\` | File audit trail with IP logging |

### Communication
| Table | Purpose |
|-------|---------|
| \`chat_channels\` + \`chat_messages\` | Team chat (realtime) |
| \`direct_messages\` | 1:1 DMs (realtime) |
| \`message_reactions\` | Emoji reactions |
| \`notifications\` | In-app bell notifications (tasks, assignments, notices, web submissions) |
| \`push_subscriptions\` | Web push registration (VAPID) |
| \`call_logs\` | Phone call records with transcripts (OpenPhone/Quo) |

### Outreach
| Table | Purpose |
|-------|---------|
| \`outreach_campaigns\` | Email campaign definitions |
| \`outreach_contacts\` | Campaign recipient tracking |
| \`cadence_steps\` | Multi-step email cadence configuration |

### System
| Table | Purpose |
|-------|---------|
| \`profiles\` | User display data (auto-created on signup via trigger) |
| \`user_roles\` | Role assignments (admin/user enum) |
| \`user_sessions\` | Login/logout tracking |
| \`action_items\` | Team notice board (shared to-dos with file attachments) |
| \`deletion_requests\` | Soft-delete approval queue |
| \`broadcast_acknowledgments\` | System announcement tracking |
| \`terminal_updates\` | Changelog entries |
| \`onboarding_wizard_states\` | Auto-saved preboarding form progress |

---

## 4. Notification Routing

### Bell Notifications (in-app)
Triggered by database triggers, the bell icon shows notifications for:
- **Task assignments** — when a task is assigned to a team member
- **Notice board tags** — when a user is @-mentioned in a notice
- **Pipeline assignments** — when an opportunity is assigned to a team member
- **New web submissions** — when a new merchant application is submitted

### Excluded from Bell
- Channel messages → shown as unread counts in the chat sidebar
- Direct messages → shown as unread indicators in the DM list

### Push Notifications (web push via VAPID)
- Channel messages and DMs trigger push notifications to offline users

### Email Notifications (via Resend)
- Task assignments, stage changes, and opportunity assignments send transactional emails

---

## 5. AI Assistant — Atria

### Overview
Atria is an AI teammate accessible via the #atria-ai channel in the team messenger and the floating Atria button (bottom-right). Powered by Google Gemini 2.5 Flash (via Lovable AI gateway), she has full read access to live CRM data, can view images/documents, and can take actions.

### Read Access (Live Snapshot)
- Full account roster with UUIDs, inception dates, contacts, and metadata
- Complete pipeline with stage/status/assignment breakdown
- All documents across all opportunities (file names, types, UUIDs, upload dates)
- Beneficial owners with ownership percentages and addresses
- Latest AI validation reports with readiness scores
- NMI boarding submissions with gateway IDs and statuses
- Client interaction history (calls, emails, meetings)
- Open tasks, team members, and recent activity log

### Document & Image Viewing
Atria can view and analyze uploaded documents:
- **Images** (JPG, PNG, WEBP) — Atria sees the actual image via multimodal AI and can describe contents (IDs, voided checks, bank statements, etc.)
- **PDFs & other files** — Atria generates a signed download URL and reports metadata
- Use commands like "look at the ID for [account]" or "check the voided check on [deal]"

### Write Actions (Tool-Calling)
Atria can execute the following actions when asked:
- **Create tasks** — with title, description, assignee, priority, due date, and linked opportunity
- **Create deals** — full Account + Contact + Opportunity creation in one step
- **Update opportunity stage** — move deals between all 9 pipeline stages
- **Assign opportunities** — assign deals to any team member
- **Update opportunity status** — set to active, dead, or closed-lost
- **Update records** — modify account, contact, and opportunity fields
- **Add notes** — save comments and log activities on opportunities
- **Relabel documents** — change document type labels (Bank Statement, EIN, etc.)
- **Log client interactions** — record calls, emails, meetings, notes, or SMS against accounts
- **Run underwriting validation** — check document completeness and beneficial owner requirements

### AI Document Validation
A separate "AI Validate" action in the Documents tab triggers Gemini to cross-reference uploaded files against application data, generating structured readiness reports (🟢/🟡/🔴) stored in \`validation_reports\`.

---

## 6. Security Model

### Data Protection
- RLS enabled on every table — no exceptions
- Sensitive PII encrypted at rest (AES-256-GCM) in \`application_secrets\`
- Auto-purge trigger (\`trg_purge_secrets_on_underwriting\`) nullifies encrypted values on status → underwriting
- 24-hour insertion window enforced by \`encrypt-secrets\` edge function
- Private storage buckets with signed URL access
- Deletion requests require admin approval (soft-delete workflow)

### Edge Functions
| Function | Purpose |
|----------|---------|
| \`ai-assistant\` | Atria AI teammate (chat + tool-calling + document validation) |
| \`encrypt-secrets\` | Server-side AES-256-GCM encryption of SSN, routing, account numbers |
| \`send-notification-email\` | Transactional emails via Resend |
| \`send-push-notification\` | Web push notifications via VAPID |
| \`send-outreach-emails\` | Outreach campaign email sending |
| \`process-scheduled-campaigns\` | Scheduled campaign execution |
| \`resend-outreach-webhook\` | Inbound webhook for email tracking (bounces, replies) |
| \`export-data\` | Admin-only ZIP export of all tables |
| \`force-password-reset\` | Admin-triggered password resets |
| \`quo-proxy\` / \`quo-webhook\` | Telephony integration (OpenPhone) |
| \`generate-profile-avatars\` | Auto-generate user avatars |
| \`sign-out-all-users\` | Admin session termination |

---

## 7. Pipeline & Workflow

### Service Types
- **Processing** — Full merchant onboarding with underwriting (10 stages)
- **Gateway Only** — Simplified gateway configuration (7 stages: skips App Prep, Underwriting, Approved)

### Active Pipeline Stages (Processing)
\`Discovery\` → \`Qualified\` → \`App Prep\` → \`Underwriting\` → \`Approved\` → \`Gateway Setup\` → \`Integration\` → \`Testing\` → \`Go Live Ready\` → \`Closed Won\`

### Active Pipeline Stages (Gateway Only)
\`Discovery\` → \`Qualified\` → \`Gateway Setup\` → \`Integration\` → \`Testing\` → \`Go Live Ready\` → \`Closed Won\`

### Terminal Outcomes (Off-Board)
Selecting an outcome removes the deal from the active board, records reason/notes/close date/closer, and disables further stage movement:
- **Closed Won** (13 reasons) — status set to 'won', tracked in Live & Billing
- **Closed Lost** (15 reasons) — status set to 'dead', no email, 7 reasons create re-engagement tasks (30–180 days)
- **Disqualified** (14 reasons) — status set to 'dead', compliance email auto-sent, 6 reasons permanently suppressed
- **No Decision / Dead** (13 reasons) — status set to 'dead', no email, 5 reasons create re-engagement tasks (14–90 days)
- **Underwriting Declined** (15 reasons) — status set to 'dead', adverse action email (ECOA/FCRA) auto-sent, 5 remediable reasons create tasks (14–180 days)

### Re-engagement Task Automation
When an outcome is set, the system auto-creates a dated follow-up task for the assigned rep unless the reason is in the permanent suppression list (OFAC, MATCH/TMF, AML, fraud, prohibited MCC, previously terminated).

### Underwriting Gate (Processing Deals)
Before a deal can advance to Underwriting, it must pass document validation:
1. ≥ 3 separate Bank Statements or Transaction History documents
2. Articles of Organization
3. Tax Document (EIN)
4. Voided Check or Bank Confirmation
5. Passport or Driver's License (KYC)
6. ≥ 1 beneficial owner with 25%+ equity recorded

### Pipeline UX
- **Hybrid 75/25 layout** — Kanban board (top) + high-density List View (bottom)
- **Sticky column headers** — fixed during vertical scroll
- **SLA velocity alerts** — two-tier: amber at 12 hours, red at 24 hours (resets on stage movement)
- **Muted cards** — deals not assigned to current user appear muted
- **Outcome display** — detail view shows status badge, reason label, email status, and scheduled re-engagement tasks

### Automation
- SLA tracking: Automatic 24-hour SLA tasks on stage entry
- Realtime: Pipeline board, chat, and notifications use WebSocket subscriptions
- Auto-assignment: Web submissions at 100% completion assigned to support@merchanthaus.io
- Stage change notifications: Email + in-app + push notifications on assignment and stage transitions
- System messages: Automated chat posts to #ops-updates for key events
- AI validation: On-demand document readiness checks via Gemini
- Compliance emails: Auto-sent for Disqualified and Underwriting Declined outcomes
- Re-engagement tasks: Auto-created with cooling-off periods based on outcome reason
- Gateway auto-creation: Processing approved → auto-creates Gateway card if none exists


---

*Document generated from MerchantHaus CRM — ${new Date().toISOString().split('T')[0]}*
`;
  }, []);

  const emailTemplates = {
    step1: {
      defaultVariant: "standard",
      variants: {
        standard: {
          label: "Standard",
          subject: "Great to Connect",
          body: `Hello,

Thank you for taking the time to connect.

I'd love to learn more about your business and what you're looking for in a payments/processing partner so we can see how best to support you.

Are you available for a quick call in the next few days? If email is easier, you're welcome to reply with a brief overview of your business (what you sell, how you accept payments today, and your typical monthly volume), and we'll take it from there.

Best regards,
Sales Support`,
        },
        brief: {
          label: "Brief Follow-Up",
          subject: "Quick Follow-Up & Next Steps",
          body: `Hello,

Just following up on our recent connection.

When you have a moment, could you please reply with a quick overview of your business (what you sell, how you take payments today, and your approximate monthly volume)? That will help us confirm the best fit and next steps.

If you'd prefer a quick call instead, you're welcome to share a few times that work for you, and we'll schedule something.

Best regards,
Sales Support`,
        },
      },
    },
    step1_2: {
      defaultVariant: "standard",
      variants: {
        standard: {
          label: "Standard",
          subject: "Schedule a Quick Discovery Call",
          body: `Hello,

Thanks again for connecting.

To make next steps easy, you can book a quick discovery call at a time that works best for you using the link below:

https://calendar.app.google/6F1xCy8DcVh8B4aR7

On this call, we'll review your business model, products/services, and any specific requirements so we can recommend the best solution.

If you prefer to continue over email instead, just reply with a brief description of your business and any questions you have.

Best regards,
Sales Support`,
        },
      },
    },
    step2: {
      defaultVariant: "standard",
      variants: {
        standard: {
          label: "Standard",
          subject: "Next Steps to Complete Your Application",
          body: `Hello,

Thank you again for your interest in working with us.

To move your application forward to underwriting, we just need a bit more information and a few standard documents.

Please complete the attached form and return it along with:

- 3 most recent months of bank statements (business or personal)
- 3 most recent months of processing statements, if available
- Voided check or bank letter showing your account and routing details
- Articles of Organization (or equivalent formation document)
- Copy of the owner's driver's license or passport
- Social Security Number (SSN) for the principal owner
- A brief overview of your products and services, including:
  - What you sell
  - How you sell (in person, online, recurring/subscription, etc.)
  - Typical ticket size and monthly volume
  - Who your typical customers are

Please share as much detail as you can about your products and services — this helps underwriting understand your business clearly and speeds up approval.

You can reply to this email with the documents attached, or let us know if you'd prefer to use a secure upload method and we'll provide details.

Once we have everything, we'll submit your file for review right away and update you on the next steps.

If you have any questions while gathering these items, please reach out — we're here to help.

Thanks,
Sales Support`,
        },
        prelaunch: {
          label: "Pre-Launch / No History",
          subject: "Next Steps to Complete Your Application (Pre-Launch)",
          body: `Hello,

Thank you again for your interest in working with us.

Because your business is pre-launch or has limited processing history, underwriting will focus more on your business model and projections. To move your application forward, please complete the attached form and return it along with:

- 3 most recent months of bank statements (business or personal)
- Voided check or bank letter showing your account and routing details
- Articles of Organization (or equivalent formation document)
- Copy of the owner's driver's license or passport
- Social Security Number (SSN) for the principal owner
- A detailed overview of your products and services, including:
  - What you will sell
  - How you will sell (in person, online, recurring/subscription, etc.)
  - Expected average ticket size and monthly volume
  - Your target customers and markets
  - Any existing contracts, partnerships, or letters of intent (if available)
- A brief explanation of your experience in this industry or related fields

Please share as much detail as you can about your products and services — the more clarity we have, the easier it is for underwriting to approve and set the right parameters.

You can reply to this email with the documents attached, or let us know if you'd prefer to use a secure upload method and we'll provide details.

Once we have everything, we'll submit your file for review right away and update you on the next steps.

If you have any questions while gathering these items, please reach out — we're here to help.

Thanks,
Sales Support`,
        },
      },
    },
    step3: {
      defaultVariant: "standard",
      variants: {
        standard: {
          label: "Standard",
          subject: "Your Application Is Now in Process",
          body: `Hello,

Thank you for sending through your documents.

We've received your application and supporting information and have submitted your file to our processing/underwriting team for review. Your application is now officially in process.

If anything additional is required, we'll reach out right away. Otherwise, we'll provide an update as soon as the review is complete.

In the meantime, if you have any questions about timelines or next steps, just reply to this email and we'll be happy to help.

Best regards,
Sales Support`,
        },
      },
    },
  };

  const emailSteps = [
    {
      id: "step1",
      templateKey: "step1" as const,
      title: "Step 1 — Intro & Discovery",
      note: {
        text: "Once requirements are established, defer the prospect to our apply form: /merchant-apply. That submission feeds the CRM directly and auto-fires the Application Received + Website Compliance Checklist emails. Use Step 1.2 only if a call is requested first.",
        link: "https://calendar.app.google/6F1xCy8DcVh8B4aR7",
        linkText: "Schedule a Call",
        skipNote: "If no call requested and requirements are clear, point them straight to /merchant-apply.",
      },
    },
    {
      id: "step1-2",
      templateKey: "step1_2" as const,
      title: "Step 1.2 — Call Scheduling",
    },
    {
      id: "step2",
      templateKey: "step2" as const,
      title: "Step 2 — Request for Documents (Manual Fallback)",
    },
    {
      id: "step3",
      templateKey: "step3" as const,
      title: "Step 3 — Application in Process",
    },
  ];

  /* ─── Section header helper ─── */
  const SectionHeader = ({ children, gold = false, sectionId, sectionTitle }: { children: React.ReactNode; gold?: boolean; sectionId?: string; sectionTitle?: string }) => (
    <div className="flex items-center justify-between mb-6">
      <h2 className={`font-['Playfair_Display'] text-2xl font-bold text-foreground border-b-2 ${gold ? 'border-[hsl(var(--gold))]' : 'border-primary'} inline-block pb-1`}>
        {children}
      </h2>
      {sectionId && sectionTitle && (
        <SuggestEditButton sectionId={sectionId} sectionTitle={sectionTitle} />
      )}
    </div>
  );

  return (
    <AppLayout pageTitle="Standard Operating Procedures">
      <div className="flex-1 flex min-h-0">
            {/* Sidebar toggle (always visible on lg) */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden lg:flex fixed top-[4.5rem] z-30 items-center justify-center h-8 w-8 rounded-r-md border border-l-0 border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-all"
              style={{ left: sidebarOpen ? '16rem' : '0' }}
              title={sidebarOpen ? 'Collapse menu' : 'Expand menu'}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>

            {/* SOP Navigation Sidebar */}
            <aside className={`border-r border-border bg-card hidden lg:block overflow-y-auto transition-all duration-200 ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-r-0'}`}>
              <nav className="p-4 space-y-1">
                <a
                  href="#index"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors"
                >
                  Document Index
                </a>
                <a
                  href="#principles"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors"
                >
                  1. Principles
                </a>

                {/* Sales Ops - Collapsible */}
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="group flex items-center justify-between w-full pt-4 pb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em] hover:text-foreground transition-colors">
                    Sales Ops <span className="label-slash">/</span>
                    <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-1">
                      <a href="#step1" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        2.1 Intro & Discovery
                      </a>
                      <a href="#step1-2" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        2.2 Call Scheduling
                      </a>
                      <a href="#step2" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        2.3 Request for Documents
                      </a>
                      <a href="#step3" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        2.4 Application in Process
                      </a>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Pipeline Stages - Collapsible */}
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="group flex items-center justify-between w-full pt-4 pb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em] hover:text-foreground transition-colors">
                    Pipeline Stages <span className="label-slash">/</span>
                    <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-1">
                      <a href="#pipeline-stages" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        Stage Management Guide
                      </a>
                      <a href="#underwriting-checklist" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        2.5 Pre-Underwriting Checklist
                      </a>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Internal Ops - Collapsible */}
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="group flex items-center justify-between w-full pt-4 pb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em] hover:text-foreground transition-colors">
                    Internal Ops <span className="label-slash">/</span>
                    <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-1">
                      <a href="#atria-ai" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        3.0 Atria AI Assistant
                      </a>
                      <a href="#ps-terminal" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        3.1 PS Terminal Usage Guide
                      </a>
                      <a href="#microsite-application" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        3.2 NMI Microsite Application
                      </a>
                      <a href="#step4" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        3.3 Processing & Gateway Setup
                      </a>
                      <a href="#action-items" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        3.4 Action Items & Standards
                      </a>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Data Integrity - Collapsible */}
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="group flex items-center justify-between w-full pt-4 pb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em] hover:text-foreground transition-colors">
                    Data Integrity <span className="label-slash">/</span>
                    <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-1">
                      <a href="#outcome-rules" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        Outcome & Pipeline Rules
                      </a>
                      <a href="#record-lifecycle" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        Record Lifecycle
                      </a>
                      <a href="#data-standards" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        Data Standards
                      </a>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Reference - Collapsible */}
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="group flex items-center justify-between w-full pt-4 pb-2 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em] hover:text-foreground transition-colors">
                    Reference <span className="label-slash">/</span>
                    <ChevronDown className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-1">
                      <a href="#services-overview" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        4. Services Overview
                      </a>
                      <a href="#appendix" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        5. Appendices
                      </a>
                      <a href="#tech-stack" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        6. Systems & Tech Stack
                      </a>
                      <a href="#team-organogram" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        7. Team Organogram
                      </a>
                      <a href="#android-build" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/30 rounded-none transition-colors">
                        8. Android Build Guide
                      </a>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Change Requests Review */}
                <div className="border-t border-border mt-4 pt-4 px-4">
                  <Collapsible>
                    <CollapsibleTrigger className="group flex items-center justify-between w-full pb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em] hover:text-foreground transition-colors">
                      SOP Change Requests
                      <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SOPReviewPanel />
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </nav>
            </aside>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto scroll-smooth" id="sop-content">
              <div className="max-w-4xl mx-auto p-6 md:p-12 space-y-10">
                {/* Download PDF Button */}
                <div className="flex justify-end print:hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-none"
                    onClick={handleDownloadPdf}
                    disabled={isPrinting}
                  >
                    <Download className="h-4 w-4" />
                    Download as PDF
                  </Button>
                </div>
                {/* Document Index */}
                <section id="index" className="bg-card rounded-none border border-border p-8">
                  <SectionHeader gold sectionId="index" sectionTitle="Document Index">Document Index</SectionHeader>
                  <div className="grid md:grid-cols-2 gap-8 text-sm">
                    <div>
                      <h3 className="font-bold text-foreground mb-3 uppercase tracking-[0.3em] text-[10px]">
                        Section 1 — Principles & Foundation
                      </h3>
                      <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-[hsl(var(--gold))]">
                        <li>
                          <a href="#principles" className="hover:text-primary transition-colors cursor-pointer"><strong>1.1</strong> — Foreword: The Four Agreements</a>
                        </li>
                      </ul>

                      <h3 className="font-bold text-foreground mt-6 mb-3 uppercase tracking-[0.3em] text-[10px]">
                        Section 2 — Sales Operating Procedures
                      </h3>
                      <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-[hsl(var(--gold))]">
                        <li>
                          <a href="#step1" className="hover:text-primary transition-colors cursor-pointer"><strong>2.1</strong> — Step 1: Intro & Discovery (Email Templates)</a>
                        </li>
                        <li>
                          <a href="#step1-2" className="hover:text-primary transition-colors cursor-pointer"><strong>2.2</strong> — Step 1.2: Call Scheduling (Email Template)</a>
                        </li>
                        <li>
                          <a href="#step2" className="hover:text-primary transition-colors cursor-pointer"><strong>2.3</strong> — Step 2: Request for Documents (Email Templates)</a>
                        </li>
                        <li>
                          <a href="#step3" className="hover:text-primary transition-colors cursor-pointer"><strong>2.4</strong> — Step 3: Application In Process (Email Template)</a>
                        </li>
                        <li>
                          <a href="#underwriting-checklist" className="hover:text-primary transition-colors cursor-pointer"><strong>2.5</strong> — Pre-Underwriting Checklist</a>
                        </li>
                        <li>
                          <a href="#automated-emails" className="hover:text-primary transition-colors cursor-pointer"><strong>2.6</strong> — Automated Emails (When They Fire & What They Say)</a>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground mb-3 uppercase tracking-[0.3em] text-[10px]">
                        Section 3 — Internal Operations & Systems
                      </h3>
                      <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-[hsl(var(--gold))]">
                        <li>
                          <a href="#atria-ai" className="hover:text-primary transition-colors cursor-pointer"><strong>3.0</strong> — Atria AI Assistant</a>
                        </li>
                        <li>
                          <a href="#ps-terminal" className="hover:text-primary transition-colors cursor-pointer"><strong>3.1</strong> — PS Terminal Usage Guide</a>
                        </li>
                        <li>
                          <a href="#microsite-application" className="hover:text-primary transition-colors cursor-pointer"><strong>3.2</strong> — NMI Microsite Application Process</a>
                        </li>
                        <li>
                          <a href="#step4" className="hover:text-primary transition-colors cursor-pointer"><strong>3.3</strong> — Processing & Gateway Setup</a>
                        </li>
                        <li>
                          <a href="#action-items" className="hover:text-primary transition-colors cursor-pointer"><strong>3.4</strong> — Action Items & Industry Standards</a>
                        </li>
                      </ul>

                      <h3 className="font-bold text-foreground mt-6 mb-3 uppercase tracking-[0.3em] text-[10px]">
                        Section 4 — Services & Pricing Reference
                      </h3>
                      <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-[hsl(var(--gold))]">
                        <li>
                          <a href="#services-overview" className="hover:text-primary transition-colors cursor-pointer"><strong>4.1</strong> — MerchantHaus Services Overview</a>
                        </li>
                        <li>
                          <a href="#services-overview" className="hover:text-primary transition-colors cursor-pointer"><strong>4.2</strong> — Pricing Tiers & Features</a>
                        </li>
                        <li>
                          <a href="#nmi-pricing-schedule" className="hover:text-primary transition-colors cursor-pointer"><strong>4.3</strong> — NMI Schedule A — Gateway & Processing Pricing</a>
                        </li>
                      </ul>

                      <h3 className="font-bold text-foreground mt-6 mb-3 uppercase tracking-[0.3em] text-[10px]">
                        Section 5 — Appendices & Reference
                      </h3>
                      <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-[hsl(var(--gold))]">
                        <li>
                          <a href="#appendix" className="hover:text-primary transition-colors cursor-pointer"><strong>5.1</strong> — SOP Structure & Best Practices</a>
                        </li>
                        <li>
                          <a href="#tech-stack" className="hover:text-primary transition-colors cursor-pointer"><strong>5.2</strong> — CRM Architecture & Technical Reference</a>
                        </li>
                        <li>
                          <a href="#referral-program" className="hover:text-primary transition-colors cursor-pointer"><strong>5.3</strong> — Referral Partner Program</a>
                        </li>
                        <li>
                          <strong>5.4</strong> — Service Providers & SaaS Stack
                        </li>
                      </ul>

                      <h3 className="font-bold text-foreground mt-6 mb-3 uppercase tracking-[0.3em] text-[10px]">
                        Section 6 — External Artifacts
                      </h3>
                      <ul className="space-y-2 text-[hsl(var(--gold))] pl-2 border-l-2 border-[hsl(var(--gold))]">
                        <li>
                          <a
                            href="/merchant-apply"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Merchant Application Form
                          </a>
                        </li>
                        <li>
                          <a
                            href="https://docs.google.com/spreadsheets/d/1OuQwgzkEGHYemHRv3fuyte1jracU2nJGgVVAb5HlQ3A/edit?gid=0#gid=0"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Lead Stages Document
                          </a>
                        </li>
                        <li>
                          <a
                            href="https://docs.google.com/spreadsheets/d/1ahUNEoqobsMFw5iibFdqbcmUPLpuSGMGPLJi6cmgNa4/edit?gid=0#gid=0"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Form Responses Sheet
                          </a>
                        </li>
                        <li>
                          <a
                            href="https://merchanthaus-fr.nmipays.com/form/MerchantHaus-fr"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> NMI Flat Rate Microsite
                          </a>
                        </li>
                        <li>
                          <a
                            href="https://merchanthaus-ic.nmipays.com/form/MerchantHaus-ic"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> NMI Interchange+ Microsite
                          </a>
                        </li>
                        <li>
                          <a
                            href="https://drive.google.com/file/d/1vl9oY_DjiiGaPLXgwBThCWKb2k_P45aH/view?usp=drive_link"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Recommended Pricing Doc
                          </a>
                        </li>
                        <li>
                          <a
                            href="https://drive.google.com/file/d/1vl9oY_DjiiGaPLXgwBThCWKb2k_P45aH/view?usp=drive_link"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Current NMI Contract
                          </a>
                        </li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Foreword */}
                <section id="principles" className="bg-card rounded-none border border-border p-8">
                  <SectionHeader sectionId="principles" sectionTitle="Foreword — The Four Agreements">Foreword — The Four Agreements</SectionHeader>
                  <p className="text-muted-foreground mb-6 italic border-l-4 border-[hsl(var(--gold))] pl-4 bg-[hsl(var(--gold))]/10 py-2 pr-2">
                    The following principles serve as the foundational mindset and
                    ethical framework that guide all MerchantHaus operations.
                  </p>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-secondary/50 p-5 rounded-none border border-border">
                      <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> 1. Be Impeccable With Your Word
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Mean what you say and say what you mean. Speak with integrity. Avoid gossip and self-criticism.
                      </p>
                    </div>
                    <div className="bg-secondary/50 p-5 rounded-none border border-border">
                      <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[hsl(var(--gold))]" /> 2. Don't Take Anything Personally
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        What others think is a reflection of their reality, not yours. Feedback is for growth, not attack.
                      </p>
                    </div>
                    <div className="bg-secondary/50 p-5 rounded-none border border-border">
                      <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-[hsl(var(--gold))]" /> 3. Don't Make Assumptions
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Do not guess. Ask questions. Clear communication eliminates misunderstandings.
                      </p>
                    </div>
                    <div className="bg-secondary/50 p-5 rounded-none border border-border">
                      <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[hsl(var(--gold))]" /> 4. Always Do Your Best
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Your best will vary. Doing your best prevents regret and self-judgment.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Email Template Sections with Variants */}
                {emailSteps.map((step) => {
                  const group = emailTemplates[step.templateKey];
                  const variants = group.variants;
                  const activeVariantKey =
                    variantSelection[step.templateKey] || group.defaultVariant;
                  const activeTemplate = variants[activeVariantKey];
                  const hasVariants = Object.keys(variants).length > 1;

                  const subjectCopyId = `${step.id}-${activeVariantKey}-subject`;
                  const bodyCopyId = `${step.id}-${activeVariantKey}-body`;

                  return (
                    <section key={step.id} id={step.id}>
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="font-['Playfair_Display'] text-xl font-bold text-foreground">
                          {step.title}
                        </h2>
                        <div className="flex items-center gap-2">
                          <SuggestEditButton sectionId={step.id} sectionTitle={step.title} />
                          {hasVariants && (
                            <div className="flex gap-1 mr-1">
                              {Object.entries(variants).map(([key, variant]) => (
                                <Button
                                  key={key}
                                  type="button"
                                  variant={key === activeVariantKey ? "default" : "outline"}
                                  size="sm"
                                  className="text-[10px] px-2 py-1 h-7 rounded-none"
                                  onClick={() => handleVariantChange(step.templateKey, key)}
                                >
                                  {variant.label}
                                </Button>
                              ))}
                            </div>
                          )}
                          <span className="bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))] text-xs font-semibold px-2.5 py-0.5 rounded-none">
                            {hasVariants ? "Email Templates" : "Email Template"}
                          </span>
                        </div>
                      </div>

                      <div className="bg-card rounded-none border-2 border-border overflow-hidden">
                        <div className="bg-secondary/50 px-6 py-3 border-b border-border flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">
                              Subject
                            </span>
                            <p className="font-medium text-foreground">
                              {activeTemplate.subject}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(activeTemplate.subject, subjectCopyId)}
                            className="text-xs rounded-none"
                          >
                            {copiedId === subjectCopyId ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                            Copy
                          </Button>
                        </div>
                        <div className="p-6 relative group">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(activeTemplate.body, bodyCopyId)}
                            className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition text-xs rounded-none"
                          >
                            {copiedId === bodyCopyId ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                            Copy Body
                          </Button>
                          <div className="text-muted-foreground whitespace-pre-wrap font-sans">
                            {activeTemplate.body}
                          </div>
                        </div>
                        {step.note && (
                          <div className="bg-[hsl(var(--gold))]/10 px-6 py-4 border-t border-[hsl(var(--gold))]/20 text-sm text-foreground">
                            <strong>{step.note.text}</strong>
                            <br />
                            Booking Link:{" "}
                            <a href={step.note.link} className="underline font-bold text-[hsl(var(--gold))]"
                              target="_blank" rel="noopener noreferrer">
                              {step.note.linkText}
                            </a>
                            <br />
                            <em className="text-muted-foreground">{step.note.skipNote}</em>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}

                {/* Pre-Underwriting Checklist */}
                <UnderwritingChecklist />

                {/* ═══════════════════════════════════════════
                    AUTOMATED EMAILS — Staff reference for what
                    the system sends on its own (no one clicks send)
                ═══════════════════════════════════════════ */}
                <section id="automated-emails" className="bg-card rounded-none border border-border p-8">
                  <SectionHeader gold sectionId="automated-emails" sectionTitle="Automated Emails — When They Fire & What They Say">
                    2.6 — Automated Emails (When They Fire & What They Say)
                  </SectionHeader>
                  <p className="text-muted-foreground mb-6 italic border-l-4 border-[hsl(var(--gold))] pl-4 bg-[hsl(var(--gold))]/10 py-2 pr-2">
                    Some emails go out <strong>automatically</strong> — no one on our team clicks send. They fire when a specific thing happens in the terminal (a merchant finishes applying, a deal moves stages, a task gets assigned, etc.). Use this table so you know what your prospects and teammates are actually receiving in their inbox.
                  </p>

                  {/* Merchant-facing */}
                  <h3 className="font-bold text-foreground mt-2 mb-3 uppercase tracking-[0.2em] text-[11px] flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[hsl(var(--gold))]" /> Sent to the Merchant / Prospect
                  </h3>
                  <div className="space-y-3 mb-8">
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">1. Application Received</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: merchant finishes the apply wizard</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Short thank-you confirming we received their application. Tells them we'll be in touch within 1–2 business days and gives them an email to reach us. Nothing action-required.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">2. Website Compliance Checklist</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: merchant finishes the apply wizard (Processing or Gateway only)</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> A long, friendly checklist of what underwriting will look for on their website (refund policy, privacy policy, card brand logos, HTTPS, subscription rules, etc.) so they can fix issues <em>before</em> we ask — cuts down review time. See the full example below.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">3. Qualified Docs Request</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: rep clicks "Request Documents" on a deal's Documents tab</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Asks the merchant for the specific documents we need to move forward (bank statements, processing statements, etc.). Rep can customize subject and body before sending.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">4. Outcome Email (Declined / Disqualified)</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: rep sets an outcome on a deal in the Opportunity Detail modal</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Tells the merchant their application was declined or disqualified. Tone and wording are set per outcome type.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">5. Account Closed</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: a closure outcome is saved on a Live Account</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Confirms to the merchant their account is closed and notes the reason/next steps.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">6. Contact Form Confirmation</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: someone submits the public /contact form on our website</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> A brief confirmation that their inquiry was received and someone will follow up.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">7. Outreach Campaign (Bulk Cadence)</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: rep launches a campaign from Outreach Detail</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Whatever the rep composed in the campaign — sent to outreach contacts on the chosen schedule (Day 1, Day 3, Day 7, etc.).</p>
                    </div>
                  </div>

                  {/* Internal-facing */}
                  <h3 className="font-bold text-foreground mt-2 mb-3 uppercase tracking-[0.2em] text-[11px] flex items-center gap-2">
                    <Users className="w-4 h-4 text-[hsl(var(--gold))]" /> Sent to Us (Internal Team)
                  </h3>
                  <div className="space-y-3 mb-8">
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">8. Pipeline Stage Change</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: unknown deal's stage changes</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Which deal moved, where it went, who moved it. Keeps the team silently aware of pipeline movement.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">9. Task Assignment</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: a task is created and assigned to someone</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Tells the assignee they have a new task, with a short summary and a link into the deal.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">10. Opportunity Assignment</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: a deal's "assigned to" field changes</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Lets the newly-assigned rep know a deal was handed to them.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">11. Terminal Update Digest</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: a new Terminal Update is posted</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Blasts the new product update / announcement out to every user in the team.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">12. Contact Form Notification (to sales@)</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: someone submits the public /contact form</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Pings <strong>sales@merchanthaus.io</strong> with the inquirer's name, email, and message so we can follow up.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">13. Agenda Submission</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: an item is submitted via the Agenda dialog</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Pings <strong>admin@merchanthaus.io</strong> with the new agenda item for the next meeting.</p>
                    </div>
                    <div className="bg-secondary/50 p-4 border border-border">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <strong className="text-foreground text-sm">14. Notice Board Tag</strong>
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground bg-background px-2 py-0.5 border border-border">Fires: a user is tagged in a notice (AI Validate panel or Action Items widget)</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2"><strong className="text-foreground">What it says:</strong> Lets the tagged user know they were mentioned and gives them a direct link to the notice.</p>
                    </div>
                  </div>

                  {/* Example callout */}
                  <div className="bg-[hsl(var(--gold))]/5 border-2 border-[hsl(var(--gold))]/40 p-6 mt-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Mail className="w-5 h-5 text-[hsl(var(--gold))]" />
                      <h3 className="font-bold text-foreground uppercase tracking-[0.15em] text-xs">Example — #2 Website Compliance Checklist</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3"><strong className="text-foreground">Subject:</strong> Your application is in. Here's what underwriting will look at on your website.</p>
                    <div className="bg-background border border-border p-5 text-sm text-foreground/90 leading-relaxed">
                      <p className="mb-3">Hi <span className="text-muted-foreground">[first name]</span>,</p>
                      <p className="mb-3">Your application for <span className="text-muted-foreground">[business name]</span> is in — thank you. Our underwriting team will begin their review shortly, and one of the things they'll look at is your website.</p>
                      <p className="mb-3">Before they do, we want to give you a heads-up on what they check and where most merchants get tripped up. The card brands (Visa, Mastercard, Amex, Discover) require specific disclosures on every e-commerce site, and missing any of them is the single most common reason we come back asking for changes — which slows down your approval.</p>
                      <p className="mb-3 font-bold">The card brands require these on your website:</p>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-3">
                        <li>Business name (DBA), physical address, working customer service email + phone</li>
                        <li>Card brand logos shown at checkout in full colour</li>
                        <li>Clear product/service descriptions, currency, and total cost shown before payment</li>
                        <li>Refund, Shipping, Privacy, and Terms policies — live and linked from checkout</li>
                        <li>HTTPS on every page; no card data captured outside the hosted payment form</li>
                      </ul>
                      <p className="mb-3"><strong>Refund policy is the #1 item underwriters flag</strong> — must be visible at checkout, state timeframe, conditions, how refunds are issued, and how to request one. "All sales final" alone won't pass.</p>
                      <p className="mb-3"><strong>If you sell subscriptions or free trials</strong>, strict rules apply: express consent (no pre-ticked boxes), confirmation email at enrollment, 7-day-before-conversion reminder, one-click online cancel, and trial-length / billing frequency shown at point of sale.</p>
                      <p className="mb-3 font-bold">Things underwriters flag — avoid these:</p>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-3">
                        <li>Broken or "Coming Soon" pages, stock-photo-only product pages</li>
                        <li>Mismatched DBA/legal names with no explanation</li>
                        <li>Unrealistic claims ("miracle", "guaranteed", "cures")</li>
                        <li>No About page, team, address, or phone</li>
                      </ul>
                      <p className="mb-3">Most merchants who work through this checklist in advance sail through review in 3–5 business days. If you have questions on any item, reply to this email and our onboarding team will walk you through it.</p>
                      <p className="mb-1">Welcome to Merchant Haus.</p>
                      <p className="mt-3"><strong>The Merchant Haus Team</strong></p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 italic">This is a condensed preview. The merchant receives the full HTML version with checkboxes and Merchant Haus branding.</p>
                  </div>

                  <div className="mt-6 p-4 bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Rule of thumb:</strong> if you didn't click send and the merchant says "I got an email from you," check this list first. If the email isn't in the list, it was sent by a teammate manually — find out who.
                    </p>
                  </div>
                </section>

                {/* ═══════════════════════════════════════════
                    PIPELINE STAGE MANAGEMENT GUIDE
                    Corrected to match actual DB stages:
                    discovery → qualification → preboarding → underwriting → boarding → live
                ═══════════════════════════════════════════ */}
                <section id="pipeline-stages" className="bg-card rounded-none border border-border p-8">
                  <SectionHeader gold sectionId="pipeline-stages" sectionTitle="Pipeline Stage Management">Pipeline Stage Management Guide</SectionHeader>
                  <p className="text-muted-foreground mb-8 italic border-l-4 border-[hsl(var(--gold))] pl-4 bg-[hsl(var(--gold))]/10 py-2 pr-2">
                    Follow these guidelines for managing opportunities through each pipeline stage. 
                    Each stage has specific actions, CTAs, and criteria for advancement.
                  </p>

                  {/* Stage flow visualisation */}
                  <div className="flex flex-wrap items-center gap-2 mb-8 text-xs font-bold">
                    {[
                      { label: "Discovery", color: "bg-zinc-600" },
                      { label: "Qualified", color: "bg-zinc-700" },
                      { label: "App Prep", color: "bg-slate-600" },
                      { label: "Underwriting", color: "bg-slate-700" },
                      { label: "Approved", color: "bg-slate-800" },
                      { label: "Gateway Setup", color: "bg-gray-700" },
                      { label: "Integration", color: "bg-gray-800" },
                      { label: "Testing", color: "bg-indigo-700" },
                      { label: "Go Live Ready", color: "bg-emerald-600" },
                      { label: "Closed Won", color: "bg-emerald-500" },
                    ].map((s, i) => (
                      <div key={s.label} className="flex items-center gap-2">
                        <span className={`${s.color} text-white px-3 py-1.5 rounded-none`}>{s.label}</span>
                        {i < 9 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    ))}
                  </div>

                  <div className="mb-4 p-3 rounded-none bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
                    <strong className="text-foreground">Two pipelines:</strong> Processing deals follow all 10 stages. Gateway Only deals skip App Prep, Underwriting, and Approved — going directly from Qualified → Gateway Setup.
                  </div>

                  {/* Stage 1: Discovery */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-zinc-600/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-zinc-600 flex items-center justify-center">
                        <Search className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 1: Discovery</h3>
                        <p className="text-sm text-muted-foreground">Initial contact and information gathering</p>
                      </div>
                      <span className="ml-auto bg-zinc-500/30 text-zinc-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 24 hours
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-zinc-500">•</span><span>Send <strong className="text-foreground">Step 1 — Intro & Discovery</strong> email template</span></li>
                          <li className="flex gap-2 items-start"><span className="text-zinc-500">•</span><span>Document business type, monthly volume, current processor</span></li>
                          <li className="flex gap-2 items-start"><span className="text-zinc-500">•</span><span>Identify processing needs: Gateway Only vs Full Processing</span></li>
                          <li className="flex gap-2 items-start"><span className="text-zinc-500">•</span><span>Schedule a discovery call if needed (Step 1.2)</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Qualified when:</strong>
                        <span className="text-muted-foreground"> Business model understood, solution fit confirmed, merchant interested in proceeding.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 2: Qualified */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-zinc-700/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-zinc-700 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 2: Qualified</h3>
                        <p className="text-sm text-muted-foreground">Merchant confirmed as viable — Darryn's QA gate</p>
                      </div>
                      <span className="ml-auto bg-zinc-500/30 text-zinc-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 24 hours
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-zinc-500">•</span><span>Confirm merchant interest and commitment to proceed</span></li>
                          <li className="flex gap-2 items-start"><span className="text-zinc-500">•</span><span>Set appropriate pipeline: <strong className="text-foreground">Processing</strong> or <strong className="text-foreground">Gateway Only</strong></span></li>
                          <li className="flex gap-2 items-start"><span className="text-zinc-500">•</span><span>Send <strong className="text-foreground">Step 2 — Request for Documents</strong> email</span></li>
                          <li className="flex gap-2 items-start"><span className="text-zinc-500">•</span><span>Create tasks for document follow-up</span></li>
                          <li className="flex gap-2 items-start"><span className="text-zinc-500">•</span><span>Darryn QA gate: Initial underwriting data review</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to App Prep when:</strong>
                        <span className="text-muted-foreground"> Document request sent and acknowledged. <strong>Gateway Only</strong> deals skip to Gateway Setup.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 3: App Prep */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-slate-600/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-slate-600 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 3: App Prep</h3>
                        <p className="text-sm text-muted-foreground">Document collection and preboarding wizard</p>
                      </div>
                      <span className="ml-auto bg-slate-500/30 text-slate-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 72 hours
                      </span>
                      <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-none">Processing Only</span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Collect all required documents (see Pre-Underwriting Checklist)</span></li>
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Complete the <strong className="text-foreground">Preboarding Wizard</strong> (auto-saves progress)</span></li>
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Verify document completeness and quality</span></li>
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Send <strong className="text-foreground">Step 3 — Application in Process</strong> when ready</span></li>
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Record beneficial owners (≥ 25% equity required)</span></li>
                        </ul>
                      </div>
                      <div className="bg-[hsl(var(--gold))]/10 border border-[hsl(var(--gold))]/30 rounded-none p-3 text-sm">
                        <strong className="text-[hsl(var(--gold))] flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" /> Underwriting Gate (must pass before advancing):
                        </strong>
                        <ul className="mt-2 text-muted-foreground grid md:grid-cols-2 gap-1">
                          <li>✓ ≥ 3 Bank Statements / Transaction History</li>
                          <li>✓ Articles of Organization</li>
                          <li>✓ Tax Document (EIN)</li>
                          <li>✓ Voided Check / Bank Confirmation</li>
                          <li>✓ Passport or Driver's License (KYC)</li>
                          <li>✓ ≥ 1 beneficial owner with 25%+ equity</li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Underwriting when:</strong>
                        <span className="text-muted-foreground"> All documents collected, wizard completed, underwriting gate passed, and application submitted.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 4: Underwriting Review */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-slate-700/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-slate-700 flex items-center justify-center">
                        <ClipboardCheck className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 4: Underwriting Review</h3>
                        <p className="text-sm text-muted-foreground">Application under review by processor</p>
                      </div>
                      <span className="ml-auto bg-slate-500/30 text-slate-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 3–5 days
                      </span>
                      <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-none">Processing Only</span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Monitor underwriting status daily</span></li>
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Respond promptly to any stipulation requests</span></li>
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Keep merchant informed of progress</span></li>
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Run <strong className="text-foreground">AI Validate</strong> to generate readiness report</span></li>
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Pin to Notice Board for underwriting-specific items</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Approved when:</strong>
                        <span className="text-muted-foreground"> Processor confirms approval and MID assigned.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 5: Processor Approval */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-slate-800/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-slate-800 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 5: Approved</h3>
                        <p className="text-sm text-muted-foreground">Processor has approved — ready for gateway setup</p>
                      </div>
                      <span className="ml-auto bg-slate-500/30 text-slate-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 48 hours
                      </span>
                      <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-none">Processing Only</span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Confirm MID assignment and rate structure</span></li>
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Notify merchant of approval with timeline for activation</span></li>
                          <li className="flex gap-2 items-start"><span className="text-slate-500">•</span><span>Auto-creates Gateway opportunity if none exists</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Gateway Setup when:</strong>
                        <span className="text-muted-foreground"> Gateway application submitted to NMI.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 6: Gateway Setup */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-gray-700/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-gray-700 flex items-center justify-center">
                        <Rocket className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 6: Gateway Setup</h3>
                        <p className="text-sm text-muted-foreground">NMI gateway configuration</p>
                      </div>
                      <span className="ml-auto bg-gray-500/30 text-gray-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 48 hours
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-gray-500">•</span><span>Apply for NMI Gateway (Flat Rate or Interchange+)</span></li>
                          <li className="flex gap-2 items-start"><span className="text-gray-500">•</span><span>Configure gateway credentials, API keys, webhooks</span></li>
                          <li className="flex gap-2 items-start"><span className="text-gray-500">•</span><span>Configure fraud filters and risk settings</span></li>
                          <li className="flex gap-2 items-start"><span className="text-gray-500">•</span><span>For <strong className="text-foreground">Gateway Only</strong> deals: Voided Check + VAR/Tear Sheet are the only required documents</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Integration when:</strong>
                        <span className="text-muted-foreground"> Gateway credentials issued and configuration complete.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 7: Integration Setup */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-gray-800/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-gray-800 flex items-center justify-center">
                        <Settings className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 7: Integration</h3>
                        <p className="text-sm text-muted-foreground">Merchant integrating with gateway</p>
                      </div>
                      <span className="ml-auto bg-gray-500/30 text-gray-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 48 hours
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-gray-500">•</span><span>Support merchant with API integration or plugin setup</span></li>
                          <li className="flex gap-2 items-start"><span className="text-gray-500">•</span><span>Provide sandbox credentials for testing</span></li>
                          <li className="flex gap-2 items-start"><span className="text-gray-500">•</span><span>Complex integrations escalated to Darryn</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Testing when:</strong>
                        <span className="text-muted-foreground"> Integration complete, ready for test transactions.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 8: Testing */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-indigo-700/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-indigo-700 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 8: Testing</h3>
                        <p className="text-sm text-muted-foreground">Test transactions and validation</p>
                      </div>
                      <span className="ml-auto bg-indigo-500/30 text-indigo-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 24 hours
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-indigo-500">•</span><span>Run test transactions to verify connectivity</span></li>
                          <li className="flex gap-2 items-start"><span className="text-indigo-500">•</span><span>Verify settlement and reporting</span></li>
                          <li className="flex gap-2 items-start"><span className="text-indigo-500">•</span><span>Confirm fraud filter operation</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Go Live Ready when:</strong>
                        <span className="text-muted-foreground"> All test transactions successful, merchant confirms readiness.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 9: Go Live Ready */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-emerald-600/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-emerald-600 flex items-center justify-center">
                        <Rocket className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 9: Go Live Ready</h3>
                        <p className="text-sm text-muted-foreground">Final checks before live processing</p>
                      </div>
                      <span className="ml-auto bg-emerald-500/30 text-emerald-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 24 hours
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-emerald-500">•</span><span>Confirm first live transaction processed successfully</span></li>
                          <li className="flex gap-2 items-start"><span className="text-emerald-500">•</span><span>Provide merchant with support contacts and resources</span></li>
                          <li className="flex gap-2 items-start"><span className="text-emerald-500">•</span><span>Initiate PCI compliance workflow (SAQ)</span></li>
                          <li className="flex gap-2 items-start"><span className="text-emerald-500">•</span><span>Schedule 30-day check-in for ongoing support</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Set outcome to Closed Won when:</strong>
                        <span className="text-muted-foreground"> Merchant is live and billing. Hand off to support team (Yaseen Sheik).</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 10: Closed Won */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-emerald-500/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-emerald-500 flex items-center justify-center">
                        <Trophy className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 10: Closed Won</h3>
                        <p className="text-sm text-muted-foreground">Live merchant — tracked in Live & Billing</p>
                      </div>
                      <span className="ml-auto bg-emerald-500/30 text-emerald-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Active
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-emerald-500">•</span><span>Update account status to Active</span></li>
                          <li className="flex gap-2 items-start"><span className="text-emerald-500">•</span><span>Appears in <strong className="text-foreground">Live & Billing</strong> report</span></li>
                          <li className="flex gap-2 items-start"><span className="text-emerald-500">•</span><span>Post-go-live support owned exclusively by Yaseen Sheik</span></li>
                          <li className="flex gap-2 items-start"><span className="text-emerald-500">•</span><span>Transaction monitoring via NMI dashboard (Taryn)</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Terminal Outcomes */}
                  <div className="mt-8 mb-4">
                    <h3 className="font-bold text-foreground text-lg flex items-center gap-2 mb-2">
                      <XCircle className="w-5 h-5 text-destructive" /> Terminal Outcomes (Off-Board)
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Setting an outcome removes the deal from the active pipeline board, records reason/notes/close date/closer, and disables further stage movement.
                      Full outcome details, reason codes, and re-engagement task rules are documented in the <a href="#outcome-rules" className="text-primary underline">Outcome & Pipeline Rules</a> section below.
                    </p>
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-destructive/5 rounded-none border border-destructive/20 p-4">
                      <h4 className="font-semibold text-foreground mb-1 flex items-center gap-2 text-sm">
                        <XCircle className="w-4 h-4 text-destructive" /> Closed Lost
                      </h4>
                      <p className="text-xs text-muted-foreground">Lost to competitor or merchant withdrew. Status → dead. No email sent.</p>
                    </div>
                    <div className="bg-purple-500/5 rounded-none border border-purple-500/20 p-4">
                      <h4 className="font-semibold text-foreground mb-1 flex items-center gap-2 text-sm">
                        <XCircle className="w-4 h-4 text-purple-500" /> Disqualified
                      </h4>
                      <p className="text-xs text-muted-foreground">Does not meet eligibility. Status → dead. <strong className="text-amber-500">Email sent.</strong></p>
                    </div>
                    <div className="bg-accent/30 rounded-none border border-border p-4">
                      <h4 className="font-semibold text-foreground mb-1 flex items-center gap-2 text-sm">
                        <AlertTriangle className="w-4 h-4 text-muted-foreground" /> No Decision / Dead
                      </h4>
                      <p className="text-xs text-muted-foreground">Gone silent or paused. Status → dead. No email sent.</p>
                    </div>
                    <div className="bg-orange-500/5 rounded-none border border-orange-500/20 p-4">
                      <h4 className="font-semibold text-foreground mb-1 flex items-center gap-2 text-sm">
                        <XCircle className="w-4 h-4 text-orange-500" /> UW Declined
                      </h4>
                      <p className="text-xs text-muted-foreground">Declined by underwriting. Status → dead. <strong className="text-amber-500">Adverse action email sent.</strong></p>
                    </div>
                  </div>
                </section>

                {/* ═══ TEAM ORGANOGRAM SECTION ═══ */}
                <section id="team-organogram" className="bg-card rounded-none border-2 border-border p-8">
                  <div className="flex items-center justify-between">
                    <SectionHeader sectionId="team-organogram" sectionTitle="Team Organogram">7.0 — Team Organogram</SectionHeader>
                    <div className="flex items-center gap-2 print:hidden">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 rounded-none"
                        onClick={() => {
                          const el = document.getElementById('team-organogram');
                          if (!el) return;
                          // Expand all collapsibles temporarily
                          const triggers = el.querySelectorAll('[data-state="closed"]');
                          triggers.forEach(t => (t as HTMLElement).click());
                          setTimeout(() => {
                            document.body.classList.add('organogram-printing');
                            window.print();
                            document.body.classList.remove('organogram-printing');
                          }, 300);
                        }}
                      >
                        <Download className="h-3 w-3" />
                        Print
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 rounded-none"
                        onClick={() => window.open('/docs/MerchantHaus_Team_Organogram_v3.pdf', '_blank')}
                      >
                        <Download className="h-3 w-3" />
                        Download PDF
                      </Button>
                      <span className="bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5 rounded-none flex items-center gap-1">
                        <Users className="w-3 h-3" /> Structure
                      </span>
                    </div>
                  </div>
                  <TeamOrganogram />
                </section>

                {/* ═══ ATRIA AI ASSISTANT SECTION ═══ */}
                <section id="atria-ai" className="bg-card rounded-none border-2 border-purple-500/30 p-8">
                  <div className="flex items-center justify-between">
                    <SectionHeader sectionId="atria-ai" sectionTitle="Atria AI Assistant">3.0 — Atria AI Assistant</SectionHeader>
                    <span className="bg-purple-500/20 text-purple-400 text-xs font-semibold px-2.5 py-0.5 rounded-none flex items-center gap-1">
                      <Bot className="w-3 h-3" /> AI Teammate
                    </span>
                  </div>

                  <p className="text-muted-foreground mb-6 italic border-l-4 border-purple-500 pl-4 bg-purple-500/10 py-2 pr-2">
                    Atria is an AI teammate accessible via the <strong className="text-foreground">#atria-ai</strong> channel in the team messenger. She has full visibility into live CRM data and can take actions on your behalf.
                  </p>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-secondary/30 rounded-none border border-border p-5">
                      <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                        <Search className="w-4 h-4 text-purple-400" /> What Atria Can See
                      </h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span>Full account roster with inception dates, contacts, and metadata</span></li>
                        <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span>Complete pipeline with stage, status, and assignment data</span></li>
                        <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span>All documents across all opportunities</span></li>
                        <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span>Latest AI validation reports with readiness scores</span></li>
                        <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span>Open tasks, team members, and activity</span></li>
                        <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span>SOP procedures, email templates, and checklists</span></li>
                      </ul>
                    </div>
                    <div className="bg-secondary/30 rounded-none border border-border p-5">
                      <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-purple-400" /> What Atria Can Do
                      </h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span><strong className="text-foreground">Create tasks</strong> — with title, assignee, priority, due date, linked opportunity</span></li>
                        <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span><strong className="text-foreground">Update opportunity stage</strong> — move deals between pipeline stages</span></li>
                        <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span><strong className="text-foreground">Assign opportunities</strong> — assign deals to any team member</span></li>
                        <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span><strong className="text-foreground">Update opportunity status</strong> — set to active, dead, or closed-lost</span></li>
                      </ul>
                      <div className="mt-4 p-3 rounded-none border border-purple-500/20 bg-purple-500/5">
                        <p className="text-xs text-muted-foreground">
                          <strong className="text-foreground">Example:</strong> "Assign the ABC Corp deal to Jamie" or "Create a high priority task for Yaseen Sheik to follow up on documents for XYZ account."
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-secondary/30 rounded-none border border-border p-5">
                    <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-purple-400" /> AI Document Validation
                    </h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      A separate "AI Validate" action in the Documents tab triggers Gemini to cross-reference uploaded files against application data, generating structured readiness reports stored in the system.
                    </p>
                    <div className="flex gap-4 text-xs mt-3">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Ready</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Needs Attention</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Not Ready</span>
                    </div>
                  </div>
                </section>

                {/* PS Terminal Usage Guide */}
                <section id="ps-terminal" className="bg-card rounded-none border border-border p-8">
                  <div className="flex items-center justify-between">
                    <SectionHeader gold sectionId="ps-terminal" sectionTitle="PS Terminal Usage Guide">3.1 — PS Terminal Usage Guide</SectionHeader>
                    <span className="bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold))] text-xs font-semibold px-2.5 py-0.5 rounded-none flex items-center gap-1">
                      <Settings className="w-3 h-3" /> Internal Tool
                    </span>
                  </div>
                  
                  <p className="text-muted-foreground mb-6 italic border-l-4 border-[hsl(var(--gold))] pl-4 bg-[hsl(var(--gold))]/10 py-2 pr-2">
                    The PS Terminal is the internal CRM and pipeline management system for tracking opportunities from lead to live merchant.
                  </p>

                  <div className="grid md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-secondary/30 rounded-none border border-border p-5">
                      <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                        <Rocket className="w-4 h-4 text-[hsl(var(--gold))]" /> Getting Started
                      </h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">1.</span><span>Sign in with your MerchantHaus account credentials</span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">2.</span><span>The <strong className="text-foreground">Pipeline</strong> view shows dual boards: Gateway and Processing</span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">3.</span><span>Click <strong className="text-foreground">+New</strong> to create an opportunity (accessible from any page)</span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">4.</span><span>Use the sidebar to navigate between Pipeline, Opportunities, Tasks, Accounts, Contacts, and Reports</span></li>
                      </ul>
                    </div>

                    <div className="bg-secondary/30 rounded-none border border-border p-5">
                      <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[hsl(var(--gold))]" /> Creating Opportunities
                      </h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>Fill in <strong className="text-foreground">Account Name</strong> (business name) and <strong className="text-foreground">Contact</strong> details</span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>Select <strong className="text-foreground">Pipeline Type</strong>: Gateway (existing processor) or Processing (full stack)</span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>Assign an <strong className="text-foreground">Owner</strong> (team member responsible)</span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>The opportunity starts in <strong className="text-foreground">Discovery</strong> stage</span></li>
                      </ul>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-secondary/30 rounded-none border border-border p-5">
                      <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                        <ClipboardCheck className="w-4 h-4 text-[hsl(var(--gold))]" /> Preboarding Wizard
                      </h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>Access from opportunity detail modal → <strong className="text-foreground">Open Wizard</strong></span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>Use as <strong className="text-foreground">application readiness form</strong> before microsite submission</span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>Captures: Business info, ownership details, processing needs, banking, and agreement</span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>Progress auto-saves and syncs to the opportunity</span></li>
                      </ul>
                    </div>

                    <div className="bg-secondary/30 rounded-none border border-border p-5">
                      <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[hsl(var(--gold))]" /> Managing Pipeline
                      </h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>Drag cards between stages to update progress</span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>Click any card to open full details, notes, tasks, and documents</span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>Add <strong className="text-foreground">Notes</strong> for each interaction</span></li>
                        <li className="flex gap-2 items-start"><span className="text-[hsl(var(--gold))]">•</span><span>Create <strong className="text-foreground">Tasks</strong> to track follow-ups</span></li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-[hsl(var(--gold))]/10 rounded-none border border-[hsl(var(--gold))]/30 p-5">
                    <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-[hsl(var(--gold))]" /> Key Features
                    </h3>
                    <div className="grid md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                      <div>
                        <strong className="text-foreground block mb-1">Dual Pipeline View</strong>
                        <span>Gateway and Processing opportunities displayed side-by-side</span>
                      </div>
                      <div>
                        <strong className="text-foreground block mb-1">Real-time Updates</strong>
                        <span>Changes sync instantly across all team members</span>
                      </div>
                      <div>
                        <strong className="text-foreground block mb-1">Dark/Light Themes</strong>
                        <span>Toggle in sidebar or choose from Settings → Appearance</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* NMI Microsite Application Process */}
                <section id="microsite-application" className="bg-card rounded-none border-2 border-primary/30 p-8">
                  <div className="flex items-center justify-between">
                    <SectionHeader sectionId="microsite-application" sectionTitle="NMI Microsite Application">3.2 — NMI Microsite Application Process</SectionHeader>
                    <span className="bg-destructive/20 text-destructive text-xs font-semibold px-2.5 py-0.5 rounded-none flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Internal Only
                    </span>
                  </div>

                  <p className="text-muted-foreground mb-6 italic border-l-4 border-primary pl-4 bg-primary/10 py-2 pr-2">
                    The NMI microsites are used internally to submit processing applications. The Preboarding Wizard should be completed first to gather all required merchant information.
                  </p>

                  <div className="grid md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-secondary/30 rounded-none border border-border p-5">
                      <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-green-500" /> Flat Rate Microsite
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        For merchants preferring simple, predictable pricing with a fixed rate per transaction.
                      </p>
                      <a
                        href="https://merchanthaus-fr.nmipays.com/form/MerchantHaus-fr"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-green-500/20 text-green-400 px-4 py-2 rounded-none text-sm font-medium hover:bg-green-500/30 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" /> Open Flat Rate Form
                      </a>
                      <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                        <li>• Best for: Small businesses, predictable volume</li>
                        <li>• Simple pricing structure</li>
                        <li>• Faster approval process</li>
                      </ul>
                    </div>

                    <div className="bg-secondary/30 rounded-none border border-border p-5">
                      <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-500" /> Interchange+ Microsite
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        For merchants with higher volume who benefit from transparent cost-plus pricing.
                      </p>
                      <a
                        href="https://merchanthaus-ic.nmipays.com/form/MerchantHaus-ic"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-blue-500/20 text-blue-400 px-4 py-2 rounded-none text-sm font-medium hover:bg-blue-500/30 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" /> Open Interchange+ Form
                      </a>
                      <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                        <li>• Best for: High volume, B2B, large ticket</li>
                        <li>• Transparent pass-through pricing</li>
                        <li>• Lower effective rates for qualified transactions</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-[hsl(var(--gold))]/10 rounded-none border border-[hsl(var(--gold))]/30 p-5 mb-6">
                    <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-[hsl(var(--gold))]" /> Application Workflow
                    </h3>
                    <ol className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex gap-3 items-start">
                        <span className="bg-[hsl(var(--gold))]/30 text-[hsl(var(--gold))] w-6 h-6 rounded-none flex items-center justify-center text-xs font-bold shrink-0">1</span>
                        <span><strong className="text-foreground">Complete Preboarding Wizard:</strong> Ensure all merchant details are captured in the PS Terminal wizard before proceeding.</span>
                      </li>
                      <li className="flex gap-3 items-start">
                        <span className="bg-[hsl(var(--gold))]/30 text-[hsl(var(--gold))] w-6 h-6 rounded-none flex items-center justify-center text-xs font-bold shrink-0">2</span>
                        <span><strong className="text-foreground">Choose Pricing Model:</strong> Select Flat Rate or Interchange+ based on merchant volume and business type.</span>
                      </li>
                      <li className="flex gap-3 items-start">
                        <span className="bg-[hsl(var(--gold))]/30 text-[hsl(var(--gold))] w-6 h-6 rounded-none flex items-center justify-center text-xs font-bold shrink-0">3</span>
                        <span><strong className="text-foreground">Submit Microsite Application:</strong> Transfer all information from wizard to the appropriate NMI microsite form.</span>
                      </li>
                      <li className="flex gap-3 items-start">
                        <span className="bg-[hsl(var(--gold))]/30 text-[hsl(var(--gold))] w-6 h-6 rounded-none flex items-center justify-center text-xs font-bold shrink-0">4</span>
                        <span><strong className="text-foreground">Update Pipeline Stage:</strong> Move opportunity to "Underwriting" stage in PS Terminal.</span>
                      </li>
                      <li className="flex gap-3 items-start">
                        <span className="bg-[hsl(var(--gold))]/30 text-[hsl(var(--gold))] w-6 h-6 rounded-none flex items-center justify-center text-xs font-bold shrink-0">5</span>
                        <span><strong className="text-foreground">Monitor for Approval:</strong> Track status via NMI partner portal and update PS Terminal accordingly.</span>
                      </li>
                    </ol>
                  </div>

                  <div className="bg-muted/50 rounded-none p-4 text-sm">
                    <strong className="text-foreground">Important:</strong>
                    <span className="text-muted-foreground"> Never share microsite links directly with merchants. These forms are for internal use only. The Preboarding Wizard serves as the merchant-facing application readiness tool.</span>
                  </div>
                </section>

                {/* Step 4 Internal - now 3.3 */}
                <section id="step4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-['Playfair_Display'] text-xl font-bold text-foreground">
                      3.3 — Processing & Gateway Setup
                    </h2>
                    <span className="bg-destructive/20 text-destructive text-xs font-semibold px-2.5 py-0.5 rounded-none flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Internal Only
                    </span>
                  </div>

                  <div className="bg-card rounded-none border-2 border-destructive/30 p-6">
                    <p className="text-destructive font-bold mb-4 text-[10px] uppercase tracking-[0.3em]">
                      Do not send to merchant
                    </p>
                    <div className="text-muted-foreground">
                      <p className="mb-2">
                        Once Step 3 (Application in Process email) is complete and all documents are collected:
                      </p>
                      <ol className="list-decimal pl-5 space-y-2 mb-4">
                        <li>
                          Apply for the <strong className="text-foreground">processing account</strong> using the MerchantHaus microsite.
                        </li>
                        <li>
                          After processing approval, choose setup path:
                          <ul className="list-disc pl-5 mt-1 text-sm">
                            <li><strong className="text-foreground">Path A:</strong> Use approved processing details to apply for NMI Gateway.</li>
                            <li><strong className="text-foreground">Path B (Existing):</strong> Use VAR sheet to apply for NMI Gateway and map configuration.</li>
                          </ul>
                        </li>
                        <li>Confirm submission and move file to the next workflow stage.</li>
                      </ol>
                    </div>
                  </div>
                </section>

                {/* Action Items */}
                <section id="action-items" className="bg-card rounded-none border border-border p-8">
                  <SectionHeader gold sectionId="action-items" sectionTitle="Action Items & Standards">3.4 — Action Items & Standards</SectionHeader>

                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <CheckSquare className="w-5 h-5 text-[hsl(var(--gold))]" /> Required Actions
                      </h3>
                      <ul className="space-y-3 text-sm text-muted-foreground">
                        <li className="flex gap-2 items-start"><span className="text-primary">•</span><span><strong className="text-foreground">Banking:</strong> Add details, verify deposit/withdrawal routing.</span></li>
                        <li className="flex gap-2 items-start"><span className="text-primary">•</span><span><strong className="text-foreground">Gateway:</strong> Configure access links, deliver secure credentials.</span></li>
                        <li className="flex gap-2 items-start"><span className="text-primary">•</span><span><strong className="text-foreground">API:</strong> Enable keys/webhooks for integrations.</span></li>
                        <li className="flex gap-2 items-start"><span className="text-primary">•</span><span><strong className="text-foreground">MID:</strong> Confirm assignment & descriptor alignment.</span></li>
                        <li className="flex gap-2 items-start"><span className="text-primary">•</span><span><strong className="text-foreground">VAR:</strong> Upload sheet, confirm mapping.</span></li>
                        <li className="flex gap-2 items-start"><span className="text-primary">•</span><span><strong className="text-foreground">Test:</strong> Run transaction to verify connectivity.</span></li>
                        <li className="flex gap-2 items-start"><span className="text-primary">•</span><span><strong className="text-foreground">PCI:</strong> Initiate compliance workflow (SAQ).</span></li>
                        <li className="flex gap-2 items-start"><span className="text-primary">•</span><span><strong className="text-foreground">CRM:</strong> Verify notes & attach documents.</span></li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-[hsl(var(--gold))]" /> Industry Standards
                      </h3>
                      <ul className="space-y-3 text-sm text-muted-foreground">
                        <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span><span><strong className="text-foreground">KYC/KYB:</strong> Identity & corporate structure validated.</span></li>
                        <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span><span><strong className="text-foreground">Risk:</strong> Fraud filters, AVS/CVV rules, velocity checks set.</span></li>
                        <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span><span><strong className="text-foreground">Descriptors:</strong> Soft/Hard descriptors accurate.</span></li>
                        <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span><span><strong className="text-foreground">Settlement:</strong> Schedule set by volume/risk.</span></li>
                        <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span><span><strong className="text-foreground">Disputes:</strong> Portal access granted, timelines explained.</span></li>
                        <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span><span><strong className="text-foreground">Handoff:</strong> Support contacts provided.</span></li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Services Overview */}
                <section id="services-overview" className="bg-card rounded-none border border-border p-8">
                  <SectionHeader gold sectionId="services-overview" sectionTitle="Services Overview">4. MerchantHaus Services Overview</SectionHeader>
                  <p className="text-muted-foreground mb-6 italic border-l-4 border-[hsl(var(--gold))] pl-4 bg-[hsl(var(--gold))]/10 py-2 pr-2">
                    Reference guide for core services offered through MerchantHaus. Use this information when discussing solutions with merchants.
                  </p>

                  <div className="grid md:grid-cols-3 gap-4 mb-8">
                    {[
                      { title: "Payment Processing", desc: "Accept all major credit cards, debit cards, and digital wallets with competitive rates and instant settlements." },
                      { title: "Fraud Detection", desc: "Multi-layered fraud prevention with AI-powered scoring (Kount), 3D Secure, and rule-based risk controls." },
                      { title: "Mobile Solutions", desc: "Mobile-ready technology and POS systems for on-the-go businesses with TXT2PAY billing tools." },
                      { title: "Global Payments", desc: "Multi-currency support and local payment methods in over 200 countries through 175+ processor connections." },
                      { title: "Network Tokenization", desc: "Enhanced payment security and approval rates with Customer Token Vault for recurring billing." },
                      { title: "Ecommerce Solutions", desc: "200+ shopping cart integrations including Shopify, Magento, WooCommerce, Wix, and Squarespace." },
                      { title: "Subscription Billing", desc: "Automated recurring billing with Automatic Card Updater to reduce failed payments and churn." },
                      { title: "Chargeback Management", desc: "Automated dispute handling with up to 70% reduction in chargebacks using built-in fraud protection." },
                      { title: "Data & Analytics", desc: "Real-time transaction analytics, custom reporting dashboards, and Level III data optimization." },
                    ].map((svc) => (
                      <div key={svc.title} className="bg-secondary/30 rounded-none border border-border p-4">
                        <h3 className="font-bold text-foreground mb-2 text-sm">{svc.title}</h3>
                        <p className="text-xs text-muted-foreground">{svc.desc}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-gradient-to-r from-primary/10 to-[hsl(var(--gold))]/10 rounded-none border border-border p-6">
                    <h3 className="font-bold text-foreground mb-4">Platform Highlights</h3>
                    <div className="grid md:grid-cols-4 gap-4 text-center">
                      <div>
                        <span className="text-2xl font-bold text-primary">99.99%</span>
                        <p className="text-xs text-muted-foreground">Uptime</p>
                      </div>
                      <div>
                        <span className="text-2xl font-bold text-[hsl(var(--gold))]">175+</span>
                        <p className="text-xs text-muted-foreground">Processor Connections</p>
                      </div>
                      <div>
                        <span className="text-2xl font-bold text-green-400">Level 1</span>
                        <p className="text-xs text-muted-foreground">PCI DSS Certified</p>
                      </div>
                      <div>
                        <span className="text-2xl font-bold text-[hsl(var(--gold))]">7-10 Days</span>
                        <p className="text-xs text-muted-foreground">ACH Settlement</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid md:grid-cols-2 gap-4">
                    <div className="bg-muted/50 rounded-none p-4">
                      <h4 className="font-bold text-foreground text-sm mb-2">Pricing Tiers</h4>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li><strong className="text-foreground">Starter ($59/mo):</strong> Fraud-first foundation, mobile gateway, TXT2PAY</li>
                        <li><strong className="text-foreground">Intermediate ($99/mo):</strong> + Kount AI Fraud Manager, priority support, API access</li>
                        <li><strong className="text-foreground">Pro ($149/mo):</strong> + Level III Advantage, Shopify integration, custom analytics</li>
                        <li><strong className="text-foreground">Enterprise (Custom):</strong> + SLA guarantees, multi-entity, dedicated engineering</li>
                      </ul>
                    </div>
                    <div className="bg-muted/50 rounded-none p-4">
                      <h4 className="font-bold text-foreground text-sm mb-2">Key Integrations</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {["Shopify", "Magento", "WooCommerce", "Wix", "Squarespace", "QuickBooks", "FreshBooks", "Salesforce", "HubSpot", "Zoho CRM", "Clover", "NCR"].map((item) => (
                          <span key={item} className="bg-background px-1.5 py-0.5 rounded-none border border-border text-xs text-muted-foreground">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* NMI Schedule A — Gateway & Processing Pricing Reference */}
                <section id="nmi-pricing-schedule" className="bg-card rounded-none border-2 border-[hsl(var(--gold))]/40 p-8">
                  <SectionHeader gold sectionId="nmi-pricing-schedule" sectionTitle="NMI Schedule A — Gateway & Processing Pricing">
                    4.3 — NMI Schedule A — Gateway & Processing Pricing
                  </SectionHeader>
                  <p className="text-muted-foreground mb-6 italic border-l-4 border-[hsl(var(--gold))] pl-4 bg-[hsl(var(--gold))]/10 py-2 pr-2">
                    Authoritative reference extracted from the signed NMI All-in-One Plan proposal for merchanthaus.io
                    (effective 14 Nov 2025). All partner-side costs and merchant-facing rates feed the Quote Generator.
                    Confidential — share externally only via formal quote.
                  </p>

                  {/* Schedule A — Base Rates */}
                  <div className="mb-8">
                    <h3 className="text-foreground font-bold text-base mb-3">Schedule A — Base Processing Rates</h3>
                    <div className="overflow-x-auto border border-border rounded-none">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/50">
                          <tr><th className="text-left p-3 font-semibold">Item</th><th className="text-right p-3 font-semibold">Rate</th></tr>
                        </thead>
                        <tbody>
                          {NMI_SCHEDULE_A_RATES.map((r) => (
                            <tr key={r.name} className="border-t border-border">
                              <td className="p-3 text-muted-foreground">{r.name}</td>
                              <td className="p-3 text-right font-mono text-foreground">{r.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Revenue-eligible fees */}
                  <div className="mb-8">
                    <h3 className="text-foreground font-bold text-base mb-1">Revenue-Eligible Fees</h3>
                    <p className="text-xs text-muted-foreground mb-3">These costs are deducted before MerchantHaus's 30% revenue share is applied.</p>
                    <div className="overflow-x-auto border border-border rounded-none">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/50">
                          <tr>
                            <th className="text-left p-3 font-semibold">Fee</th>
                            <th className="text-right p-3 font-semibold">Partner Cost</th>
                            <th className="text-right p-3 font-semibold">Merchant Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {NMI_REVENUE_ELIGIBLE_FEES.map((r) => (
                            <tr key={r.label} className="border-t border-border">
                              <td className="p-3 text-muted-foreground">{r.label}</td>
                              <td className="p-3 text-right font-mono">{r.partner}</td>
                              <td className="p-3 text-right font-mono text-foreground">{r.merchant}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Non-revenue passthrough */}
                  <div className="mb-8">
                    <h3 className="text-foreground font-bold text-base mb-1">Passthrough Fees (Not Revenue-Eligible)</h3>
                    <p className="text-xs text-muted-foreground mb-3">Billed to merchant; partner cost equals merchant rate — no MerchantHaus margin.</p>
                    <div className="overflow-x-auto border border-border rounded-none">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/50">
                          <tr>
                            <th className="text-left p-3 font-semibold">Fee</th>
                            <th className="text-right p-3 font-semibold">Partner Cost</th>
                            <th className="text-right p-3 font-semibold">Merchant Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {NMI_NON_REVENUE_FEES.map((r) => (
                            <tr key={r.label} className="border-t border-border">
                              <td className="p-3 text-muted-foreground">{r.label}</td>
                              <td className="p-3 text-right font-mono">{r.partner}</td>
                              <td className="p-3 text-right font-mono text-foreground">{r.merchant}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Gateway add-ons */}
                  <div className="mb-8">
                    <h3 className="text-foreground font-bold text-base mb-3">Gateway Features & Add-Ons</h3>
                    <div className="overflow-x-auto border border-border rounded-none">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/50">
                          <tr>
                            <th className="text-left p-3 font-semibold">Group</th>
                            <th className="text-left p-3 font-semibold">Feature</th>
                            <th className="text-left p-3 font-semibold">Description</th>
                            <th className="text-right p-3 font-semibold">Partner Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {NMI_GATEWAY_FEATURES.map((f) => (
                            <tr key={f.name} className="border-t border-border">
                              <td className="p-3 text-xs uppercase tracking-wider text-[hsl(var(--gold))]">{f.group}</td>
                              <td className="p-3 font-semibold text-foreground">{f.name}</td>
                              <td className="p-3 text-muted-foreground text-xs">{f.description}</td>
                              <td className="p-3 text-right font-mono text-xs">{f.partnerCost}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* One-time fees */}
                  <div>
                    <h3 className="text-foreground font-bold text-base mb-3">One-Time Service Fees</h3>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {NMI_ONE_TIME_FEES.map((f) => (
                        <div key={f.label} className="flex justify-between border border-border bg-secondary/30 px-3 py-2 text-sm">
                          <span className="text-muted-foreground">{f.label}</span>
                          <span className="font-mono text-foreground">{f.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 text-xs text-muted-foreground border-t border-border pt-4">
                    Source: NMI All-in-One Plan proposal, signed by Taryn Engledoe on 2025-11-14.
                    Use these figures as the baseline for all merchant quotes generated through the
                    Quote Generator.
                  </div>
                </section>

                {/* Referral Program */}
                <section id="referral-program" className="bg-card rounded-none border-2 border-[hsl(var(--gold))]/40 p-8">
                  <SectionHeader gold sectionId="referral-program" sectionTitle="Referral Partner Program">
                    Referral Partner Program
                  </SectionHeader>
                  <p className="text-sm text-muted-foreground mb-6">
                    The MerchantHaus Referral Partner Program rewards partners who introduce qualified merchants.
                    Terms below govern every active referrer profile and are enforced in the partner portal so
                    earnings can never display above the stipulated caps.
                  </p>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-secondary/40 p-5 rounded-none border border-border">
                      <h4 className="font-bold text-foreground mb-3 uppercase tracking-[0.2em] text-[11px]">Revenue Share</h4>
                      <ul className="text-sm text-muted-foreground space-y-2">
                        <li><strong className="text-foreground">50%</strong> of MerchantHaus's company commission, paid monthly per referred merchant.</li>
                        <li>Calculated from net processor settlement after interchange, scheme fees, and processor cost.</li>
                        <li>Earnings are visible in the partner portal at the close of each monthly cycle.</li>
                      </ul>
                    </div>
                    <div className="bg-secondary/40 p-5 rounded-none border border-border">
                      <h4 className="font-bold text-foreground mb-3 uppercase tracking-[0.2em] text-[11px]">Caps & Ceilings</h4>
                      <ul className="text-sm text-muted-foreground space-y-2">
                        <li><strong className="text-foreground">$500</strong> lifetime cap per referred account.</li>
                        <li><strong className="text-foreground">10 accounts</strong> maximum eligible per partner.</li>
                        <li><strong className="text-foreground">$5,000</strong> total program ceiling per partner ($500 × 10).</li>
                        <li>Accounts beyond the 10-account ceiling are visible but ineligible for payout.</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-[hsl(var(--gold))]/5 p-5 rounded-none border border-[hsl(var(--gold))]/40 mb-6">
                    <h4 className="font-bold text-foreground mb-2 uppercase tracking-[0.2em] text-[11px]">Milestone Bonus</h4>
                    <p className="text-sm text-muted-foreground">
                      A <strong className="text-foreground">$500 bonus</strong> is paid for every{" "}
                      <strong className="text-foreground">5 successfully boarded merchants</strong> (live and
                      processing). Bonuses are paid in addition to commission revenue share and accumulate over
                      the lifetime of the partnership.
                    </p>
                  </div>

                  <div className="mb-6">
                    <h4 className="font-bold text-foreground mb-3 uppercase tracking-[0.2em] text-[11px]">Calculation Model</h4>
                    <div className="bg-secondary/40 p-4 rounded-none border border-border font-mono text-xs text-muted-foreground space-y-1">
                      <div>per_account_payout = MIN(company_commission × 0.50, $500_remaining)</div>
                      <div>lifetime_payout    = SUM(per_account_payout) up to 10 eligible accounts</div>
                      <div>program_cap        = $500 × 10 = $5,000</div>
                      <div>milestone_bonus    = FLOOR(successful_merchants / 5) × $500</div>
                      <div>total_earnings     = MIN(lifetime_payout, $5,000) + milestone_bonus</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-foreground mb-3 uppercase tracking-[0.2em] text-[11px]">Operating Rules</h4>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-5">
                      <li>Referrers submit leads through the Partner Portal at <code className="text-xs bg-secondary px-1.5 py-0.5">/affiliate/referral</code>; submissions automatically tag <code className="text-xs bg-secondary px-1.5 py-0.5">applications.referral_source</code> with the partner's name.</li>
                      <li>The first 10 accounts (by earliest commission record date) are the eligible cohort. Subsequent accounts are tracked but display $0 with a "Beyond 10-account cap" badge.</li>
                      <li>Per-account payouts are capped client-side and server-side; values can never exceed $500 per account or $5,000 in aggregate.</li>
                      <li>Clawbacks apply within the standard 90-day window from a merchant's go-live date.</li>
                      <li>Partners are notified of milestone bonus thresholds in the portal earnings dashboard.</li>
                      <li>Program terms (rate, cap, ceiling, bonus) are stored on the <code className="text-xs bg-secondary px-1.5 py-0.5">referrers</code> record and can be adjusted per partner by Admin.</li>
                    </ol>
                  </div>
                </section>


                <section id="appendix" className="bg-secondary/50 rounded-none border border-border p-8">
                  <h2 className="font-['Playfair_Display'] text-xl font-bold text-foreground mb-6">
                    Appendix — SOP Structure
                  </h2>
                  <div className="grid md:grid-cols-2 gap-6 text-sm">
                    <div>
                      <h4 className="font-bold text-foreground mb-2">Best Practices</h4>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        <li><strong>Structure:</strong> Title, Purpose, Trigger, Owner, Output.</li>
                        <li><strong>Version Control:</strong> Maintain revision logs.</li>
                        <li><strong>Alignment:</strong> Sync Ops, Risk, Underwriting, Eng.</li>
                        <li><strong>Dependencies:</strong> Map prerequisites clearly.</li>
                        <li><strong>KPIs:</strong> Track turnaround, approval rates.</li>
                        <li><strong>Compliance:</strong> Tie PCI/KYC directly to checkpoints.</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground mb-2">Process Mapping Needs</h4>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        <li>Lead intake → CRM</li>
                        <li>Discovery → Solution fit</li>
                        <li>Docs → Underwriting readiness</li>
                        <li>Approval → Gateway config</li>
                        <li>VAR mapping</li>
                        <li>Activation → API → Testing</li>
                        <li>Training, Chargebacks, Support Handoff</li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* CRM Architecture & Tech Stack Document */}
                <section id="tech-stack" className="bg-sidebar rounded-none p-8 border border-border">
                  <div className="flex items-center justify-between mb-6 border-b border-border pb-2">
                    <h2 className="font-['Playfair_Display'] text-xl font-bold text-foreground">
                      CRM Architecture & Technical Reference
                    </h2>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 rounded-none"
                      onClick={() => {
                        const docContent = generateArchitectureDoc();
                        const blob = new Blob([docContent], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'MerchantHaus-CRM-Architecture.md';
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success('Architecture document downloaded');
                      }}
                    >
                      <Download className="h-4 w-4" />
                      Download .md
                    </Button>
                  </div>

                  <div className="space-y-8 text-sm">
                    {/* 1. Tech Stack */}
                    <div>
                      <h3 className="text-[hsl(var(--gold))] font-bold mb-3 text-base">1. Technology Stack</h3>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Frontend</h4>
                          <ul className="space-y-1.5 text-muted-foreground">
                            <li><strong className="text-foreground">Language:</strong> TypeScript (strict mode)</li>
                            <li><strong className="text-foreground">Framework:</strong> React 18 (SPA)</li>
                            <li><strong className="text-foreground">Build:</strong> Vite</li>
                            <li><strong className="text-foreground">Styling:</strong> Tailwind CSS + tailwindcss-animate</li>
                            <li><strong className="text-foreground">Components:</strong> shadcn/ui (Radix primitives)</li>
                            <li><strong className="text-foreground">State:</strong> React Query (TanStack) + React Context</li>
                            <li><strong className="text-foreground">Routing:</strong> React Router v6</li>
                            <li><strong className="text-foreground">Forms:</strong> React Hook Form + Zod validation</li>
                            <li><strong className="text-foreground">Charts:</strong> Recharts</li>
                            <li><strong className="text-foreground">Animation:</strong> Framer Motion</li>
                            <li><strong className="text-foreground">Mobile:</strong> Capacitor (Android wrapper)</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Backend (Lovable Cloud)</h4>
                          <ul className="space-y-1.5 text-muted-foreground">
                            <li><strong className="text-foreground">Database:</strong> PostgreSQL (managed)</li>
                            <li><strong className="text-foreground">Auth:</strong> Supabase Auth (email + password)</li>
                            <li><strong className="text-foreground">API:</strong> Auto-generated REST + Realtime WebSockets</li>
                            <li><strong className="text-foreground">Edge Functions:</strong> Deno runtime (serverless)</li>
                            <li><strong className="text-foreground">Storage:</strong> Private buckets with signed URLs</li>
                            <li><strong className="text-foreground">Security:</strong> Row-Level Security (RLS) on all tables</li>
                            <li><strong className="text-foreground">Encryption:</strong> AES-256-GCM for PII (server-side)</li>
                          </ul>
                          <h4 className="font-semibold text-foreground mt-4 mb-2">SaaS Ecosystem</h4>
                          <div className="flex flex-wrap gap-2">
                            {["Resend", "Netlify", "GitHub", "OpenPhone", "Google Workspace", "Gemini AI", "Lovable"].map((item) => (
                              <span key={item} className="bg-background px-2 py-1 rounded-none border border-border text-muted-foreground">{item}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. Auth & Roles */}
                    <div>
                      <h3 className="text-[hsl(var(--gold))] font-bold mb-3 text-base">2. Authentication & User Roles</h3>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Auth Flow</h4>
                          <ul className="space-y-1.5 text-muted-foreground">
                            <li>Email + password sign-in (no anonymous signups)</li>
                            <li>Email verification required before first login</li>
                            <li>Password reset via email link → <code className="text-xs bg-background px-1 rounded-none">/update-password</code></li>
                            <li>Force-password-change on first login (admin-triggered)</li>
                            <li>Session tracking in <code className="text-xs bg-background px-1 rounded-none">user_sessions</code> table</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Role Types</h4>
                          <div className="space-y-3">
                            <div className="p-3 rounded-none border border-border bg-background/50">
                              <div className="flex items-center gap-2 mb-1">
                                <Shield className="h-4 w-4 text-primary" />
                                <strong className="text-foreground">Admin</strong>
                              </div>
                              <p className="text-muted-foreground text-xs">Full CRUD on all data. Master exports. User management. Channel administration. Deletion request approval.</p>
                              <p className="text-muted-foreground text-xs mt-1">Users: admin@merchanthaus.io, onboarding@merchanthaus.io</p>
                            </div>
                            <div className="p-3 rounded-none border border-border bg-background/50">
                              <div className="flex items-center gap-2 mb-1">
                                <Users className="h-4 w-4 text-[hsl(var(--gold))]" />
                                <strong className="text-foreground">User (Standard)</strong>
                              </div>
                              <p className="text-muted-foreground text-xs">Pipeline management. Task creation. Chat & DMs. Document upload. Contact editing.</p>
                              <p className="text-muted-foreground text-xs mt-1">Users: support@, sales@, taryn@merchanthaus.io</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 p-3 rounded-none border border-border bg-background/50">
                        <h4 className="font-semibold text-foreground mb-2">Access Control Architecture</h4>
                        <ul className="space-y-1 text-muted-foreground text-xs">
                          <li>• <strong className="text-foreground">Allowlist:</strong> Only 5 authorized emails can authenticate</li>
                          <li>• <strong className="text-foreground">RLS:</strong> All tables enforce <code className="bg-background px-1 rounded-none">auth.uid() IS NOT NULL</code></li>
                          <li>• <strong className="text-foreground">Admin check:</strong> <code className="bg-background px-1 rounded-none">is_admin_email()</code> SQL function (security definer)</li>
                          <li>• <strong className="text-foreground">Role check:</strong> <code className="bg-background px-1 rounded-none">has_role(uuid, app_role)</code> — separate <code className="bg-background px-1 rounded-none">user_roles</code> table</li>
                          <li>• <strong className="text-foreground">Public forms:</strong> INSERT-only policies for merchant applications & consents</li>
                        </ul>
                      </div>
                    </div>

                    {/* 3. Data Architecture */}
                    <div>
                      <h3 className="text-[hsl(var(--gold))] font-bold mb-3 text-base">3. Data Architecture</h3>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Core Tables</h4>
                          <ul className="space-y-1 text-muted-foreground text-xs">
                            <li><code className="bg-background px-1 rounded-none">accounts</code> — Merchant businesses</li>
                            <li><code className="bg-background px-1 rounded-none">contacts</code> — People linked to accounts</li>
                            <li><code className="bg-background px-1 rounded-none">opportunities</code> — Pipeline deals (FK → accounts, contacts)</li>
                            <li><code className="bg-background px-1 rounded-none">tasks</code> — Assignable work items</li>
                            <li><code className="bg-background px-1 rounded-none">documents</code> — Files per opportunity (private bucket)</li>
                            <li><code className="bg-background px-1 rounded-none">activities</code> — Audit trail per opportunity</li>
                            <li><code className="bg-background px-1 rounded-none">comments</code> — Discussion threads</li>
                            <li><code className="bg-background px-1 rounded-none">validation_reports</code> — AI readiness assessments</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Onboarding & Compliance</h4>
                          <ul className="space-y-1 text-muted-foreground text-xs">
                            <li><code className="bg-background px-1 rounded-none">applications</code> — Public merchant submissions</li>
                            <li><code className="bg-background px-1 rounded-none">merchants</code> — Detailed business profiles (1:1 with app)</li>
                            <li><code className="bg-background px-1 rounded-none">principals</code> — Beneficial owners (1:many)</li>
                            <li><code className="bg-background px-1 rounded-none">bank_accounts</code> — Settlement details (1:1)</li>
                            <li><code className="bg-background px-1 rounded-none">application_secrets</code> — Encrypted PII (auto-purged)</li>
                            <li><code className="bg-background px-1 rounded-none">merchant_consents</code> — Legal agreements with IP/UA</li>
                            <li><code className="bg-background px-1 rounded-none">application_documents</code> — File audit trail</li>
                          </ul>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-3 gap-6 mt-4">
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Communication</h4>
                          <ul className="space-y-1 text-muted-foreground text-xs">
                            <li><code className="bg-background px-1 rounded-none">chat_channels</code> + <code className="bg-background px-1 rounded-none">chat_messages</code> — Team chat</li>
                            <li><code className="bg-background px-1 rounded-none">direct_messages</code> — 1:1 DMs</li>
                            <li><code className="bg-background px-1 rounded-none">message_reactions</code> — Emoji reactions</li>
                            <li><code className="bg-background px-1 rounded-none">notifications</code> — Bell notifications</li>
                            <li><code className="bg-background px-1 rounded-none">push_subscriptions</code> — Web push</li>
                            <li><code className="bg-background px-1 rounded-none">call_logs</code> — Phone records + transcripts</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Outreach</h4>
                          <ul className="space-y-1 text-muted-foreground text-xs">
                            <li><code className="bg-background px-1 rounded-none">outreach_campaigns</code> — Campaign definitions</li>
                            <li><code className="bg-background px-1 rounded-none">outreach_contacts</code> — Recipient tracking</li>
                            <li><code className="bg-background px-1 rounded-none">cadence_steps</code> — Multi-step email cadences</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">System</h4>
                          <ul className="space-y-1 text-muted-foreground text-xs">
                            <li><code className="bg-background px-1 rounded-none">profiles</code> — User data (auto-created)</li>
                            <li><code className="bg-background px-1 rounded-none">user_roles</code> — Role assignments</li>
                            <li><code className="bg-background px-1 rounded-none">user_sessions</code> — Login tracking</li>
                            <li><code className="bg-background px-1 rounded-none">action_items</code> — Notice board</li>
                            <li><code className="bg-background px-1 rounded-none">deletion_requests</code> — Soft-delete queue</li>
                            <li><code className="bg-background px-1 rounded-none">onboarding_wizard_states</code> — Wizard progress</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* 4. Notification Routing */}
                    <div>
                      <h3 className="text-[hsl(var(--gold))] font-bold mb-3 text-base">4. Notification Routing</h3>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Bell Notifications (In-App)</h4>
                          <ul className="space-y-1.5 text-muted-foreground">
                            <li>• Task assignments → bell + email + system DM</li>
                            <li>• Notice board tags → bell + system DM</li>
                            <li>• Pipeline assignments → bell + email + system DM</li>
                            <li>• New web submissions → bell (all team members)</li>
                          </ul>
                          <div className="mt-3 p-2 rounded-none border border-border bg-background/50">
                            <p className="text-xs text-muted-foreground"><strong className="text-foreground">Excluded:</strong> Channel messages and DMs use their own unread indicators in the messenger — no bell notifications.</p>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Other Channels</h4>
                          <ul className="space-y-1.5 text-muted-foreground">
                            <li>• <strong className="text-foreground">Push (VAPID):</strong> Channel messages + DMs to offline users</li>
                            <li>• <strong className="text-foreground">Email (Resend):</strong> Task assignments, stage changes, opportunity assignments</li>
                            <li>• <strong className="text-foreground">System DMs:</strong> Automated messages from Ops-Update bot</li>
                            <li>• <strong className="text-foreground">#ops-updates:</strong> System channel for pipeline events</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* 5. AI Assistant */}
                    <div>
                      <h3 className="text-[hsl(var(--gold))] font-bold mb-3 text-base">5. AI Assistant — Atria</h3>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Read Access (Live Snapshot)</h4>
                          <ul className="space-y-1.5 text-muted-foreground">
                            <li>• Full account roster with inception dates & contacts</li>
                            <li>• Complete pipeline with stage/status/assignment data</li>
                            <li>• All documents across all opportunities</li>
                            <li>• Latest AI validation reports with readiness scores</li>
                            <li>• Open tasks, team members, and activity</li>
                            <li>• SOP procedures, checklists, and email templates</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Write Actions (Tool-Calling)</h4>
                          <ul className="space-y-1.5 text-muted-foreground">
                            <li>• <strong className="text-foreground">Create tasks</strong> — title, assignee, priority, due date, linked opportunity</li>
                            <li>• <strong className="text-foreground">Update stage</strong> — move deals between pipeline stages</li>
                            <li>• <strong className="text-foreground">Assign deals</strong> — assign to any team member</li>
                            <li>• <strong className="text-foreground">Update status</strong> — active, dead, closed-lost</li>
                          </ul>
                          <div className="mt-3 p-2 rounded-none border border-border bg-background/50">
                            <p className="text-xs text-muted-foreground">Accessible via <strong className="text-foreground">#atria-ai</strong> channel. Powered by Google Gemini via Lovable AI gateway.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 6. Security */}
                    <div>
                      <h3 className="text-[hsl(var(--gold))] font-bold mb-3 text-base">6. Security Model</h3>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Data Protection</h4>
                          <ul className="space-y-1.5 text-muted-foreground">
                            <li>• RLS enabled on every table — no exceptions</li>
                            <li>• AES-256-GCM encryption for PII in <code className="text-xs bg-background px-1 rounded-none">application_secrets</code></li>
                            <li>• Auto-purge trigger on underwriting status change</li>
                            <li>• Private storage with signed URL access</li>
                            <li>• Soft-delete workflow with admin approval</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground mb-2">Edge Functions</h4>
                          <ul className="space-y-1.5 text-muted-foreground">
                            <li>• <code className="text-xs bg-background px-1 rounded-none">ai-assistant</code> — Atria AI (chat + tools + validation)</li>
                            <li>• <code className="text-xs bg-background px-1 rounded-none">encrypt-secrets</code> — PII encryption</li>
                            <li>• <code className="text-xs bg-background px-1 rounded-none">send-notification-email</code> — Transactional emails</li>
                            <li>• <code className="text-xs bg-background px-1 rounded-none">send-push-notification</code> — Web push</li>
                            <li>• <code className="text-xs bg-background px-1 rounded-none">export-data</code> — Admin ZIP export</li>
                            <li>• <code className="text-xs bg-background px-1 rounded-none">quo-proxy</code> — Telephony integration</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* 7. Pipeline */}
                    <div>
                      <h3 className="text-[hsl(var(--gold))] font-bold mb-3 text-base">7. Pipeline & Workflow</h3>
                      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs font-bold">
                        {["discovery", "qualification", "preboarding", "underwriting", "boarding", "live"].map((s, i) => (
                          <div key={s} className="flex items-center gap-2">
                            <code className="bg-background px-2 py-1 border border-border text-foreground">{s}</code>
                            {i < 5 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                          </div>
                        ))}
                      </div>
                      <ul className="space-y-1.5 text-muted-foreground">
                        <li>• <strong className="text-foreground">Service Types:</strong> Processing, Gateway Only, Document Submission</li>
                        <li>• <strong className="text-foreground">SLA Tracking:</strong> Automatic 24-hour SLA tasks on stage entry</li>
                        <li>• <strong className="text-foreground">Realtime:</strong> Pipeline, chat, notifications use WebSocket subscriptions</li>
                        <li>• <strong className="text-foreground">Auto-assignment:</strong> Web submissions at 100% completion → support@merchanthaus.io</li>
                        <li>• <strong className="text-foreground">AI Validation:</strong> On-demand document readiness checks via Gemini</li>
                      </ul>
                    </div>

                    {/* Data Integrity Rules */}
                    <section id="outcome-rules" className="print:break-before-page">
                      <h2 className="text-2xl font-bold text-primary border-b-4 border-cyan-500 inline-block mb-6 pb-1">
                        Data Integrity Rules
                      </h2>
                      <p className="text-muted-foreground mb-6 italic border-l-4 border-destructive pl-4 bg-destructive/5 py-2 pr-2 rounded-r">
                        These rules are enforced by the system. Breaking them will cause data corruption, reporting errors, and pipeline inconsistencies.
                      </p>

                      {/* Outcome Rules */}
                      <div id="outcome-rules" className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Shield className="w-5 h-5 text-destructive" />
                          <h3 className="font-bold text-lg text-foreground">Outcome & Pipeline Rules</h3>
                        </div>
                        <div className="space-y-4">

                          {/* Closed Won */}
                          <div className="bg-emerald-500/5 rounded-lg border border-emerald-500/20 p-4">
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <Trophy className="w-4 h-4 text-emerald-500" /> Closed Won <span className="text-xs text-emerald-500 ml-2">13 reasons</span>
                            </h4>
                            <p className="text-sm text-muted-foreground mb-2">
                              The only positive outcome. Status is set to <code className="text-xs bg-background px-1 rounded">won</code> and the opportunity appears in <strong className="text-foreground">Live & Billing</strong>. Removed from the pipeline board.
                            </p>
                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-primary hover:underline cursor-pointer">
                                <ChevronDown className="w-3 h-3" /> View all 13 reason codes
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <ul className="mt-2 text-xs text-muted-foreground space-y-0.5 columns-2">
                                  <li>• Competitive pricing win (IC+)</li>
                                  <li>• Gateway feature fit (NMI)</li>
                                  <li>• Faster underwriting / approval</li>
                                  <li>• POS / eCommerce integration match</li>
                                  <li>• Omnichannel solution (CP + CNP)</li>
                                  <li>• High-risk vertical acceptance</li>
                                  <li>• Chargeback / fraud tool suite</li>
                                  <li>• Relationship / referral win</li>
                                  <li>• Contract buyout / ETF coverage</li>
                                  <li>• White-label / branding alignment</li>
                                  <li>• Interchange optimization</li>
                                  <li>• Superior onboarding experience</li>
                                  <li>• Value-added services bundle</li>
                                </ul>
                              </CollapsibleContent>
                            </Collapsible>
                            <div className="text-xs text-muted-foreground mt-2">
                              <strong className="text-foreground">Client email:</strong> <span className="text-emerald-600 dark:text-emerald-400">None — no notification sent</span>
                            </div>
                          </div>

                          {/* Closed Lost */}
                          <div className="bg-destructive/5 rounded-lg border border-destructive/20 p-4">
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-destructive" /> Closed Lost <span className="text-xs text-destructive ml-2">15 reasons</span>
                            </h4>
                            <p className="text-sm text-muted-foreground mb-2">
                              <strong className="text-foreground">Internal status only.</strong> Lost to competitor or merchant withdrew. Status → <code className="text-xs bg-background px-1 rounded">dead</code>.
                            </p>
                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-primary hover:underline cursor-pointer">
                                <ChevronDown className="w-3 h-3" /> View all 15 reason codes
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <ul className="mt-2 text-xs text-muted-foreground space-y-0.5 columns-2">
                                  <li>• Lost to flat-rate competitor</li>
                                  <li>• Lost to another ISO on price</li>
                                  <li>• Lost to bank-direct acquiring</li>
                                  <li>• Chose embedded PayFac / software</li>
                                  <li>• Locked into current processor (ETF)</li>
                                  <li>• Pricing model mismatch</li>
                                  <li>• Gateway / integration incompatibility</li>
                                  <li>• Hardware limitations</li>
                                  <li>• Funding / settlement timing</li>
                                  <li>• Satisfied with incumbent</li>
                                  <li>• Lost on fraud / chargeback tools</li>
                                  <li>• Volume too low for IC+ benefit</li>
                                  <li>• Switching risk aversion</li>
                                  <li>• Lost on contract terms</li>
                                  <li>• Decision-maker change</li>
                                </ul>
                              </CollapsibleContent>
                            </Collapsible>
                            <div className="text-xs text-muted-foreground mt-2">
                              <strong className="text-foreground">Client email:</strong> <span className="text-emerald-600 dark:text-emerald-400">None — internal status</span>
                              <br />
                              <strong className="text-foreground">Re-engagement tasks:</strong> <span>7 of 15 reasons auto-create follow-up tasks (30–180 days)</span>
                            </div>
                          </div>

                          {/* No Decision / Dead */}
                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-muted-foreground" /> No Decision / Dead <span className="text-xs text-muted-foreground ml-2">13 reasons</span>
                            </h4>
                            <p className="text-sm text-muted-foreground mb-2">
                              <strong className="text-foreground">Internal status only.</strong> Client went silent, paused, or stopped engaging. Status → <code className="text-xs bg-background px-1 rounded">dead</code>.
                            </p>
                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-primary hover:underline cursor-pointer">
                                <ChevronDown className="w-3 h-3" /> View all 13 reason codes
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <ul className="mt-2 text-xs text-muted-foreground space-y-0.5 columns-2">
                                  <li>• Merchant went non-responsive</li>
                                  <li>• Stalled at document collection</li>
                                  <li>• Internal priority shift</li>
                                  <li>• Timing not right (seasonal)</li>
                                  <li>• Decision-maker unavailable</li>
                                  <li>• Analysis paralysis</li>
                                  <li>• Business closure / pre-closure</li>
                                  <li>• Abandoned during integration</li>
                                  <li>• Ownership / management change</li>
                                  <li>• Stalled at PCI compliance</li>
                                  <li>• Lost contact information</li>
                                  <li>• Duplicate opportunity</li>
                                  <li>• External disruption</li>
                                </ul>
                              </CollapsibleContent>
                            </Collapsible>
                            <div className="text-xs text-muted-foreground mt-2">
                              <strong className="text-foreground">Client email:</strong> <span className="text-emerald-600 dark:text-emerald-400">None — internal status</span>
                              <br />
                              <strong className="text-foreground">Re-engagement tasks:</strong> <span>5 of 13 reasons auto-create follow-up tasks (14–90 days). 8 reasons intentionally produce no task (no actionable re-engagement path).</span>
                            </div>
                          </div>

                          {/* Disqualified */}
                          <div className="bg-purple-500/5 rounded-lg border border-purple-500/20 p-4">
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-purple-500" /> Disqualified <span className="text-xs text-purple-500 ml-2">14 reasons</span>
                            </h4>
                            <p className="text-sm text-muted-foreground mb-2">
                              Does not meet eligibility criteria. Status → <code className="text-xs bg-background px-1 rounded">dead</code>. <strong className="text-foreground">A compliance notification email is automatically sent.</strong>
                            </p>
                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-primary hover:underline cursor-pointer">
                                <ChevronDown className="w-3 h-3" /> View all 14 reason codes
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <ul className="mt-2 text-xs text-muted-foreground space-y-0.5 columns-2">
                                  <li>• Prohibited MCC / product category</li>
                                  <li>• Industry monitoring database hit</li>
                                  <li>• Government watchlist match</li>
                                  <li>• Insufficient business history / no EIN</li>
                                  <li>• Unacceptable business structure</li>
                                  <li>• Processing volume below minimum</li>
                                  <li>• Non-U.S. domiciled business</li>
                                  <li>• Excessive chargeback history</li>
                                  <li>• Previously terminated by processor</li>
                                  <li>• PCI non-compliance (unwilling)</li>
                                  <li>• Unsupported business model</li>
                                  <li>• Principal credit disqualification</li>
                                  <li>• Fraudulent / misrepresented application</li>
                                  <li>• High-risk MCC outside program scope</li>
                                </ul>
                              </CollapsibleContent>
                            </Collapsible>
                            <div className="text-xs text-muted-foreground mt-2">
                              <strong className="text-foreground">Client email:</strong> <span className="text-amber-600 dark:text-amber-400">✉️ Yes — disqualification notification sent automatically</span>
                              <br />
                              <strong className="text-foreground">Permanent suppression:</strong> <span>6 of 14 reasons are permanently suppressed — no re-engagement task will ever be created (OFAC, MATCH/TMF, AML, fraud, prohibited MCC, previously terminated).</span>
                            </div>
                          </div>

                          {/* Underwriting Declined */}
                          <div className="bg-orange-500/5 rounded-lg border border-orange-500/20 p-4">
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-orange-500" /> Underwriting Declined <span className="text-xs text-orange-500 ml-2">15 reasons</span>
                            </h4>
                            <p className="text-sm text-muted-foreground mb-2">
                              Formally declined by underwriting. Status → <code className="text-xs bg-background px-1 rounded">dead</code>. <strong className="text-foreground">An adverse action notice email (ECOA/FCRA compliant) is automatically sent.</strong>
                            </p>
                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-primary hover:underline cursor-pointer">
                                <ChevronDown className="w-3 h-3" /> View all 15 reason codes
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <ul className="mt-2 text-xs text-muted-foreground space-y-0.5 columns-2">
                                  <li>• Industry database — excessive chargebacks</li>
                                  <li>• Industry database — fraud history</li>
                                  <li>• Industry database — other listing</li>
                                  <li>• Principal credit below threshold</li>
                                  <li>• Excessive chargeback ratio (current)</li>
                                  <li>• Unverifiable business / KYC failure</li>
                                  <li>• AML / compliance screening</li>
                                  <li>• Financial instability / bankruptcy</li>
                                  <li>• MCC reclassification (higher risk)</li>
                                  <li>• Website / marketing non-compliance</li>
                                  <li>• Volume / avg ticket inconsistency</li>
                                  <li>• Incomplete docs / UW timeout</li>
                                  <li>• Prohibited product discovered in UW</li>
                                  <li>• Reserve requirement rejected</li>
                                  <li>• Third-party processing discovered</li>
                                </ul>
                              </CollapsibleContent>
                            </Collapsible>
                            <div className="text-xs text-muted-foreground mt-2">
                              <strong className="text-foreground">Client email:</strong> <span className="text-amber-600 dark:text-amber-400">✉️ Yes — adverse action notice (ECOA + FCRA) sent automatically</span>
                              <br />
                              <strong className="text-foreground">Re-engagement tasks:</strong> <span>5 of 15 reasons auto-create follow-up tasks (14–180 days). Remaining reasons are permanently suppressed or have no remediation path.</span>
                            </div>
                          </div>

                          {/* Re-engagement Task Automation */}
                          <div className="bg-primary/5 rounded-lg border border-primary/20 p-4">
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <Clock className="w-4 h-4 text-primary" /> Re-engagement Task Automation
                            </h4>
                            <p className="text-sm text-muted-foreground mb-3">
                              When an outcome is confirmed, the system automatically creates a dated follow-up task for the assigned rep — <strong className="text-foreground">unless</strong> the reason is permanently suppressed. Tasks appear in the Opportunity Detail view and My Tasks.
                            </p>
                            <div className="grid md:grid-cols-3 gap-3 text-xs text-muted-foreground">
                              <div className="bg-background/50 rounded p-2 border border-border">
                                <strong className="text-foreground block mb-1">Closed Lost (7 tasks)</strong>
                                <p>30–180 day "Win-back" tasks for competitive losses, ETF lockouts, and decision-maker changes.</p>
                              </div>
                              <div className="bg-background/50 rounded p-2 border border-border">
                                <strong className="text-foreground block mb-1">No Decision (5 tasks)</strong>
                                <p>14–90 day "Re-engage" tasks for non-responsive, stalled docs, timing, and PCI holds.</p>
                              </div>
                              <div className="bg-background/50 rounded p-2 border border-border">
                                <strong className="text-foreground block mb-1">UW Declined (5 tasks)</strong>
                                <p>14–180 day "Re-application" tasks for remediable reasons (credit, chargebacks, docs, website, reserves).</p>
                              </div>
                            </div>
                            <div className="mt-3 p-2 rounded bg-destructive/5 border border-destructive/20 text-xs text-muted-foreground">
                              <strong className="text-foreground">Permanent Suppression:</strong> 9 reason codes are permanently blocked from creating re-engagement tasks: OFAC/sanctions matches, MATCH/TMF database hits, AML flags, fraudulent applications, prohibited MCC, and previously terminated merchants.
                            </div>
                          </div>

                          {/* Outcome Requirements */}
                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-primary" /> Outcome Requirements
                            </h4>
                            <ul className="space-y-1.5 text-sm text-muted-foreground">
                              <li>• Every outcome requires a <strong className="text-foreground">reason</strong> (selected from the granular reason codes above)</li>
                              <li>• Optional <strong className="text-foreground">notes</strong> for additional context</li>
                              <li>• System records <strong className="text-foreground">who</strong> set the outcome and <strong className="text-foreground">when</strong></li>
                              <li>• An activity log entry is automatically created with human-readable labels</li>
                              <li>• Outcomes are <strong className="text-foreground">permanent</strong> — once set, the outcome cannot be changed (contact admin)</li>
                              <li>• Only <strong className="text-foreground">Underwriting Declined</strong> and <strong className="text-foreground">Disqualified</strong> trigger a client-facing email</li>
                              <li>• Reason dropdown populates dynamically based on selected outcome status</li>
                              <li>• Confirm button disabled until both status AND reason are selected</li>
                              <li>• Email-triggering outcomes show an <strong className="text-amber-500">amber warning</strong> in the modal footer</li>
                            </ul>
                          </div>

                          {/* Submission Confirmation Emails */}
                          <div className="bg-primary/5 rounded-lg border border-primary/20 p-4">
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <Mail className="w-4 h-4 text-primary" /> Submission Confirmation Emails
                            </h4>
                            <p className="text-sm text-muted-foreground mb-3">
                              When a merchant submits an application or contact inquiry, a <strong className="text-foreground">confirmation email is automatically sent</strong> to the applicant acknowledging receipt. This applies to all submission types:
                            </p>
                            <ul className="space-y-1.5 text-sm text-muted-foreground mb-3">
                              <li>• <strong className="text-foreground">Processing Application</strong> — Full application with underwriting documents</li>
                              <li>• <strong className="text-foreground">Gateway Only Application</strong> — Lighter application for existing processor clients</li>
                              <li>• <strong className="text-foreground">Document Submission</strong> — Supplementary document uploads</li>
                              <li>• <strong className="text-foreground">Contact Inquiry</strong> — General business inquiry via the contact form</li>
                            </ul>

                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-primary hover:underline cursor-pointer">
                                <Mail className="w-3 h-3" /> View Application Confirmation Email Template
                                <ChevronDown className="w-3 h-3" />
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-3 bg-background border border-border rounded-lg p-4 text-xs text-muted-foreground space-y-2">
                                  <p className="text-foreground font-semibold text-sm">Subject: Application Received — [Company Name]</p>
                                  <p className="text-[10px] text-muted-foreground">From: onboarding@merchanthaus.io</p>
                                  <hr className="border-border" />
                                  <p>Dear [First Name],</p>
                                  <p>Thank you for submitting your <strong>[Service Type]</strong> application for <strong>[Company Name]</strong> with Merchant Haus. We have successfully received your submission and all accompanying documentation.</p>
                                  <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded p-2 text-emerald-700 dark:text-emerald-400">
                                    ✅ Your application is now being reviewed by our team. You can expect to hear from us within <strong>1–2 business days</strong>.
                                  </div>
                                  <p>During the review process, a member of our onboarding team may reach out if any additional information is needed. There is no action required from you at this time.</p>
                                  <hr className="border-border" />
                                  <p>If you have any questions in the meantime, please don't hesitate to contact us at <strong>onboarding@merchanthaus.io</strong>.</p>
                                  <p className="text-foreground">Kind regards,<br /><strong>The Merchant Haus Team</strong></p>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>

                            <Collapsible>
                              <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-primary hover:underline cursor-pointer mt-2">
                                <Mail className="w-3 h-3" /> View Contact Inquiry Confirmation Email Template
                                <ChevronDown className="w-3 h-3" />
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-3 bg-background border border-border rounded-lg p-4 text-xs text-muted-foreground space-y-2">
                                  <p className="text-foreground font-semibold text-sm">Subject: Thank you for contacting Merchant Haus</p>
                                  <p className="text-[10px] text-muted-foreground">From: sales@merchanthaus.io</p>
                                  <hr className="border-border" />
                                  <p>Hi [First Name],</p>
                                  <p>Thank you for reaching out to Merchant Haus. We've received your inquiry and a member of our sales team will be in touch with you shortly.</p>
                                  <p>In the meantime, if you have any additional questions, feel free to reply to this email or contact us at <strong>sales@merchanthaus.io</strong>.</p>
                                  <p className="text-foreground">Kind regards,<br /><strong>The Merchant Haus Team</strong></p>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </div>

                        </div>
                      </div>

                      {/* Record Lifecycle */}
                      <div id="record-lifecycle" className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Activity className="w-5 h-5 text-primary" />
                          <h3 className="font-bold text-lg text-foreground">Record Lifecycle</h3>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2">Records Are Never Deleted</h4>
                            <ul className="space-y-1.5 text-sm text-muted-foreground">
                              <li>• Dead/declined opportunities remain in the <strong className="text-foreground">Opportunities list</strong></li>
                              <li>• All associated data is preserved: accounts, contacts, documents, activities, comments, wizard state</li>
                              <li>• Dead records show at <strong className="text-foreground">60% opacity</strong> with a red badge</li>
                              <li>• Permanent deletion requires <strong className="text-foreground">admin approval</strong> via the Deletion Requests page</li>
                            </ul>
                          </div>
                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2">Reactivation</h4>
                            <ul className="space-y-1.5 text-sm text-muted-foreground">
                              <li>• Archived opportunities can be reactivated by <strong className="text-foreground">assigning a team member</strong></li>
                              <li>• Reactivation requires confirmation dialog</li>
                              <li>• Status reverts to <code className="text-xs bg-background px-1 rounded">active</code></li>
                              <li>• Opportunity returns to pipeline at its previous stage</li>
                              <li>• Activity log records the reactivation event</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Data Standards */}
                      <div id="data-standards" className="bg-card rounded-xl border border-border shadow-sm p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <ClipboardCheck className="w-5 h-5 text-amber-500" />
                          <h3 className="font-bold text-lg text-foreground">Data Standards</h3>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2">Pipeline Integrity</h4>
                            <ul className="space-y-1.5 text-sm text-muted-foreground">
                              <li>• Only <code className="text-xs bg-background px-1 rounded">status = active</code> opportunities appear on the pipeline board</li>
                              <li>• Opportunities with any <code className="text-xs bg-background px-1 rounded">outcome_status</code> are excluded from the board</li>
                              <li>• Stage movement is disabled once an outcome is set</li>
                              <li>• SLA timers reset on every stage change</li>
                              <li>• Drag-and-drop is blocked for opportunities with outcomes</li>
                            </ul>
                          </div>
                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2">Required Data Flow</h4>
                            <ul className="space-y-1.5 text-sm text-muted-foreground">
                              <li>• Every opportunity must have an <strong className="text-foreground">Account</strong> and <strong className="text-foreground">Contact</strong></li>
                              <li>• Wizard state auto-syncs between account/contact fields and preboarding form</li>
                              <li>• Service type determines which pipeline stages are available</li>
                              <li>• Processing approved → auto-creates Gateway card if none exists</li>
                              <li>• All field changes are <strong className="text-foreground">auto-saved</strong> with debounced persistence</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Android Build Guide */}
                    <section id="android-build" className="print:break-before-page">
                      <h2 className="text-2xl font-bold text-primary border-b-4 border-cyan-500 inline-block mb-6 pb-1">
                        Android Build Guide
                      </h2>
                      <p className="text-muted-foreground mb-6 italic border-l-4 border-primary pl-4 bg-primary/5 py-2 pr-2 rounded-r">
                        Step-by-step instructions for building, running, and publishing the Ops Terminal Android app via Capacitor and Android Studio.
                      </p>

                      {/* Prerequisites */}
                      <div className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Settings className="w-5 h-5 text-primary" />
                          <h3 className="font-bold text-lg text-foreground">Prerequisites</h3>
                        </div>
                        <ul className="space-y-1.5 text-sm text-muted-foreground">
                          <li>• <strong className="text-foreground">Android Studio</strong> installed (latest stable)</li>
                          <li>• <strong className="text-foreground">Node.js</strong> and <strong className="text-foreground">npm</strong> installed</li>
                          <li>• Project cloned from GitHub and dependencies installed (<code className="text-xs bg-background px-1 rounded">npm install</code>)</li>
                          <li>• Android SDK and at least one emulator configured via <strong className="text-foreground">Tools → Device Manager</strong></li>
                          <li>• For physical devices: <strong className="text-foreground">USB debugging</strong> enabled in Developer Options</li>
                        </ul>
                      </div>

                      {/* Development Workflow */}
                      <div className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Zap className="w-5 h-5 text-amber-500" />
                          <h3 className="font-bold text-lg text-foreground">Development Workflow</h3>
                        </div>
                        <div className="space-y-4">
                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-3">Initial Setup (one-time)</h4>
                            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                              <li>Pull the latest code: <code className="text-xs bg-background px-1.5 py-0.5 rounded border border-border text-foreground">git pull && npm install</code></li>
                              <li>Add Android platform: <code className="text-xs bg-background px-1.5 py-0.5 rounded border border-border text-foreground">npx cap add android</code></li>
                              <li>Build the web assets: <code className="text-xs bg-background px-1.5 py-0.5 rounded border border-border text-foreground">npm run build</code></li>
                              <li>Sync to Android: <code className="text-xs bg-background px-1.5 py-0.5 rounded border border-border text-foreground">npx cap sync android</code></li>
                            </ol>
                          </div>

                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-3">After Every Code Change</h4>
                            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                              <li>Pull latest changes: <code className="text-xs bg-background px-1.5 py-0.5 rounded border border-border text-foreground">git pull && npm install</code></li>
                              <li>Build: <code className="text-xs bg-background px-1.5 py-0.5 rounded border border-border text-foreground">npm run build</code></li>
                              <li>Sync: <code className="text-xs bg-background px-1.5 py-0.5 rounded border border-border text-foreground">npx cap sync android</code></li>
                              <li>Run: <code className="text-xs bg-background px-1.5 py-0.5 rounded border border-border text-foreground">npx cap run android</code></li>
                            </ol>
                          </div>
                        </div>
                      </div>

                      {/* Android Studio Steps */}
                      <div className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Rocket className="w-5 h-5 text-emerald-500" />
                          <h3 className="font-bold text-lg text-foreground">Android Studio</h3>
                        </div>
                        <div className="space-y-4">
                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2">Open Project in Android Studio</h4>
                            <p className="text-sm text-muted-foreground">
                              Run <code className="text-xs bg-background px-1.5 py-0.5 rounded border border-border text-foreground">npx cap open android</code> to launch Android Studio with the project loaded.
                            </p>
                          </div>

                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2">Run on Device / Emulator</h4>
                            <p className="text-sm text-muted-foreground">
                              Click the green <strong className="text-foreground">▶️ Play</strong> button in the toolbar. Select your target device or emulator from the dropdown.
                            </p>
                          </div>

                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2">Build Debug APK</h4>
                            <p className="text-sm text-muted-foreground">
                              <strong className="text-foreground">Build → Build Bundle(s) / APK(s) → Build APK(s)</strong>. The APK will be output to <code className="text-xs bg-background px-1 rounded">android/app/build/outputs/apk/debug/</code>.
                            </p>
                          </div>

                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2">Generate Signed APK (Play Store)</h4>
                            <p className="text-sm text-muted-foreground">
                              <strong className="text-foreground">Build → Generate Signed Bundle / APK → APK</strong> → follow the keystore wizard. Use an existing keystore or create a new one. Select <strong className="text-foreground">release</strong> build variant.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Production Config */}
                      <div className="bg-card rounded-xl border border-border shadow-sm p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4">
                          <AlertTriangle className="w-5 h-5 text-amber-400" />
                          <h3 className="font-bold text-lg text-foreground">Production Configuration</h3>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-4">
                          <p className="text-sm text-muted-foreground mb-3">
                            <strong className="text-foreground">Important:</strong> Before building a production APK, ensure the <code className="text-xs bg-background px-1 rounded">server</code> block in <code className="text-xs bg-background px-1 rounded">capacitor.config.ts</code> is <strong className="text-foreground">removed or commented out</strong>.
                          </p>
                          <p className="text-sm text-muted-foreground mb-3">
                            The <code className="text-xs bg-background px-1 rounded">server.url</code> property is used for <strong className="text-foreground">hot-reload during development</strong> (pointing to the Lovable preview). For production, the app must serve files from the local <code className="text-xs bg-background px-1 rounded">dist/</code> folder bundled into the APK.
                          </p>
                          <pre className="text-xs text-foreground/80 font-mono bg-background/50 rounded-md p-3 border border-border overflow-x-auto">
{`// capacitor.config.ts — PRODUCTION
// Remove or comment out:
// server: {
//   url: "https://...",
//   cleartext: true
// }`}
                          </pre>
                        </div>
                      </div>

                      {/* Troubleshooting */}
                      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <HelpCircle className="w-5 h-5 text-primary" />
                          <h3 className="font-bold text-lg text-foreground">Troubleshooting</h3>
                        </div>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li>• <strong className="text-foreground">Gradle update prompt</strong> — Accept the update when Android Studio asks.</li>
                          <li>• <strong className="text-foreground">No devices found</strong> — Create an emulator via <strong className="text-foreground">Tools → Device Manager</strong> or connect a physical device with USB debugging.</li>
                          <li>• <strong className="text-foreground">White screen on launch</strong> — Ensure you ran <code className="text-xs bg-background px-1 rounded">npm run build</code> and <code className="text-xs bg-background px-1 rounded">npx cap sync android</code> before opening Android Studio.</li>
                          <li>• <strong className="text-foreground">API errors on device</strong> — Verify the device has internet access. For development, ensure the <code className="text-xs bg-background px-1 rounded">server.url</code> is reachable from the device's network.</li>
                          <li>• <strong className="text-foreground">Stale build</strong> — Run <code className="text-xs bg-background px-1 rounded">npx cap sync android</code> after every <code className="text-xs bg-background px-1 rounded">npm run build</code> to ensure web assets are current.</li>
                        </ul>
                      </div>
                    </section>

                  </div>
                </section>

              </div>
            </div>
      </div>
    </AppLayout>
  );
};

export default SOP;
