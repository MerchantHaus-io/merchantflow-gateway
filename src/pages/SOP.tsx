import { useState, useCallback } from "react";
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

const SOP = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

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
- **Users:** admin@merchanthaus.io, darryn@merchanthaus.io

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
- **Processing** — Full merchant onboarding with underwriting
- **Gateway Only** — Simplified gateway configuration flow (lightened requirements: Voided Check + VAR/Tear Sheet only, no AI validation or beneficial ownership gate)
- **Document Submission** — Compliance document uploads only

### Active Pipeline Stages
\`Discovery\` → \`Qualified\` → \`App Prep\` → \`Underwriting\` → \`Approved\` → \`Gateway Setup\` → \`Integration\` → \`Testing\` → \`Go Live Ready\`

### Terminal Outcomes (Off-Board)
Selecting an outcome removes the deal from the active board, records a reason/notes/close date/closer, and disables further stage movement:
- **Closed Won** — automatically tracked in Live & Billing report
- **Closed Lost** — sets status to 'dead', preserves historical data
- **Disqualified** — sets status to 'dead'
- **No Decision / Dead** — sets status to 'dead'
- **Underwriting Declined** — sets status to 'dead'

### Underwriting Gate (Processing Deals)
Before a deal can advance to Underwriting, it must pass document validation:
1. ≥ 3 separate Bank Statements or Transaction History documents
2. Articles of Organization
3. Tax Document (EIN)
4. Voided Check or Bank Confirmation
5. Passport or Driver's License (KYC)
6. ≥ 1 beneficial owner with 25%+ equity recorded

### Pipeline UX
- **Hybrid 75/25 layout** — Kanban board (top) + high-density List View (bottom, max-w-3xl)
- **Sticky column headers** — fixed during vertical scroll
- **Focus Mode** (\`?focus=true\`) — filters to active deals and tasks only
- **SLA velocity alerts** — two-tier system: amber at 12 hours, red at 24 hours (resets on stage movement)

### Automation
- SLA tracking: Automatic 24-hour SLA tasks on stage entry
- Realtime: Pipeline board, chat, and notifications use WebSocket subscriptions
- Auto-assignment: Web submissions at 100% completion assigned to support@merchanthaus.io
- Stage change notifications: Email + in-app + push notifications on assignment and stage transitions
- System messages: Automated chat posts to #ops-updates for assignments and key events
- AI validation: On-demand document readiness checks via Gemini
- Preboarding completion: "Mark Preboarding Complete" persists form state and logs activity but keeps the deal in App Prep for final review


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
        text: "Logic Step 1.2: If needed, schedule a discovery call.",
        link: "https://calendar.app.google/6F1xCy8DcVh8B4aR7",
        linkText: "Schedule a Call",
        skipNote: "If no call requested, skip to Step 2.",
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
      title: "Step 2 — Request for Documents",
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
            {/* SOP Navigation Sidebar */}
            <aside className="w-64 border-r border-border bg-card hidden lg:block overflow-y-auto">
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
                          <strong>5.3</strong> — Service Providers & SaaS Stack
                        </li>
                      </ul>

                      <h3 className="font-bold text-foreground mt-6 mb-3 uppercase tracking-[0.3em] text-[10px]">
                        Section 6 — External Artifacts
                      </h3>
                      <ul className="space-y-2 text-[hsl(var(--gold))] pl-2 border-l-2 border-[hsl(var(--gold))]">
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
                      { label: "Discovery", color: "bg-blue-500" },
                      { label: "Qualification", color: "bg-indigo-500" },
                      { label: "Preboarding", color: "bg-teal-500" },
                      { label: "Underwriting", color: "bg-purple-500" },
                      { label: "Boarding", color: "bg-orange-500" },
                      { label: "Live", color: "bg-green-500" },
                    ].map((s, i) => (
                      <div key={s.label} className="flex items-center gap-2">
                        <span className={`${s.color} text-white px-3 py-1.5 rounded-none`}>{s.label}</span>
                        {i < 5 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    ))}
                  </div>

                  {/* Stage 1: Discovery */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-blue-500/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-blue-500 flex items-center justify-center">
                        <Search className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 1: Discovery</h3>
                        <p className="text-sm text-muted-foreground">Initial contact and information gathering</p>
                      </div>
                      <span className="ml-auto bg-blue-500/30 text-blue-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 24 hours
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-blue-500">•</span><span>Send <strong className="text-foreground">Step 1 — Intro & Discovery</strong> email template</span></li>
                          <li className="flex gap-2 items-start"><span className="text-blue-500">•</span><span>Document business type, monthly volume, current processor</span></li>
                          <li className="flex gap-2 items-start"><span className="text-blue-500">•</span><span>Identify processing needs: Gateway only vs Full Processing</span></li>
                          <li className="flex gap-2 items-start"><span className="text-blue-500">•</span><span>Schedule a discovery call if needed (Step 1.2)</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Qualification when:</strong>
                        <span className="text-muted-foreground"> Business model understood, solution fit confirmed, merchant interested in proceeding.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 2: Qualification */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-indigo-500/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-indigo-500 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 2: Qualification</h3>
                        <p className="text-sm text-muted-foreground">Merchant confirmed as viable opportunity</p>
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
                          <li className="flex gap-2 items-start"><span className="text-indigo-500">•</span><span>Confirm merchant interest and commitment to proceed</span></li>
                          <li className="flex gap-2 items-start"><span className="text-indigo-500">•</span><span>Set appropriate pipeline: Processing or Gateway Only</span></li>
                          <li className="flex gap-2 items-start"><span className="text-indigo-500">•</span><span>Send <strong className="text-foreground">Step 2 — Request for Documents</strong> email</span></li>
                          <li className="flex gap-2 items-start"><span className="text-indigo-500">•</span><span>Create tasks for document follow-up</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Preboarding when:</strong>
                        <span className="text-muted-foreground"> Document request sent and acknowledged by merchant.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 3: Preboarding */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-teal-500/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-teal-500 flex items-center justify-center">
                        <ClipboardCheck className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 3: Preboarding</h3>
                        <p className="text-sm text-muted-foreground">Collecting documents and completing the preboarding wizard</p>
                      </div>
                      <span className="ml-auto bg-teal-500/30 text-teal-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 72 hours
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-teal-500">•</span><span>Collect all required documents (see Document Checklist)</span></li>
                          <li className="flex gap-2 items-start"><span className="text-teal-500">•</span><span>Verify document completeness and quality</span></li>
                          <li className="flex gap-2 items-start"><span className="text-teal-500">•</span><span>Complete the Preboarding Wizard (auto-saves progress)</span></li>
                          <li className="flex gap-2 items-start"><span className="text-teal-500">•</span><span>Send <strong className="text-foreground">Step 3 — Application in Process</strong> when ready</span></li>
                        </ul>
                      </div>
                      <div className="bg-[hsl(var(--gold))]/10 border border-[hsl(var(--gold))]/30 rounded-none p-3 text-sm">
                        <strong className="text-[hsl(var(--gold))] flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" /> Document Checklist:
                        </strong>
                        <ul className="mt-2 text-muted-foreground grid md:grid-cols-2 gap-1">
                          <li>✓ 3 months bank statements</li>
                          <li>✓ 3 months processing statements</li>
                          <li>✓ Voided check / bank letter</li>
                          <li>✓ Articles of Organization</li>
                          <li>✓ Owner ID (DL/Passport)</li>
                          <li>✓ SSN for principal owner</li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Underwriting when:</strong>
                        <span className="text-muted-foreground"> All documents collected, wizard completed, and application submitted via NMI microsite.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 4: Underwriting */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-purple-500/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-purple-500 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 4: Underwriting</h3>
                        <p className="text-sm text-muted-foreground">Application under review by processor</p>
                      </div>
                      <span className="ml-auto bg-purple-500/30 text-purple-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 3–5 days
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span>Monitor underwriting status daily</span></li>
                          <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span>Respond promptly to any stipulation requests</span></li>
                          <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span>Keep merchant informed of progress</span></li>
                          <li className="flex gap-2 items-start"><span className="text-purple-500">•</span><span>Run AI Validate to generate readiness report</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Boarding when:</strong>
                        <span className="text-muted-foreground"> Processor confirms approval and MID assigned.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 5: Boarding */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-orange-500/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-orange-500 flex items-center justify-center">
                        <Settings className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 5: Boarding</h3>
                        <p className="text-sm text-muted-foreground">Gateway setup, integration, and test transactions</p>
                      </div>
                      <span className="ml-auto bg-orange-500/30 text-orange-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <Clock className="w-3 h-3" /> SLA: 48 hours
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-orange-500">•</span><span>Confirm MID assignment and rate structure</span></li>
                          <li className="flex gap-2 items-start"><span className="text-orange-500">•</span><span>Apply for NMI Gateway (Flat Rate or Interchange+)</span></li>
                          <li className="flex gap-2 items-start"><span className="text-orange-500">•</span><span>Configure gateway credentials, API keys, webhooks</span></li>
                          <li className="flex gap-2 items-start"><span className="text-orange-500">•</span><span>Configure fraud filters and risk settings</span></li>
                          <li className="flex gap-2 items-start"><span className="text-orange-500">•</span><span>Run test transactions to verify connectivity</span></li>
                          <li className="flex gap-2 items-start"><span className="text-orange-500">•</span><span>Notify merchant of approval with timeline for activation</span></li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-none p-3 text-sm">
                        <strong className="text-foreground">Advance to Live when:</strong>
                        <span className="text-muted-foreground"> Test transactions successful, gateway configured, and merchant ready to process.</span>
                      </div>
                    </div>
                  </div>

                  {/* Stage 6: Live */}
                  <div className="mb-6 bg-secondary/30 rounded-none border border-border overflow-hidden">
                    <div className="bg-green-500/20 px-6 py-4 border-b border-border flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-green-500 flex items-center justify-center">
                        <Rocket className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-lg">Stage 6: Live</h3>
                        <p className="text-sm text-muted-foreground">Merchant processing live transactions</p>
                      </div>
                      <span className="ml-auto bg-green-500/30 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-none flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Active
                      </span>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                          <CheckSquare className="w-4 h-4 text-[hsl(var(--gold))]" /> Required Actions
                        </h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          <li className="flex gap-2 items-start"><span className="text-green-500">•</span><span>Confirm first live transaction processed successfully</span></li>
                          <li className="flex gap-2 items-start"><span className="text-green-500">•</span><span>Provide merchant with support contacts and resources</span></li>
                          <li className="flex gap-2 items-start"><span className="text-green-500">•</span><span>Initiate PCI compliance workflow (SAQ)</span></li>
                          <li className="flex gap-2 items-start"><span className="text-green-500">•</span><span>Schedule 30-day check-in for ongoing support</span></li>
                          <li className="flex gap-2 items-start"><span className="text-green-500">•</span><span>Update account status to Active and hand off to support team</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Status States */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-destructive/10 rounded-none border border-destructive/30 p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-none bg-destructive flex items-center justify-center">
                          <XCircle className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="font-bold text-foreground">Status: Dead</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Opportunity did not proceed. Can be set at any stage.
                      </p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Record loss reason in notes</li>
                        <li>• Set opportunity status to "dead"</li>
                        <li>• Consider re-engagement timeline</li>
                      </ul>
                    </div>
                    <div className="bg-destructive/10 rounded-none border border-destructive/30 p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-none bg-destructive flex items-center justify-center">
                          <XCircle className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="font-bold text-foreground">Status: Closed-Lost</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Underwriting declined or merchant withdrew.
                      </p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Document decline reason and underwriting feedback</li>
                        <li>• Set opportunity status to "closed-lost"</li>
                        <li>• Assess if re-application is viable</li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* ═══ TEAM ORGANOGRAM SECTION ═══ */}
                <section id="team-organogram" className="bg-card rounded-none border-2 border-border p-8">
                  <div className="flex items-center justify-between mb-6">
                    <SectionHeader sectionId="team-organogram" sectionTitle="Team Organogram">7.0 — Team Organogram</SectionHeader>
                    <span className="bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5 rounded-none flex items-center gap-1">
                      <Users className="w-3 h-3" /> Structure
                    </span>
                  </div>
                  <TeamOrganogram />
                </section>

                {/* ═══ ATRIA AI ASSISTANT SECTION ═══ */}
                <section id="atria-ai" className="bg-card rounded-none border-2 border-purple-500/30 p-8">
                  <div className="flex items-center justify-between mb-6">
                    <SectionHeader>3.0 — Atria AI Assistant</SectionHeader>
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
                          <strong className="text-foreground">Example:</strong> "Assign the ABC Corp deal to Wesley" or "Create a high priority task for Sheiky to follow up on documents for XYZ account."
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
                  <div className="flex items-center justify-between mb-6">
                    <SectionHeader gold>3.1 — PS Terminal Usage Guide</SectionHeader>
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
                  <div className="flex items-center justify-between mb-6">
                    <SectionHeader>3.2 — NMI Microsite Application Process</SectionHeader>
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
                  <SectionHeader gold>3.4 — Action Items & Standards</SectionHeader>

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
                  <SectionHeader gold>4. MerchantHaus Services Overview</SectionHeader>
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

                {/* Appendices */}
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
                              <p className="text-muted-foreground text-xs mt-1">Users: admin@merchanthaus.io, darryn@merchanthaus.io</p>
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
                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-destructive" /> Negative Outcomes Remove from Pipeline
                            </h4>
                            <p className="text-sm text-muted-foreground mb-3">
                              When any of the following outcomes are set, the opportunity is <strong className="text-foreground">immediately removed from the active pipeline board</strong> and its status is set to <code className="text-xs bg-background px-1 rounded">dead</code>:
                            </p>
                            <ul className="space-y-1.5 text-sm">
                              <li className="flex items-center gap-2"><span className="text-destructive font-bold">✗</span> <strong className="text-foreground">Closed Lost</strong> — Competitor selected, pricing, product gap, etc.</li>
                              <li className="flex items-center gap-2"><span className="text-purple-500 font-bold">🚫</span> <strong className="text-foreground">Disqualified</strong> — Unsupported MCC, geography, volume too small</li>
                              <li className="flex items-center gap-2"><span className="text-muted-foreground font-bold">💀</span> <strong className="text-foreground">No Decision / Dead</strong> — No response, project paused, budget removed</li>
                              <li className="flex items-center gap-2"><span className="text-orange-500 font-bold">⛔</span> <strong className="text-foreground">Underwriting Declined</strong> — Risk profile, restricted business type</li>
                            </ul>
                          </div>

                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <Trophy className="w-4 h-4 text-emerald-500" /> Closed Won Stays Active
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              <strong className="text-foreground">Closed Won</strong> is the only positive outcome. The opportunity remains <code className="text-xs bg-background px-1 rounded">active</code> and appears in the <strong className="text-foreground">Live & Billing</strong> report. It is removed from the pipeline board but retains its active status.
                            </p>
                          </div>

                          <div className="bg-accent/30 rounded-lg border border-border p-4">
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-primary" /> Outcome Requirements
                            </h4>
                            <ul className="space-y-1.5 text-sm text-muted-foreground">
                              <li>• Every outcome requires a <strong className="text-foreground">reason</strong> (selected from predefined list)</li>
                              <li>• Optional <strong className="text-foreground">notes</strong> for additional context</li>
                              <li>• System records <strong className="text-foreground">who</strong> set the outcome and <strong className="text-foreground">when</strong></li>
                              <li>• An activity log entry is automatically created</li>
                              <li>• Outcomes are <strong className="text-foreground">permanent</strong> — once set, the dropdown is disabled</li>
                            </ul>
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
