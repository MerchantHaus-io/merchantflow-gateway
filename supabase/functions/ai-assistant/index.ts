import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_BOT_USER_ID = "00000000-0000-0000-0000-000000000002";
const AI_BOT_EMAIL = "ai-assistant@ops.internal";
const AI_BOT_NAME = "Atria";

const BASE_SYSTEM_PROMPT = `You are Atria — a knowledgeable teammate on an ISO (Independent Sales Organization) team. Think of yourself as the colleague who always has the answer AND can take action.

TONE & STYLE:
- Talk like a real teammate in Slack — casual, warm, direct. Use first person ("I can see…", "Looks like…", "Done, I've…").
- Keep it SHORT. A few sentences is usually enough. No walls of text.
- NEVER use markdown formatting — no **bold**, no *italic*, no # headers, no --- dividers, no bullet lists with dashes. Just write plain sentences.
- If you need to list a few things, use numbered sentences or commas. Keep lists to 5 items max.
- Use plain language, not report-speak. Say "3 deals stuck in underwriting" not "There are currently 3 opportunities in the underwriting stage."
- Emojis are fine but don't overdo it — one or two max per message.
- Never start with "Here is…" or "Based on the data…" — just answer naturally.
- Never wrap words in asterisks or any special characters for emphasis.

KNOWLEDGE:
- Underwriting (website requirements, doc checklists, red flags)
- Merchant onboarding, payment processing (MCC codes, interchange, chargebacks, reserves)
- Application review guidance and general ops questions
- Live CRM data — pipeline, accounts, contacts, tasks, team activity, documents, beneficial owners, NMI boarding submissions, client interactions (provided below)
- Full SOP procedures, email templates, checklists (provided below)

ACTIONS:
- You can CREATE tasks, CREATE full deals (Account+Contact+Opportunity), UPDATE opportunity stages, ASSIGN opportunities, UPDATE statuses, UPDATE account/contact/opportunity records, ADD NOTES, RELABEL documents, LOG client interactions, RUN underwriting validation checks, VIEW/READ documents and images, and CLASSIFY/IDENTIFY documents by their actual content.
- DOCUMENT CLASSIFICATION: When someone asks "what is this document", "identify this file", "what type of document is this", or wants you to figure out what a file is, use the classify_document tool. It analyzes the actual content of PDFs, images, and Word docs to determine the document type (bank statement, voided check, passport, etc.) regardless of the filename. You can also auto-relabel the document in the CRM if asked.
- IMPORTANT — DOCUMENT VIEWING: You ABSOLUTELY CAN view, read, and analyze ALL documents including PDFs and images. You have a tool called "view_document" that lets you open any uploaded file. For images (JPGs, PNGs, WEBPs), the tool fetches the actual image and you will see it directly. For PDFs, the tool fetches the full PDF and you can read every page — text, tables, numbers, names, everything. NEVER say you cannot view, open, or read documents or PDFs — always use the view_document tool when asked. If a user asks you to look at, review, check, read, or verify any document, call view_document immediately with the document's UUID from the inventory.
- When asked to do something, use the available tools to take action immediately. Confirm what you did afterward.
- For ambiguous requests, ask for clarification before acting.
- When creating a deal, you create the account, contact, and opportunity in one step. Ask for the business name and contact name at minimum.
- IMPORTANT: The CRM snapshot includes UUIDs in brackets like [acct:uuid], [contact:uuid], [opp:uuid], [doc:uuid], [bo:uuid]. Use these IDs when calling tools — they are the database primary keys. Never tell the user you can't see IDs.
- When relabelling documents, use the document UUID from [doc:uuid] in the document inventory. Valid labels: Bank Statement, Processing Statement, Voided Check, Bank Confirmation Letter, Articles of Organization, EIN / Tax Document, Passport/Drivers License, Business License, Lease Agreement, Transaction History, VAR/Tear Sheet, Signed Agreement, Other.
- When logging client interactions, you can record calls, emails, meetings, notes, or SMS against any account with outcome tracking, priority, and follow-up dates.
- When running underwriting validation, you check document completeness against the required checklist and beneficial owner requirements, then save a validation report.
- When updating records, you can change fields like name, website, city, state, status on accounts; first_name, last_name, email, phone on contacts; and service_type, referral_source, language, timezone on opportunities.
- When adding notes, they are saved as comments on the opportunity and logged as activity.
- Team members you can assign to: admin@merchanthaus.io (Jamie), darryn@merchanthaus.io (Darryn), support@merchanthaus.io (Yaseen), sales@merchanthaus.io (Wesley), taryn@merchanthaus.io (Taryn).
- Valid pipeline stages: discovery, qualified, app_prep, underwriting, approved, gateway_setup, integration, testing, go_live_ready.
- Valid opportunity outcomes (terminal — removes from active board): closed_won, closed_lost, disqualified, no_decision, underwriting_declined.
- Valid opportunity statuses: active, dead, closed-lost.
- Task priorities: low, medium, high.

SOP REFERENCE (use when team asks about procedures, next steps, or checklists):

SALES WORKFLOW (9 stages):
1. Discovery — Initial outreach, learn about the business, send intro email, schedule a discovery call. Advance when business model understood and solution fit confirmed.
2. Qualified — Confirm merchant interest, determine pipeline type (Processing or Gateway), send Request for Documents email. Advance when doc request acknowledged and merchant commits to moving forward.
3. App Prep — Collect all required documents, complete the Preboarding Wizard, verify website compliance, send "Application in Process" email. Advance when all docs collected and application submitted via NMI microsite.
4. Underwriting — Monitor status daily, respond to processor stipulations within 24 hours, keep merchant informed, run AI Validate for document and website scrutiny. Advance when processor confirms approval and MID assigned.
5. Approved — Confirm MID assignment, notify merchant of approval, initiate gateway application (Flat Rate or Interchange+). Advance when gateway application submitted.
6. Gateway Setup — Configure NMI Gateway (API keys, webhooks, transaction routing), set up fraud tools (Kount if applicable), configure payment methods. Advance when gateway is fully configured.
7. Integration — Assist merchant with API integration or plugin setup (Shopify, WooCommerce, custom), provide technical documentation, resolve integration questions. Advance when integration code is in place.
8. Testing — Run test transactions (auth, capture, void, refund), verify webhook delivery, confirm descriptor accuracy, validate fraud rules. Advance when all tests pass.
9. Go Live Ready — Confirm first live transaction processed, provide support contacts, initiate PCI compliance (SAQ), schedule 30-day check-in, move to Closed Won when stable.

DOCUMENT CHECKLIST BY STAGE:
App Prep (Processing path):
  3 months bank statements, 3 months processing statements (if switching processors), voided check or bank confirmation letter, Articles of Organization, owner ID (passport or drivers license), EIN / Tax Document.
App Prep (Gateway Only path — lightened):
  Voided check or bank confirmation letter, VAR/Tear Sheet.
Underwriting (additional if requested):
  Lease agreement, business license, signed processing agreement, supplemental bank statements.

PRE-UNDERWRITING WEBSITE CHECKLIST (must-haves before submitting):
Refund/return policy visible on site, contact page with email and phone, clear product/service description, delivery/fulfillment timeline stated, terms and conditions page, privacy policy page, pricing visible and consistent with application MCC and volume.

RED FLAGS (can cause delays or declines):
Coming soon or placeholder site, missing refund policy, no contact info, products on site don't match application, long delivery times (may trigger reserves), aggressive income claims, restricted or prohibited content, domain registered very recently.

SUBSCRIPTIONS (if applicable):
Clear recurring disclosure (frequency, amount, billing date), cancellation instructions, trial terms explained, refund policy references subscription terms, descriptor matches support contact.

NMI MICROSITES (internal only — never share with merchants):
Flat Rate: for small businesses, predictable volume, simpler pricing.
Interchange+: for high volume, B2B, large ticket, transparent cost-plus pricing.
Workflow: Complete Preboarding Wizard first, then choose pricing model and submit via microsite, then move to Underwriting.

PRICING TIERS:
Starter ($59/mo): Fraud-first foundation, mobile gateway, TXT2PAY, basic reporting.
Intermediate ($99/mo): + Kount AI Fraud Manager, priority support, API access, enhanced reporting.
Pro ($149/mo): + Level III Advantage, Shopify integration, custom analytics, dedicated account manager.
Enterprise (Custom): + SLA guarantees, multi-entity support, dedicated engineering, custom integrations.

VALUE-ADD SERVICES (can be bundled with any tier):
Automatic Card Updater (ACU), Level III processing, Address Verification (AVS) configuration, Customer Fee / Surcharge programs, Recurring/Subscription billing, Multi-currency support, Chargeback management tools.

DATA INTEGRITY RULES:
1. No deletion of CRM records. Accounts, contacts, and opportunities are never deleted. Use outcomes (dead, closed-lost, disqualified) to remove from the active pipeline while preserving history.
2. Outcome-based pipeline maintenance. When a deal is lost or dead, set the outcome status with a reason, notes, and close date. Do not delete the record.
3. All stage movements must be logged. Every stage change creates an activity entry automatically.
4. Document labels are immutable once at limit. Each label has a maximum count (e.g. 1x Articles of Organization, 3x Bank Statement). Replacing requires relabelling the existing document first.
5. Beneficial owners must be recorded before underwriting submission. At least one owner with 25%+ equity.

BEHAVIOURAL GUARDRAILS:
1. Never share internal pricing, microsite URLs, NMI credentials, or API keys with merchants or external parties.
2. Never share personally identifiable information (SSN, full bank account numbers, DOB) in chat. Reference only last-4 digits.
3. Always confirm before destructive actions — killing a deal, changing status to dead/closed-lost, or removing an assignment.
4. Flag high-risk MCC codes (7995 gambling, 5967 direct marketing, 5912 pharmacies, etc.) when creating or reviewing deals — mention the risk and recommend enhanced due diligence.
5. Alert when a deal has been stuck in the same stage for more than 5 business days based on stage_entered_at.
6. Escalate compliance concerns (OFAC matches, suspected fraud, restricted content) immediately — recommend pausing the deal and notifying admin.
7. Never fabricate data. If information isn't in the CRM snapshot, say so clearly.
8. When a merchant is in Underwriting, proactively remind the team about SLA timelines (respond to stipulations within 24 hours).
9. NEVER claim you cannot view, open, read, or access documents or images. You have the view_document tool — USE IT. When someone asks you to look at a file, call view_document with the doc UUID immediately. Do not apologize or say your tools are limited.

When answering CRM questions, use ONLY the live data snapshot. Don't guess numbers. If something isn't in the data, say you don't have visibility on it.

You're internal-only — never respond as if talking to a merchant or customer.`;

async function buildCRMContext(supabase: ReturnType<typeof createClient>): Promise<string> {
  const [
    pipelineRes,
    recentOppsRes,
    tasksRes,
    profilesRes,
    accountsFullRes,
    contactsFullRes,
    contactCountRes,
    documentsRes,
    validationReportsRes,
    beneficialOwnersRes,
    activitiesRes,
    nmiBoardingRes,
    clientInteractionsRes,
  ] = await Promise.all([
    // Pipeline stage counts
    supabase.from("opportunities").select("id, stage, status, assigned_to, account_id"),
    // Recent opportunities with account names (all statuses)
    supabase.from("opportunities")
      .select("id, stage, status, assigned_to, created_at, accounts!inner(name), contacts!inner(first_name, last_name)")
      .order("created_at", { ascending: false })
      .limit(25),
    // Open tasks
    supabase.from("tasks").select("title, assignee, status, priority, due_at").neq("status", "done").order("created_at", { ascending: false }).limit(15),
    // Team members
    supabase.from("profiles").select("email, full_name, last_seen"),
    // Full accounts roster with details
    supabase.from("accounts").select("id, name, status, website, city, state, created_at").order("created_at", { ascending: true }),
    // Full contacts roster with details
    supabase.from("contacts").select("id, account_id, first_name, last_name, email, phone, created_at").order("created_at", { ascending: true }),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    // All documents across all opportunities
    supabase.from("documents").select("id, opportunity_id, file_name, document_type, content_type, file_size, created_at, uploaded_by").order("created_at", { ascending: false }),
    // Latest validation reports
    supabase.from("validation_reports").select("opportunity_id, readiness_score, summary, created_at").order("created_at", { ascending: false }).limit(50),
    // Beneficial owners
    supabase.from("beneficial_owners").select("id, opportunity_id, full_name, title, ownership_percentage, date_of_birth, address_line1, address_city, address_state, address_zip").order("created_at", { ascending: false }),
    // Recent activities / audit trail
    supabase.from("activities").select("opportunity_id, type, description, user_email, created_at").order("created_at", { ascending: false }).limit(50),
    // NMI boarding submissions
    supabase.from("nmi_boarding_submissions").select("id, opportunity_id, account_id, company_name, dba_name, nmi_status, nmi_gateway_id, error_message, submitted_by_email, created_at").order("created_at", { ascending: false }).limit(25),
    // Client interactions
    supabase.from("client_interactions").select("account_id, interaction_type, subject, status, priority, outcome, notes, created_by_email, created_at, follow_up_at").order("created_at", { ascending: false }).limit(30),
  ]);

  // Pipeline summary
  const opps = pipelineRes.data || [];
  const activeOpps = opps.filter((o: any) => o.status === "active");
  const deadOpps = opps.filter((o: any) => o.status === "dead" || o.status === "closed-lost");
  const stageCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  const assigneeCounts: Record<string, number> = {};
  for (const o of opps) {
    const stage = String((o as any).stage || "unknown");
    const status = String((o as any).status || "unknown");
    const assignedTo = String((o as any).assigned_to || "");
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (assignedTo) assigneeCounts[assignedTo] = (assigneeCounts[assignedTo] || 0) + 1;
  }

  const pipelineSummary = Object.entries(stageCounts)
    .map(([stage, count]) => `  ${stage}: ${count}`)
    .join("\n");

  const assigneeSummary = Object.entries(assigneeCounts)
    .map(([email, count]) => `  ${email}: ${count} deals`)
    .join("\n");

  // Recent deals
  const recentDeals = (recentOppsRes.data || [])
    .map((o: any) => `  - [opp:${o.id}] ${o.accounts?.name || "Unknown"} (${o.stage} | ${o.status || "active"}) → ${o.assigned_to || "Unassigned"} | Contact: ${[o.contacts?.first_name, o.contacts?.last_name].filter(Boolean).join(" ") || "N/A"}`)
    .join("\n");

  // Open tasks
  const openTasks = (tasksRes.data || [])
    .map((t: any) => `  - [${t.priority || "medium"}] ${t.title} → ${t.assignee || "Unassigned"} (${t.status})${t.due_at ? " due " + t.due_at.split("T")[0] : ""}`)
    .join("\n");

  // Team
  const team = (profilesRes.data || [])
    .filter((p: any) => p.email)
    .map((p: any) => `  - ${p.full_name || p.email} (${p.email})${p.last_seen ? " — last seen " + new Date(p.last_seen).toLocaleDateString() : ""}`)
    .join("\n");

  // Build full account + contact roster
  const allAccounts = accountsFullRes.data || [];
  const allContacts = contactsFullRes.data || [];
  const activeAccounts = allAccounts.filter((a: any) => a.status === "active" || !a.status).length;
  const deadAccounts = allAccounts.filter((a: any) => a.status === "dead").length;

  // Group contacts by account_id
  const contactsByAccount: Record<string, any[]> = {};
  for (const c of allContacts) {
    const accId = String((c as any).account_id);
    if (!contactsByAccount[accId]) contactsByAccount[accId] = [];
    contactsByAccount[accId].push(c);
  }

  // Build account roster with contacts
  const accountRoster = allAccounts
    .map((a: any) => {
      const created = a.created_at ? new Date(a.created_at).toLocaleDateString() : "Unknown";
      const contacts = contactsByAccount[a.id] || [];
      const contactLines = contacts
        .map((c: any) => `      [contact:${c.id}] ${[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed"} | ${c.email || "no email"} | ${c.phone || "no phone"}`)
        .join("\n");
      return `  [acct:${a.id}] ${a.name} (${a.status || "active"}) — since ${created}${a.city && a.state ? ` | ${a.city}, ${a.state}` : ""}${a.website ? ` | ${a.website}` : ""}\n${contactLines || "      No contacts on file"}`;
    })
    .join("\n");

  const statusSummary = Object.entries(statusCounts)
    .map(([status, count]) => `  ${status}: ${count}`)
    .join("\n");

  // Build document roster grouped by opportunity (mapped to account name)
  const allDocs = documentsRes.data || [];
  const allValidations = validationReportsRes.data || [];

  // Map opportunity_id to account name
  const accountIdToName: Record<string, string> = {};
  for (const a of allAccounts) accountIdToName[String((a as any).id)] = (a as any).name;

  const oppToAccount: Record<string, string> = {};
  for (const o of (recentOppsRes.data || [])) {
    oppToAccount[String((o as any).id)] = (o as any).accounts?.name || "Unknown Account";
  }
  // Also map from full pipeline data for docs that belong to older opps
  for (const o of opps) {
    if (!oppToAccount[(o as any).id]) {
      oppToAccount[(o as any).id] = accountIdToName[(o as any).account_id] || "Unknown Account";
    }
  }

  // Group docs by opportunity
  const docsByOpp: Record<string, any[]> = {};
  for (const d of allDocs) {
    const oppId = String((d as any).opportunity_id);
    if (!docsByOpp[oppId]) docsByOpp[oppId] = [];
    docsByOpp[oppId].push(d);
  }

  const documentRoster = Object.entries(docsByOpp)
    .map(([oppId, docs]) => {
      const acctName = oppToAccount[oppId] || "Unknown Account";
      const docLines = docs
        .map((d: any) => `      [doc:${d.id}] ${d.file_name} (${d.document_type || "Unassigned"}) — uploaded ${d.created_at ? new Date(d.created_at).toLocaleDateString() : "unknown"}${d.uploaded_by ? " by " + d.uploaded_by : ""}`)
        .join("\n");
      return `  ${acctName} [opp:${oppId}] (${docs.length} docs):\n${docLines}`;
    })
    .join("\n");

  // Validation report summaries
  const validationSummary = allValidations
    .map((v: any) => {
      const acctName = oppToAccount[v.opportunity_id] || "Unknown Account";
      const score = v.readiness_score === "ready" ? "🟢" : v.readiness_score === "needs_attention" ? "🟡" : "🔴";
      return `  ${score} ${acctName} — ${v.summary || "No summary"} (${new Date(v.created_at).toLocaleDateString()})`;
    })
    .join("\n");

  // Build beneficial owners grouped by opportunity
  const allBOs = beneficialOwnersRes.data || [];
  const bosByOpp: Record<string, any[]> = {};
  for (const bo of allBOs) {
    const oppId = String((bo as any).opportunity_id);
    if (!bosByOpp[oppId]) bosByOpp[oppId] = [];
    bosByOpp[oppId].push(bo);
  }
  const beneficialOwnerRoster = Object.entries(bosByOpp)
    .map(([oppId, bos]) => {
      const acctName = oppToAccount[oppId] || "Unknown Account";
      const boLines = bos
        .map((b: any) => `      [bo:${b.id || "?"}] ${b.full_name} — ${b.title || "No title"} | ${b.ownership_percentage}% | ${[b.address_city, b.address_state].filter(Boolean).join(", ") || "No address"}`)
        .join("\n");
      return `  ${acctName} [opp:${oppId}]:\n${boLines}`;
    })
    .join("\n");

  // Recent activities
  const recentActivities = (activitiesRes.data || [])
    .map((a: any) => {
      const acctName = oppToAccount[a.opportunity_id] || "Unknown Account";
      const date = a.created_at ? new Date(a.created_at).toLocaleDateString() : "unknown";
      return `  ${date} | ${acctName} | ${a.type} | ${a.description || "No description"} | by ${a.user_email || "system"}`;
    })
    .join("\n");

  // NMI boarding submissions
  const allBoardings = nmiBoardingRes.data || [];
  const boardingRoster = allBoardings
    .map((b: any) => {
      const acctName = b.account_id ? accountIdToName[b.account_id] || b.company_name : b.company_name;
      const date = b.created_at ? new Date(b.created_at).toLocaleDateString() : "unknown";
      return `  ${acctName}${b.dba_name ? " (DBA: " + b.dba_name + ")" : ""} — ${b.nmi_status}${b.nmi_gateway_id ? " | GW: " + b.nmi_gateway_id : ""}${b.error_message ? " | Error: " + b.error_message : ""} | ${date} by ${b.submitted_by_email}`;
    })
    .join("\n");

  // Client interactions
  const allInteractions = clientInteractionsRes.data || [];
  const interactionRoster = allInteractions
    .map((i: any) => {
      const acctName = accountIdToName[i.account_id] || "Unknown Account";
      const date = i.created_at ? new Date(i.created_at).toLocaleDateString() : "unknown";
      return `  ${date} | ${acctName} | ${i.interaction_type} — ${i.subject} | ${i.status} (${i.priority}) | ${i.outcome || "No outcome"}${i.follow_up_at ? " | Follow-up: " + new Date(i.follow_up_at).toLocaleDateString() : ""} | by ${i.created_by_email || "unknown"}`;
    })
    .join("\n");

  return `

━━━ LIVE CRM DATA SNAPSHOT ━━━

FULL ACCOUNT ROSTER (${allAccounts.length} accounts, from inception to today):
${accountRoster || "  No accounts"}

PIPELINE OVERVIEW (${opps.length} total opportunities):
By Stage:
${pipelineSummary || "  No deals"}

By Status:
${statusSummary || "  No deals"}

DEALS BY ASSIGNEE:
${assigneeSummary || "  No assignments"}

RECENT DEALS (newest first, all statuses):
${recentDeals || "  None"}

DOCUMENT INVENTORY (${allDocs.length} documents across all deals):
${documentRoster || "  No documents on file"}

LATEST VALIDATION REPORTS:
${validationSummary || "  No validation reports yet"}

BENEFICIAL OWNERS (${allBOs.length} across all deals):
${beneficialOwnerRoster || "  None on file"}

RECENT ACTIVITY LOG (last 50 events):
${recentActivities || "  No recent activity"}

NMI BOARDING SUBMISSIONS (${allBoardings.length} recent):
${boardingRoster || "  No boarding submissions"}

CLIENT INTERACTIONS (${allInteractions.length} recent):
${interactionRoster || "  No interactions logged"}

OPEN TASKS (${tasksRes.data?.length || 0}):
${openTasks || "  None"}

TEAM MEMBERS:
${team || "  None"}

TOTALS:
  Accounts: ${allAccounts.length} total (${activeAccounts} active, ${deadAccounts} dead)
  Contacts: ${contactCountRes.count ?? "Unknown"}
  All Opportunities: ${opps.length} (${activeOpps.length} active, ${deadOpps.length} dead/closed-lost)
  Documents: ${allDocs.length} total
  Beneficial Owners: ${allBOs.length}
  Boarding Submissions: ${allBoardings.length}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { action, channelId, userMessage, opportunityId } = await req.json();

    // ── ACTION: CHAT ──
    if (action === "chat") {
      if (!channelId || !userMessage) {
        return new Response(JSON.stringify({ error: "Missing channelId or userMessage" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch CRM context and channel history in parallel
      const [crmContext, historyRes] = await Promise.all([
        buildCRMContext(supabase as any),
        supabase
          .from("chat_messages")
          .select("user_name, user_email, content")
          .eq("channel_id", channelId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const conversationHistory = (historyRes.data || [])
        .reverse()
        .map((m) => ({
          role: m.user_email === AI_BOT_EMAIL ? "assistant" as const : "user" as const,
          content: m.user_email === AI_BOT_EMAIL
            ? m.content
            : `[${m.user_name || m.user_email}]: ${m.content}`,
        }));

      const systemPrompt = BASE_SYSTEM_PROMPT + crmContext;

      // ── CRM Action Tools ──
      const crmTools = [
        {
          type: "function",
          function: {
            name: "create_task",
            description: "Create a new task in the CRM. Use when someone asks you to create a task, follow-up, reminder, or to-do.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short task title" },
                description: { type: "string", description: "Optional task description" },
                assignee: { type: "string", description: "Email of the team member to assign (e.g. support@merchanthaus.io)" },
                priority: { type: "string", enum: ["low", "medium", "high"], description: "Task priority" },
                due_at: { type: "string", description: "Optional due date in ISO format (YYYY-MM-DD)" },
                related_opportunity_id: { type: "string", description: "Optional opportunity UUID to link this task to" },
              },
              required: ["title"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "update_opportunity_stage",
            description: "Move an opportunity to a different pipeline stage. Use when someone asks to advance, move, or change the stage of a deal.",
            parameters: {
              type: "object",
              properties: {
                opportunity_id: { type: "string", description: "UUID of the opportunity" },
                new_stage: { type: "string", enum: ["discovery", "qualified", "app_prep", "underwriting", "approved", "gateway_setup", "integration", "testing", "go_live_ready"], description: "The new pipeline stage" },
              },
              required: ["opportunity_id", "new_stage"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "assign_opportunity",
            description: "Assign an opportunity to a team member. Use when someone asks to assign or reassign a deal.",
            parameters: {
              type: "object",
              properties: {
                opportunity_id: { type: "string", description: "UUID of the opportunity" },
                assigned_to: { type: "string", description: "Email of the team member to assign to" },
              },
              required: ["opportunity_id", "assigned_to"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "update_opportunity_status",
            description: "Update the status of an opportunity (active, dead, closed-lost). Use when someone asks to kill a deal, reactivate, or close-lost.",
            parameters: {
              type: "object",
              properties: {
                opportunity_id: { type: "string", description: "UUID of the opportunity" },
                new_status: { type: "string", enum: ["active", "dead", "closed-lost"], description: "The new status" },
              },
              required: ["opportunity_id", "new_status"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "update_account",
            description: "Update fields on an account record. Use when someone asks to change an account's name, website, address, city, state, zip, country, or status.",
            parameters: {
              type: "object",
              properties: {
                account_id: { type: "string", description: "UUID of the account" },
                name: { type: "string", description: "New account name" },
                website: { type: "string", description: "New website URL" },
                address1: { type: "string", description: "New address line 1" },
                city: { type: "string", description: "New city" },
                state: { type: "string", description: "New state" },
                zip: { type: "string", description: "New zip code" },
                country: { type: "string", description: "New country" },
                status: { type: "string", enum: ["active", "dead"], description: "New account status" },
              },
              required: ["account_id"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "update_contact",
            description: "Update fields on a contact record. Use when someone asks to change a contact's name, email, phone, or fax.",
            parameters: {
              type: "object",
              properties: {
                contact_id: { type: "string", description: "UUID of the contact" },
                first_name: { type: "string", description: "New first name" },
                last_name: { type: "string", description: "New last name" },
                email: { type: "string", description: "New email" },
                phone: { type: "string", description: "New phone number" },
                fax: { type: "string", description: "New fax number" },
              },
              required: ["contact_id"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "update_opportunity",
            description: "Update miscellaneous fields on an opportunity. Use when someone asks to change service_type, referral_source, language, timezone, or username on a deal.",
            parameters: {
              type: "object",
              properties: {
                opportunity_id: { type: "string", description: "UUID of the opportunity" },
                service_type: { type: "string", enum: ["processing", "gateway"], description: "Service type" },
                referral_source: { type: "string", description: "Referral source" },
                language: { type: "string", description: "Language preference" },
                timezone: { type: "string", description: "Timezone" },
                username: { type: "string", description: "Username" },
              },
              required: ["opportunity_id"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "add_note",
            description: "Add a note/comment to an opportunity. Use when someone asks to add a note, comment, or log information on a deal or account.",
            parameters: {
              type: "object",
              properties: {
                opportunity_id: { type: "string", description: "UUID of the opportunity to add the note to" },
                content: { type: "string", description: "The note content" },
              },
              required: ["opportunity_id", "content"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "create_deal",
            description: "Create a full deal in one shot: Account + Contact + Opportunity. Use when someone asks to add a new merchant, create a new deal, or onboard a new prospect.",
            parameters: {
              type: "object",
              properties: {
                account_name: { type: "string", description: "Business / company name" },
                website: { type: "string", description: "Business website URL" },
                city: { type: "string", description: "Business city" },
                state: { type: "string", description: "Business state" },
                first_name: { type: "string", description: "Primary contact first name" },
                last_name: { type: "string", description: "Primary contact last name" },
                email: { type: "string", description: "Contact email" },
                phone: { type: "string", description: "Contact phone" },
                service_type: { type: "string", enum: ["processing", "gateway"], description: "Service type for the opportunity" },
                assigned_to: { type: "string", description: "Email of team member to assign" },
                referral_source: { type: "string", description: "How the lead came in" },
                stage: { type: "string", enum: ["discovery", "qualified", "app_prep", "underwriting", "approved", "gateway_setup", "integration", "testing", "go_live_ready"], description: "Initial pipeline stage (defaults to discovery)" },
              },
              required: ["account_name", "first_name", "last_name"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "relabel_document",
            description: "Change the label/category of an existing document on an opportunity. Use when someone asks to re-categorise, relabel, or change the type of a document.",
            parameters: {
              type: "object",
              properties: {
                document_id: { type: "string", description: "UUID of the document to relabel" },
                new_label: { type: "string", enum: [
                  "Bank Statement", "Processing Statement", "Voided Check", "Bank Confirmation Letter",
                  "Articles of Organization", "EIN / Tax Document", "Passport/Drivers License",
                  "Business License", "Lease Agreement", "Transaction History", "VAR/Tear Sheet",
                  "Signed Agreement", "Other"
                ], description: "The new document category label" },
              },
              required: ["document_id", "new_label"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "log_client_interaction",
            description: "Log a client interaction (call, email, meeting, note, sms) against an account. Use when someone asks to log a call, record a meeting note, or track a client touchpoint.",
            parameters: {
              type: "object",
              properties: {
                account_id: { type: "string", description: "UUID of the account" },
                interaction_type: { type: "string", enum: ["call", "email", "meeting", "note", "sms"], description: "Type of interaction" },
                subject: { type: "string", description: "Brief subject line" },
                notes: { type: "string", description: "Detailed notes about the interaction" },
                outcome: { type: "string", description: "Outcome or result (e.g. 'Left voicemail', 'Agreed to send docs')" },
                priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priority level" },
                status: { type: "string", enum: ["open", "pending", "resolved", "closed"], description: "Interaction status" },
                contact_name: { type: "string", description: "Name of the person contacted" },
                contact_email: { type: "string", description: "Email of the person contacted" },
                contact_phone: { type: "string", description: "Phone of the person contacted" },
                duration_minutes: { type: "number", description: "Duration of call/meeting in minutes" },
              },
              required: ["account_id", "interaction_type", "subject"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "run_underwriting_validation",
            description: "Trigger the AI underwriting validation report for an opportunity. Use when someone asks to validate, run a check, or audit an opportunity for underwriting readiness.",
            parameters: {
              type: "object",
              properties: {
                opportunity_id: { type: "string", description: "UUID of the opportunity to validate" },
              },
              required: ["opportunity_id"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "view_document",
            description: "ALWAYS USE THIS TOOL when asked to view, look at, review, read, check, or inspect any document or image. For images (jpg, png, webp, gif), you will see the actual image content and can describe what's in it. For PDFs, this tool extracts and returns readable document text (with table/number fidelity) so you can analyze it directly. Pass the document UUID from [doc:uuid] in the CRM snapshot.",
            parameters: {
              type: "object",
              properties: {
                document_id: { type: "string", description: "UUID of the document from [doc:uuid] in the document inventory" },
              },
              required: ["document_id"],
              additionalProperties: false,
            },
          },
        },
      ];

      // ── Tool Execution Handler ──
      async function executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
        switch (toolName) {
          case "create_task": {
            const taskData: Record<string, unknown> = {
              title: args.title,
              status: "open",
              source: "manual",
              priority: args.priority || "medium",
              created_by: "ai-assistant@ops.internal",
            };
            if (args.description) taskData.description = args.description;
            if (args.assignee) taskData.assignee = args.assignee;
            if (args.due_at) taskData.due_at = args.due_at;
            if (args.related_opportunity_id) taskData.related_opportunity_id = args.related_opportunity_id;

            const { data, error } = await supabase.from("tasks").insert(taskData).select("id").single();
            if (error) return `Error creating task: ${error.message}`;
            return `Task created successfully (ID: ${data.id}). Title: "${args.title}"${args.assignee ? `, assigned to ${args.assignee}` : ""}.`;
          }

          case "update_opportunity_stage": {
            const { error } = await supabase
              .from("opportunities")
              .update({ stage: args.new_stage })
              .eq("id", args.opportunity_id);
            if (error) return `Error updating stage: ${error.message}`;
            return `Opportunity stage updated to "${args.new_stage}" successfully.`;
          }

          case "assign_opportunity": {
            const { error } = await supabase
              .from("opportunities")
              .update({ assigned_to: args.assigned_to })
              .eq("id", args.opportunity_id);
            if (error) return `Error assigning opportunity: ${error.message}`;
            return `Opportunity assigned to ${args.assigned_to} successfully.`;
          }

          case "update_opportunity_status": {
            const { error } = await supabase
              .from("opportunities")
              .update({ status: args.new_status })
              .eq("id", args.opportunity_id);
            if (error) return `Error updating status: ${error.message}`;
            return `Opportunity status updated to "${args.new_status}" successfully.`;
          }

          case "update_account": {
            const { account_id, ...fields } = args;
            const updateData: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(fields)) {
              if (val !== undefined && val !== null) updateData[key] = val;
            }
            if (Object.keys(updateData).length === 0) return "No fields provided to update.";
            const { error } = await supabase.from("accounts").update(updateData).eq("id", account_id);
            if (error) return `Error updating account: ${error.message}`;
            return `Account updated successfully. Changed: ${Object.keys(updateData).join(", ")}.`;
          }

          case "update_contact": {
            const { contact_id, ...fields } = args;
            const updateData: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(fields)) {
              if (val !== undefined && val !== null) updateData[key] = val;
            }
            if (Object.keys(updateData).length === 0) return "No fields provided to update.";
            const { error } = await supabase.from("contacts").update(updateData).eq("id", contact_id);
            if (error) return `Error updating contact: ${error.message}`;
            return `Contact updated successfully. Changed: ${Object.keys(updateData).join(", ")}.`;
          }

          case "update_opportunity": {
            const { opportunity_id, ...fields } = args;
            const updateData: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(fields)) {
              if (val !== undefined && val !== null) updateData[key] = val;
            }
            if (Object.keys(updateData).length === 0) return "No fields provided to update.";
            const { error } = await supabase.from("opportunities").update(updateData).eq("id", opportunity_id);
            if (error) return `Error updating opportunity: ${error.message}`;
            return `Opportunity updated successfully. Changed: ${Object.keys(updateData).join(", ")}.`;
          }

          case "add_note": {
            const { opportunity_id, content } = args;
            const { error: commentError } = await supabase.from("comments").insert({
              opportunity_id,
              content,
              user_id: AI_BOT_USER_ID,
              user_email: AI_BOT_EMAIL,
            });
            if (commentError) return `Error adding note: ${commentError.message}`;
            // Also log as activity
            await supabase.from("activities").insert({
              opportunity_id,
              type: "note_added",
              description: `Atria added note: ${(content as string).substring(0, 100)}${(content as string).length > 100 ? "..." : ""}`,
              user_id: AI_BOT_USER_ID,
              user_email: AI_BOT_EMAIL,
            });
            return `Note added to opportunity successfully.`;
          }

          case "create_deal": {
            // 1. Create account
            const accountData: Record<string, unknown> = { name: args.account_name };
            if (args.website) accountData.website = args.website;
            if (args.city) accountData.city = args.city;
            if (args.state) accountData.state = args.state;

            const { data: acct, error: acctErr } = await supabase
              .from("accounts").insert(accountData).select("id, name").single();
            if (acctErr) return `Error creating account: ${acctErr.message}`;

            // 2. Create contact
            const contactData: Record<string, unknown> = {
              account_id: acct.id,
              first_name: args.first_name,
              last_name: args.last_name,
            };
            if (args.email) contactData.email = args.email;
            if (args.phone) contactData.phone = args.phone;

            const { data: contact, error: contactErr } = await supabase
              .from("contacts").insert(contactData).select("id").single();
            if (contactErr) return `Account created but contact failed: ${contactErr.message}`;

            // 3. Create opportunity
            const oppData: Record<string, unknown> = {
              account_id: acct.id,
              contact_id: contact.id,
              stage: args.stage || "discovery",
              service_type: args.service_type || "processing",
              status: "active",
            };
            if (args.assigned_to) oppData.assigned_to = args.assigned_to;
            if (args.referral_source) oppData.referral_source = args.referral_source;

            const { data: opp, error: oppErr } = await supabase
              .from("opportunities").insert(oppData).select("id").single();
            if (oppErr) return `Account + contact created but opportunity failed: ${oppErr.message}`;

            // Log activity
            await supabase.from("activities").insert({
              opportunity_id: opp.id,
              type: "deal_created",
              description: `Atria created deal for ${acct.name} (${args.first_name} ${args.last_name})`,
              user_id: AI_BOT_USER_ID,
              user_email: AI_BOT_EMAIL,
            });

            return `Deal created successfully! Account: "${acct.name}" | Contact: ${args.first_name} ${args.last_name} | Opportunity ID: ${opp.id} | Stage: ${args.stage || "discovery"}${args.assigned_to ? " | Assigned to: " + args.assigned_to : ""}`;
          }

          case "relabel_document": {
            const { document_id, new_label } = args;
            const { error } = await supabase
              .from("documents")
              .update({ document_type: new_label })
              .eq("id", document_id);
            if (error) return `Error relabelling document: ${error.message}`;
            return `Document relabelled to "${new_label}" successfully.`;
          }

          case "log_client_interaction": {
            const interactionData: Record<string, unknown> = {
              account_id: args.account_id,
              interaction_type: args.interaction_type,
              subject: args.subject,
              created_by_email: AI_BOT_EMAIL,
              status: args.status || "open",
              priority: args.priority || "medium",
            };
            if (args.notes) interactionData.notes = args.notes;
            if (args.outcome) interactionData.outcome = args.outcome;
            if (args.contact_name) interactionData.contact_name = args.contact_name;
            if (args.contact_email) interactionData.contact_email = args.contact_email;
            if (args.contact_phone) interactionData.contact_phone = args.contact_phone;
            if (args.duration_minutes) interactionData.duration_minutes = args.duration_minutes;

            const { data: interaction, error: intErr } = await supabase
              .from("client_interactions").insert(interactionData).select("id").single();
            if (intErr) return `Error logging interaction: ${intErr.message}`;
            return `${args.interaction_type} logged successfully (ID: ${interaction.id}). Subject: "${args.subject}"${args.outcome ? " | Outcome: " + args.outcome : ""}`;
          }

          case "run_underwriting_validation": {
            // Gather opportunity data for validation
            const { data: oppData, error: oppErr } = await supabase
              .from("opportunities")
              .select("id, stage, service_type, accounts!inner(name, website), contacts!inner(first_name, last_name, email)")
              .eq("id", args.opportunity_id)
              .single();
            if (oppErr || !oppData) return `Error fetching opportunity: ${oppErr?.message || "Not found"}`;

            const { data: docs } = await supabase
              .from("documents")
              .select("file_name, document_type")
              .eq("opportunity_id", args.opportunity_id);

            const { data: bos } = await supabase
              .from("beneficial_owners")
              .select("full_name, ownership_percentage, title")
              .eq("opportunity_id", args.opportunity_id);

            const docList = (docs || []).map((d: any) => `${d.file_name} (${d.document_type})`).join(", ");
            const boList = (bos || []).map((b: any) => `${b.full_name} ${b.ownership_percentage}%`).join(", ");
            const acctName = (oppData as any).accounts?.name || "Unknown";
            const website = (oppData as any).accounts?.website || "None";

            // Check required docs
            const docTypes = (docs || []).map((d: any) => d.document_type || "");
            const hasBank = docTypes.filter((t: string) => t === "Bank Statement").length >= 3;
            const hasArticles = docTypes.includes("Articles of Organization");
            const hasEIN = docTypes.includes("EIN / Tax Document");
            const hasCheck = docTypes.includes("Voided Check") || docTypes.includes("Bank Confirmation Letter");
            const hasID = docTypes.includes("Passport/Drivers License");
            const hasBOs = (bos || []).length > 0;

            const missing: string[] = [];
            if (!hasBank) missing.push("3x Bank Statements");
            if (!hasArticles) missing.push("Articles of Organization");
            if (!hasEIN) missing.push("EIN / Tax Document");
            if (!hasCheck) missing.push("Voided Check or Bank Confirmation");
            if (!hasID) missing.push("Passport/Drivers License");
            if (!hasBOs) missing.push("Beneficial Owner(s)");

            const isGateway = oppData.service_type === "gateway";
            const readiness = missing.length === 0 ? "ready" : missing.length <= 2 ? "needs_attention" : "not_ready";
            const score = isGateway ? "gateway_path" : readiness;

            // Save validation report
            const { error: reportErr } = await supabase.from("validation_reports").insert({
              opportunity_id: args.opportunity_id,
              readiness_score: score,
              summary: missing.length === 0
                ? `${acctName} has all required documents and beneficial owners on file. Ready for underwriting.`
                : `${acctName} is missing: ${missing.join(", ")}. ${missing.length} item(s) needed before underwriting.`,
              triggered_by: AI_BOT_EMAIL,
              data_gaps: missing,
              document_completeness: { total: (docs || []).length, types: docTypes },
              risk_flags: [],
              recommended_actions: missing.map((m: string) => `Collect ${m}`),
              classification_issues: [],
              no_change: false,
            });

            if (reportErr) return `Error saving validation report: ${reportErr.message}`;

            // Log activity
            await supabase.from("activities").insert({
              opportunity_id: args.opportunity_id,
              type: "validation_run",
              description: `Atria ran underwriting validation for ${acctName}: ${score}`,
              user_id: AI_BOT_USER_ID,
              user_email: AI_BOT_EMAIL,
            });

            if (missing.length === 0) {
              return `Validation complete for ${acctName}: all requirements met. ${(docs || []).length} documents on file, ${(bos || []).length} beneficial owner(s) recorded. Website: ${website}. Ready for underwriting submission.`;
            }
            return `Validation complete for ${acctName}: ${score}. Missing ${missing.length} item(s): ${missing.join(", ")}. ${(docs || []).length} docs on file, ${(bos || []).length} beneficial owner(s). Website: ${website}.`;
          }

          case "view_document": {
            const { document_id } = args;
            // Fetch document metadata
            const { data: doc, error: docErr } = await supabase
              .from("documents")
              .select("file_name, file_path, content_type, document_type, opportunity_id")
              .eq("id", document_id)
              .single();
            if (docErr || !doc) return `Error: Document not found (${document_id}). ${docErr?.message || ""}`;

            const contentType = (doc.content_type || "").toLowerCase();
            const isImage = contentType.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.file_name);
            const isPdf = contentType === "application/pdf" || /\.pdf$/i.test(doc.file_name);

            // Generate signed URL (valid 10 minutes)
            const { data: signedData, error: signErr } = await supabase.storage
              .from("opportunity-documents")
              .createSignedUrl(doc.file_path, 600);

            if (signErr || !signedData?.signedUrl) {
              return `Error generating access URL for "${doc.file_name}": ${signErr?.message || "Unknown error"}`;
            }

            if (isImage) {
              // Fetch the image and convert to base64 for multimodal input
              try {
                const imgResponse = await fetch(signedData.signedUrl);
                if (!imgResponse.ok) return `Error downloading image "${doc.file_name}": HTTP ${imgResponse.status}`;
                const imgBuffer = await imgResponse.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
                const mimeType = contentType || "image/jpeg";
                return `__IMAGE__${mimeType}__${base64}__ENDIMAGE__Document "${doc.file_name}" (${doc.document_type || "Unassigned"}) — I can now see this image. Please describe what you observe.`;
              } catch (e) {
                return `Error fetching image: ${e instanceof Error ? e.message : "Unknown error"}. Signed URL: ${signedData.signedUrl}`;
              }
            }

            if (isPdf) {
              // For PDFs: extract readable text via Lovable AI with a resilient fallback strategy.
              try {
                const parsePdfText = async (pdfUrl: string, attempt: "signed-url" | "inline-base64") => {
                  const pdfReadResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${LOVABLE_API_KEY}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model: "google/gemini-3-flash-preview",
                      messages: [
                        {
                          role: "system",
                          content: "You are a precise PDF reader. Extract all readable text, tables, monetary values, names, dates, and identifiers from the PDF. Return only the extracted content.",
                        },
                        {
                          role: "user",
                          content: [
                            { type: "text", text: `Read this PDF document "${doc.file_name}" and extract all text exactly.` },
                            { type: "image_url", image_url: { url: pdfUrl } },
                          ],
                        },
                      ],
                    }),
                  });

                  if (!pdfReadResponse.ok) {
                    const errBody = await pdfReadResponse.text();
                    return {
                      text: "",
                      error: `${attempt} read failed [${pdfReadResponse.status}] ${errBody.slice(0, 300)}`,
                    };
                  }

                  const pdfReadData = await pdfReadResponse.json();
                  const rawContent = pdfReadData?.choices?.[0]?.message?.content;
                  const extractedText = typeof rawContent === "string"
                    ? rawContent
                    : Array.isArray(rawContent)
                      ? rawContent
                        .map((part: any) => {
                          if (typeof part === "string") return part;
                          if (typeof part?.text === "string") return part.text;
                          return "";
                        })
                        .join("\n")
                      : "";

                  return {
                    text: extractedText.trim(),
                    error: extractedText.trim() ? "" : `${attempt} read returned no text`,
                  };
                };

                // 1) Primary pass: signed URL (best for large files).
                let parsed = await parsePdfText(signedData.signedUrl, "signed-url");

                // 2) Fallback pass: inline base64 data URL (helps when remote fetch is blocked).
                if (!parsed.text) {
                  const pdfResponse = await fetch(signedData.signedUrl);
                  if (pdfResponse.ok) {
                    const pdfBuffer = await pdfResponse.arrayBuffer();
                    const maxInlineBytes = 8 * 1024 * 1024;

                    if (pdfBuffer.byteLength <= maxInlineBytes) {
                      const bytes = new Uint8Array(pdfBuffer);
                      const chunkSize = 0x8000;
                      let binary = "";
                      for (let i = 0; i < bytes.length; i += chunkSize) {
                        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
                      }
                      const base64Pdf = btoa(binary);
                      const dataUrl = `data:application/pdf;base64,${base64Pdf}`;
                      const inlineParsed = await parsePdfText(dataUrl, "inline-base64");
                      if (inlineParsed.text) {
                        parsed = inlineParsed;
                      } else if (parsed.error) {
                        parsed.error = `${parsed.error}; ${inlineParsed.error}`;
                      }
                    } else if (parsed.error) {
                      parsed.error = `${parsed.error}; inline fallback skipped (PDF > 8MB)`;
                    }
                  } else if (parsed.error) {
                    parsed.error = `${parsed.error}; failed to fetch PDF for fallback [${pdfResponse.status}]`;
                  }
                }

                if (parsed.text) {
                  const maxChars = 12000;
                  const finalText = parsed.text.length > maxChars
                    ? `${parsed.text.slice(0, maxChars)}\n\n[... truncated for length ...]`
                    : parsed.text;

                  return `Document: "${doc.file_name}" (${doc.document_type || "Unassigned"})\n\n--- EXTRACTED CONTENT ---\n${finalText}\n--- END ---\n\nI have successfully read this PDF.`;
                }

                return `Document: "${doc.file_name}" (${doc.document_type || "Unassigned"}) | I couldn't auto-extract text from this PDF yet (${parsed.error || "unknown reason"}). Download link: ${signedData.signedUrl}`;
              } catch (e) {
                console.error("PDF AI read error:", e);
                return `Error reading PDF "${doc.file_name}": ${e instanceof Error ? e.message : "Unknown error"}. Download link: ${signedData.signedUrl}`;
              }
            }

            // For other file types, return metadata + signed URL
            return `Document: "${doc.file_name}" (${doc.document_type || "Unassigned"}) | Type: ${contentType || "unknown"} | Download link: ${signedData.signedUrl}`;
          }

          default:
            return `Unknown tool: ${toolName}`;
        }
      }

      // Call AI gateway with tools
      let messages: Array<Record<string, unknown>> = [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
      ];

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools: crmTools,
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) {
          await supabase.from("chat_messages").insert({
            channel_id: channelId,
            user_id: AI_BOT_USER_ID,
            user_email: AI_BOT_EMAIL,
            user_name: AI_BOT_NAME,
            content: "⚠️ I'm receiving too many requests right now. Please try again in a moment.",
          });
          return new Response(JSON.stringify({ error: "Rate limited" }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          await supabase.from("chat_messages").insert({
            channel_id: channelId,
            user_id: AI_BOT_USER_ID,
            user_email: AI_BOT_EMAIL,
            user_name: AI_BOT_NAME,
            content: "⚠️ AI credits have been exhausted. Please top up usage in Settings → Workspace → Usage.",
          });
          return new Response(JSON.stringify({ error: "Payment required" }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errText = await aiResponse.text();
        console.error("AI gateway error:", status, errText);
        throw new Error(`AI gateway error: ${status}`);
      }

      let aiData = await aiResponse.json();
      let assistantMessage = aiData.choices?.[0]?.message;
      console.log("Initial AI response:", JSON.stringify(aiData).substring(0, 500));

      // ── Tool-calling loop (max 5 iterations) ──
      let iterations = 0;
      while (assistantMessage?.tool_calls && iterations < 5) {
        iterations++;
        // Add assistant message with tool calls to conversation
        messages.push(assistantMessage);

        // Execute all tool calls
        for (const toolCall of assistantMessage.tool_calls) {
          const fnName = toolCall.function.name;
          const fnArgs = JSON.parse(toolCall.function.arguments || "{}");
          console.log(`Executing tool: ${fnName}`, fnArgs);

          const result = await executeTool(fnName, fnArgs);

          // Check if result contains an embedded image for multimodal
          const imageMatch = result.match(/^__IMAGE__(.+?)__(.+?)__ENDIMAGE__(.*)$/s);
          if (imageMatch) {
            const [, mimeType, base64Data, textContent] = imageMatch;
            // Add the tool result as text
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: textContent || "Image loaded successfully. Describe what you see.",
            });
            // Add the document as a user message with multimodal content
            const isPdfContent = mimeType === "application/pdf";
            messages.push({
              role: "user",
              content: [
                { type: "text", text: isPdfContent
                  ? "[System: The following is a PDF document loaded via view_document. Read its full contents — text, tables, numbers, names — and respond to the user's request.]"
                  : "[System: The following image is the document that was just loaded via view_document. Analyze it and respond to the user's request.]"
                },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } },
              ],
            });
          } else {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: result,
            });
          }
        }

        // Call AI again with tool results
        const followUp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages,
            tools: crmTools,
          }),
        });

        if (!followUp.ok) {
          const errBody = await followUp.text();
          console.error("Follow-up AI call failed:", followUp.status, errBody);
          break;
        }

        aiData = await followUp.json();
        assistantMessage = aiData.choices?.[0]?.message;
      }

      const botReply = assistantMessage?.content || "Sorry, I couldn't generate a response.";

      // Insert bot reply into the channel
      const { error: insertError } = await supabase.from("chat_messages").insert({
        channel_id: channelId,
        user_id: AI_BOT_USER_ID,
        user_email: AI_BOT_EMAIL,
        user_name: AI_BOT_NAME,
        content: botReply,
      });

      if (insertError) {
        console.error("Failed to insert bot reply:", insertError);
        throw insertError;
      }

      return new Response(JSON.stringify({ success: true, reply: botReply }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: VALIDATE DOCUMENTS (legacy, redirects to unified review) ──
    if (action === "validate-documents") {
      // Redirect to unified underwriting review
      const body = JSON.stringify({ action: "underwriting-review", opportunityId });
      const selfUrl = `${SUPABASE_URL}/functions/v1/ai-assistant`;
      const redirectRes = await fetch(selfUrl, {
        method: "POST",
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Authorization": req.headers.get("authorization") || "",
          "apikey": req.headers.get("apikey") || "",
        },
        body,
      });
      const redirectData = await redirectRes.json();
      return new Response(JSON.stringify(redirectData), {
        status: redirectRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: SCRUTINIZE WEBSITE (legacy, redirects to unified review) ──
    if (action === "scrutinize-website") {
      const body = JSON.stringify({ action: "underwriting-review", opportunityId });
      const selfUrl = `${SUPABASE_URL}/functions/v1/ai-assistant`;
      const redirectRes = await fetch(selfUrl, {
        method: "POST",
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Authorization": req.headers.get("authorization") || "",
          "apikey": req.headers.get("apikey") || "",
        },
        body,
      });
      const redirectData = await redirectRes.json();
      return new Response(JSON.stringify(redirectData), {
        status: redirectRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: UNIFIED UNDERWRITING REVIEW ──
    if (action === "underwriting-review") {
      if (!opportunityId) {
        return new Response(JSON.stringify({ error: "Missing opportunityId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch opportunity + related data
      const { data: opp } = await supabase
        .from("opportunities")
        .select("id, account_id, contact_id, service_type")
        .eq("id", opportunityId)
        .single();

      if (!opp) {
        return new Response(JSON.stringify({ error: "Opportunity not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch account, contact, documents, wizard state in parallel
      const [accountRes, contactRes, docsRes, wizardRes] = await Promise.all([
        supabase.from("accounts").select("*").eq("id", opp.account_id).single(),
        supabase.from("contacts").select("*").eq("id", opp.contact_id).single(),
        supabase.from("documents").select("*").eq("opportunity_id", opportunityId),
        supabase.from("onboarding_wizard_states").select("form_state").eq("opportunity_id", opportunityId).maybeSingle(),
      ]);

      const account = accountRes.data;
      const contact = contactRes.data;
      const documents = docsRes.data || [];
      const wizardForm = (wizardRes.data?.form_state as Record<string, unknown>) || {};

      // Build document inventory
      const docList = documents.map((d) => `- ${d.file_name} (type: ${d.document_type || "Unassigned"})`).join("\n");

      // Fetch website content
      const websiteUrl = (wizardForm.website_url as string) || account?.website;
      let websiteContent = "";
      let fetchError = "";
      if (websiteUrl) {
        try {
          const formattedUrl = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
          const siteRes = await fetch(formattedUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; MerchantHaus-Underwriting/1.0)" },
            redirect: "follow",
          });
          if (!siteRes.ok) {
            fetchError = `Website returned HTTP ${siteRes.status}`;
          } else {
            const html = await siteRes.text();
            websiteContent = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .substring(0, 15000);
          }
        } catch (e) {
          fetchError = `Could not fetch website: ${e instanceof Error ? e.message : "Unknown error"}`;
        }
      }

      // Build transaction mix context
      const txMix = [
        wizardForm.percent_swiped ? `Swiped: ${wizardForm.percent_swiped}%` : null,
        wizardForm.percent_keyed ? `Keyed: ${wizardForm.percent_keyed}%` : null,
        wizardForm.percent_ecommerce ? `E-commerce: ${wizardForm.percent_ecommerce}%` : null,
        wizardForm.percent_moto ? `MOTO: ${wizardForm.percent_moto}%` : null,
      ].filter(Boolean).join(", ") || "Not provided";

      const customerMix = [
        wizardForm.percent_b2b ? `B2B: ${wizardForm.percent_b2b}%` : null,
        wizardForm.percent_b2c ? `B2C: ${wizardForm.percent_b2c}%` : null,
      ].filter(Boolean).join(", ") || "Not provided";

      const applicationContext = `
ACCOUNT: ${account?.name || "Unknown"}
WEBSITE URL: ${websiteUrl || "Not provided"}
ADDRESS: ${[account?.address1, account?.city, account?.state, account?.zip].filter(Boolean).join(", ") || "Not provided"}

CONTACT: ${[contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unknown"}
EMAIL: ${contact?.email || "Not provided"}
PHONE: ${contact?.phone || "Not provided"}

SERVICE TYPE: ${opp.service_type || "processing"}

APPLICATION / WIZARD DATA:
- DBA Name: ${wizardForm.dbaName || wizardForm.dba_name || "Not provided"}
- Legal Entity: ${wizardForm.legalEntityName || wizardForm.legal_entity_name || "Not provided"}
- Federal Tax ID: ${wizardForm.tin || wizardForm.federal_tax_id ? "Provided" : "Not provided"}
- Ownership Type: ${wizardForm.ownershipType || wizardForm.ownership_type || "Not provided"}
- Nature of Business: ${wizardForm.nature_of_business || wizardForm.product_description || "Not provided"}
- Products/Services: ${wizardForm.products || wizardForm.product_description || "Not provided"}
- MCC/SIC Code: ${wizardForm.sic_mcc_code || "Not provided"}
- Monthly Volume: ${wizardForm.monthlyVolume || wizardForm.monthly_volume || "Not provided"}
- Avg Ticket: ${wizardForm.avgTicket || wizardForm.average_transaction || "Not provided"}
- High Ticket: ${wizardForm.highTicket || wizardForm.high_ticket || "Not provided"}
- Transaction Mix: ${txMix}
- Customer Mix: ${customerMix}

UPLOADED DOCUMENTS (${documents.length} total):
${docList || "No documents uploaded"}

REQUIRED DOCUMENTS CHECK:
${opp.service_type === "gateway_only" ? `** GATEWAY-ONLY DEAL — Lightened document requirements **
- Voided Check / Bank Confirmation: ${documents.some(d => d.document_type === "Voided Check / Bank Confirmation Letter") ? "✅ Present" : "❌ MISSING (HARD REQUIREMENT)"}
- VAR / Tear Sheet: ${documents.some(d => d.document_type === "VAR/Tear Sheet") ? "✅ Present" : "❌ MISSING (HARD REQUIREMENT)"}
NOTE: Gateway-only deals do NOT require Articles of Organization, EIN, Bank Statements, or Owner ID. Do NOT flag these as missing.` : `- Articles of Organisation: ${documents.some(d => d.document_type === "Articles of Organisation") ? "✅ Present" : "❌ MISSING (HARD REQUIREMENT)"}
- EIN / Tax Document: ${documents.some(d => d.document_type === "EIN" || d.document_type === "SSN") ? "✅ Present" : "❌ MISSING (HARD REQUIREMENT)"}
- Voided Check / Bank Confirmation: ${documents.some(d => d.document_type === "Voided Check / Bank Confirmation Letter") ? "✅ Present" : "❌ MISSING (HARD REQUIREMENT)"}
- Bank Statements / Processing History: ${documents.some(d => d.document_type === "Bank Statement" || d.document_type === "Transaction History") ? "✅ Present" : "❌ MISSING (HARD REQUIREMENT — 3 months minimum)"}
- Owner ID (Passport/Drivers License): ${documents.some(d => d.document_type === "Passport/Drivers License") ? "✅ Present" : "❌ MISSING (HARD REQUIREMENT — KYC/CDD)"}`}

${websiteUrl ? (fetchError ? `WEBSITE FETCH ERROR: ${fetchError}` : `WEBSITE CONTENT (extracted text):\n${websiteContent}`) : "NO WEBSITE URL PROVIDED — flag as risk if service type requires web presence"}
`;

      const isGatewayOnly = opp.service_type === "gateway_only";

      const gatewayOnlyPrompt = `You are an expert underwriting reviewer for a payment processing ISO. This is a GATEWAY-ONLY deal — the merchant is only getting a payment gateway (NMI), NOT a processing account. Apply LIGHTER scrutiny accordingly.

TODAY'S DATE: ${new Date().toISOString().split("T")[0]}

═══ IMPORTANT: GATEWAY-ONLY CONTEXT ═══

This merchant is onboarding for GATEWAY SERVICES ONLY. They already have (or will have) their own processing relationship. Your review should focus on:
1. Verifying the business is legitimate and operational
2. Confirming the VAR/Tear Sheet information is consistent
3. Confirming banking details (voided check) are valid
4. Basic website review for legitimacy (NOT full Visa compliance scrutiny)
5. OFAC/sanctions screening

DO NOT flag the following as missing or problematic for gateway-only deals:
- Articles of Organization / Incorporation
- EIN / Tax Documents
- Bank Statements (3 months)
- Owner ID / Passport / Drivers License
- Beneficial ownership declarations
- Detailed transaction mix analysis
- MCC code deep-dive (gateway doesn't determine MCC)

═══ GUARDRAILS ═══

EVIDENCE LABELING: For every key claim, label as: Observed, Verified via public lookup, Inferred, or Unverified.
PII MASKING: Never repeat full EIN, SSN, DOB, or bank account numbers. Mask to last 4 digits only.

═══ DIMENSION 1: GATEWAY DOCUMENT CHECK ═══

Required documents (gateway-only):
1. Voided Check or Bank Confirmation Letter — Verify account holder name ties to business entity or DBA. Check routing number against Fed directory if possible.
2. VAR/Tear Sheet — Verify gateway configuration details, pricing, and merchant information are consistent with the application.

If any additional documents were uploaded, review them for consistency but do not penalize for missing non-required documents.

═══ DIMENSION 2: BASIC WEBSITE / BUSINESS LEGITIMACY ═══

For gateway-only, perform a LIGHTER website review:
- Is the business real and operational? (not a placeholder/coming-soon site)
- Does the business name match what's on the application?
- Is there contact information available?
- Are there any obvious red flags (scam indicators, prohibited content)?

Do NOT penalize for missing refund policies, shipping timelines, or other Visa compliance items — those are the responsibility of the processing relationship, not the gateway.

═══ DIMENSION 3: SCREENING & COMPLIANCE ═══

OFAC/Sanctions: Screen business name, DBA, and principal owner name(s). ANY match or near-match = CRITICAL hard stop.

═══ SCORING RUBRIC (0–10) — GATEWAY-ONLY ═══

Score each dimension:
- Business legitimacy & identity (0–3): Is this a real, operating business?
- Banking verification (0–3): Voided check/bank letter present, routing number valid, name matches
- VAR/Tear Sheet consistency (0–2): Gateway config info is complete and consistent
- Screening & compliance (0–1): OFAC check
- Document integrity (0–1): No tamper indicators, information is consistent

HARD-STOP OVERRIDES: Sanctions match, VMSS/MATCH adverse result, material tampering evidence.

═══ VALIDITY CONCLUSION ═══

Provide: "Likely valid", "Inconclusive", or "Likely invalid" with confidence and justification.

${applicationContext}

Call the "underwriting_review_report" function with your analysis. Remember: this is a GATEWAY-ONLY deal — apply proportionate scrutiny. Do not flag missing processing documents.`;

      const processingPrompt = `You are an expert underwriting reviewer for a payment processing ISO. You behave like an auditor: decisive but falsifiable. You NEVER imply you verified something you did not verify.

TODAY'S DATE: ${new Date().toISOString().split("T")[0]}

═══ GUARDRAILS ═══

EVIDENCE LABELING: For every key claim in your report, label it as one of:
- **Observed** — directly seen in uploaded documents or website content
- **Verified via public lookup** — confirmed against a public source (state registry, OFAC, Fed routing directory, ICANN, etc.)
- **Inferred** — reasoned from available evidence but not directly confirmed
- **Unverified** — could not be confirmed (e.g., registry blocked by CAPTCHA, no TIN-matching capability)

PII MASKING: Never repeat full EIN, SSN, DOB, or bank account numbers. Mask to last 4 digits only (e.g., "EIN: ***-**-1234"). Only short snippets from documents when absolutely required to support a conclusion.

TRUTHFULNESS: Unless you have formal TIN-matching capability, say "EIN coherence check: passed/failed" — never claim you "verified the EIN with the IRS." If a state registry check cannot be performed (CAPTCHA, paywall), label entity status as "Unverified" rather than guessing.

═══ DIMENSION 1: DOCUMENT SCRUTINY ═══

HARD DOCUMENT REQUIREMENTS (all must be present and correctly labelled):
1. Formation Document (Articles of Organization/Incorporation) — Parse: legal entity name, formation state, filing/formation date, entity/file number, registered agent, principal address. Cross-check against state business registry if possible. Red flags: entity name mismatch beyond punctuation, missing filing identifiers, templated/unfinished doc, state registry shows dissolved/revoked/not found.
2. EIN / Tax Document (CP 575, 147C, SS-4, W-9) — Extract EIN (masked), legal name, address, notice date. Cross-check legal name and address against formation docs and bank evidence. Flag: EIN doc missing, name mismatch, edited/inconsistent formatting, W-9 supplied without IRS-issued confirmation.
3. Voided Check or Bank Confirmation Letter — Ties account holder name to account/routing numbers. Verify routing number against Federal Reserve E-Payments Routing Directory if possible. Verify account holder name matches legal entity or DBA.
4. Bank Statements (minimum 3 months) — Evaluate: coherence (date range, bank name, account holder, balances, totals), recency/coverage, integrity/tamper indicators (inconsistent fonts, missing header/footer, cropped pages, arithmetic inconsistencies). When tamper indicators are strong, escalate rather than conclude fraud.
5. Owner ID (Passport or Drivers License) — MANDATORY KYC/CDD requirement per beneficial ownership rules. Verify identity matches principal owner.

Additional checks:
- Cross-document consistency: names, addresses, entity numbers across ALL docs
- Classification issues: flag any misclassified or unlabelled documents

═══ DIMENSION 2: WEBSITE SCRUTINY (Card-Not-Present) ═══

Identity and contactability:
- Business name displayed (legal or DBA)
- Physical address where appropriate
- Working email/phone and a contact page

Policy disclosures (Visa Dispute Management Guidelines require clear disclosure before checkout):
- Refund/return policy: present, specific, easy to find
- Cancellation policy: present (especially for subscriptions/pre-orders)
- Shipping/fulfilment timelines: clear
- Terms and privacy policy exist
- Policies accessible before checkout completion (linked in footer and near checkout)

Security posture:
- HTTPS enabled site-wide, not just at checkout
- TLS configuration assessment

Business model consistency:
- Products on site match application narrative and expected MCC/product mix
- No obvious chargeback drivers (very long shipping windows, "free trial" continuity billing, vague fulfilment)

Domain maturity:
- Domain registration data (ICANN Lookup / RDAP)
- Internet Archive Wayback Machine for sudden changes

Reputation:
- Google Safe Browsing status if assessable

═══ DIMENSION 3: APPLICATION DETAIL REVIEW ═══

1. TRANSACTION MIX — Do stated percentages (swiped/keyed/ecommerce/MOTO) align with business model and website? Must total 100%.
2. BUSINESS DESCRIPTION — Does nature of business match website? Are products/services consistent?
3. MCC CODE — Recommend MOST APPROPRIATE MCC code with description and rationale. Flag if currently assigned MCC doesn't match.
4. VOLUME PROJECTIONS — Are monthly volume, avg ticket, and high ticket plausible for business type?
5. CUSTOMER MIX — B2B vs B2C split should align with business model.

═══ DIMENSION 4: SCREENING & COMPLIANCE ═══

OFAC/Sanctions: Screen business legal entity name, DBA name, principal owner name(s), country of operation against OFAC SDN patterns. ANY match or near-match = CRITICAL hard stop → escalate for human resolution (false positives are common in name screening).

Terminated-merchant screening (VMSS/MATCH): If not available, mark as "Not run — programme access required."

═══ DIMENSION 5: HIGH-RISK MCC ASSESSMENT ═══

Evaluate if recommended MCC falls into high-risk category requiring reserves, delayed funding, or enhanced monitoring. High-risk MCCs include: 5962-5969 (Direct Marketing), 6051 (Money Services), 7801-7802/7995 (Gambling), 7273 (Dating), 4816 (Computer Network Services), 5122 (Drugs/Pharmaceuticals).

═══ SCORING RUBRIC (0–10) ═══

Score each dimension:
- Entity & ownership verification (0–2): formation doc present + state registry match
- Tax identity coherence (0–1): CP 575/147C/SS-4/W-9 coherence across docs (NOT "IRS-verified" unless you truly have that capability)
- Bank settlement proof (0–2): bank letter/voided cheque + routing sanity check (Fed directory) + name match
- Financial evidence & capacity (0–1.5): statement coverage, recency, plausible volumes
- Website transparency & dispute-risk controls (0–2): policies + contact + fulfilment clarity aligned to Visa disclosure emphasis
- Screening & compliance (0–1): VMSS/MATCH if available; OFAC checks
- Document integrity & internal consistency (0–0.5): misclassification, tamper indicators, cross-document mismatches

HARD-STOP OVERRIDES (these override score optimism):
- Sanctions probable match → escalate (OFAC)
- VMSS/MATCH adverse result → escalate/decline
- Entity not found/dissolved with no resolution → decline/escalate
- Material tampering evidence → escalate

Scheme Monitoring Thresholds:
- Visa VAMP: ≥220 bps AND ≥1,500 count (reduces to ≥150 bps April 2026)
- Mastercard ECP: ECM 100-299 chargebacks AND 1.50-2.99%; HECM 300+ AND 3.00%+

═══ VALIDITY CONCLUSION ═══

After scoring, provide a categorical conclusion: "Likely valid", "Inconclusive", or "Likely invalid" with confidence (High/Medium/Low) and brief justification.

═══ PUBLIC CHECKS PERFORMED ═══

List each public check you considered and its outcome:
- State registry lookup: Result or "Not performed" with reason
- OFAC screening: Result
- Domain registration (ICANN): Result or "Not performed"
- Routing number directory (Fed): Result or "Not performed"
- Website history (Wayback): Result or "Not performed"
- Malware/phishing flags (Safe Browsing): Result or "Not performed"

${applicationContext}

Call the "underwriting_review_report" function with your complete analysis. Be thorough, actionable, and reference specific requirements. Label evidence. Include score breakdown, hard stops, public checks, and validity conclusion.`;

      const reviewPrompt = isGatewayOnly ? gatewayOnlyPrompt : processingPrompt;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: isGatewayOnly
              ? "You are an expert reviewer for gateway-only merchant onboarding. Gateway-only merchants are getting a payment gateway (NMI) only — they have their own processing relationship. Apply proportionate, lighter scrutiny. Do NOT flag missing processing documents (Articles of Org, EIN, Bank Statements, Owner ID). Focus on business legitimacy, banking verification, VAR/Tear Sheet consistency, and OFAC screening. Label every key claim as Observed, Verified, Inferred, or Unverified. Mask all PII."
              : "You are an expert underwriting reviewer for payment processing merchant applications. You operate under the Deep Research Specification for AI Underwriter Bot framework. You enforce Visa Core Rules & Dispute Management Guidelines, Mastercard requirements, FATF CDD expectations, PCI DSS standards, and U.S. CIP/beneficial-ownership rules. You behave like an auditor: decisive but falsifiable. You label every key claim as Observed, Verified via public lookup, Inferred, or Unverified. You mask all PII (EIN/SSN/DOB/account numbers to last 4 only). You never imply you verified something you did not verify." },
            { role: "user", content: reviewPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "underwriting_review_report",
                description: "Return a comprehensive unified underwriting review report covering documents, website, and application details.",
                parameters: {
                  type: "object",
                  properties: {
                    readiness_score: {
                      type: "string",
                      enum: ["ready", "needs_attention", "not_ready"],
                      description: "Overall readiness: ready (green), needs_attention (yellow), not_ready (red)",
                    },
                    website_score: {
                      type: "number",
                      description: "Website readiness score from 0 to 10",
                    },
                    website_score_label: {
                      type: "string",
                      enum: ["will_be_declined", "high_risk", "borderline", "acceptable", "strong", "perfect"],
                    },
                    summary: {
                      type: "string",
                      description: "Two to three sentence executive summary of the entire underwriting review.",
                    },
                    recommended_mcc: {
                      type: "object",
                      properties: {
                        code: { type: "string", description: "Recommended MCC code (e.g., 5999)" },
                        description: { type: "string", description: "MCC description (e.g., Miscellaneous and Specialty Retail Stores)" },
                        rationale: { type: "string", description: "Why this MCC is appropriate" },
                      },
                      required: ["code", "description", "rationale"],
                      additionalProperties: false,
                    },
                    transaction_mix_assessment: {
                      type: "string",
                      description: "Assessment of whether the stated transaction mix (swiped/keyed/ecommerce/MOTO) is consistent with the business model and website. Flag any inconsistencies.",
                    },
                    document_completeness: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          document: { type: "string" },
                          status: { type: "string", enum: ["present", "missing", "unverified"] },
                          note: { type: "string" },
                        },
                        required: ["document", "status"],
                        additionalProperties: false,
                      },
                    },
                    website_requirements: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          requirement: { type: "string" },
                          met: { type: "boolean" },
                          detail: { type: "string" },
                        },
                        required: ["requirement", "met"],
                        additionalProperties: false,
                      },
                    },
                    classification_issues: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          file_name: { type: "string" },
                          issue: { type: "string" },
                        },
                        required: ["file_name", "issue"],
                        additionalProperties: false,
                      },
                    },
                    data_gaps: {
                      type: "array",
                      items: { type: "string" },
                    },
                    red_flags: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          flag: { type: "string" },
                          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                          detail: { type: "string" },
                        },
                        required: ["flag", "severity"],
                        additionalProperties: false,
                      },
                    },
                    recommended_actions: {
                      type: "array",
                      items: { type: "string" },
                    },
                    risk_tier: {
                      type: "string",
                      enum: ["standard", "high_risk"],
                      description: "Risk tier based on MCC code. 'high_risk' for known high-risk MCCs (gambling, direct marketing, etc.), 'standard' otherwise.",
                    },
                    ofac_screening: {
                      type: "string",
                      description: "Summary of OFAC/sanctions screening results. State 'Clear' if no matches, or describe any flags.",
                    },
                    score: {
                      type: "number",
                      description: "Overall numerical score out of 10, sum of all score_breakdown categories.",
                    },
                    confidence: {
                      type: "string",
                      enum: ["high", "medium", "low"],
                      description: "Confidence level in the overall assessment.",
                    },
                    recommendation: {
                      type: "string",
                      enum: ["proceed", "proceed_with_conditions", "request_information", "escalate_to_risk", "decline"],
                      description: "Operational recommendation.",
                    },
                    score_breakdown: {
                      type: "array",
                      description: "Per-category scoring breakdown (7 categories summing to max 10).",
                      items: {
                        type: "object",
                        properties: {
                          category: { type: "string", description: "Category name (e.g., 'Entity & ownership verification')" },
                          max_score: { type: "number", description: "Maximum possible score for this category" },
                          score: { type: "number", description: "Awarded score" },
                          note: { type: "string", description: "Brief justification with evidence label" },
                        },
                        required: ["category", "max_score", "score", "note"],
                        additionalProperties: false,
                      },
                    },
                    hard_stops: {
                      type: "array",
                      description: "Critical hard-stop findings that override scoring. Empty array if none.",
                      items: { type: "string" },
                    },
                    public_checks_performed: {
                      type: "array",
                      description: "List of public verification checks performed and their outcomes.",
                      items: {
                        type: "object",
                        properties: {
                          check: { type: "string", description: "Name of check (e.g., 'State registry lookup')" },
                          tool: { type: "string", description: "Tool/source used (e.g., 'NASS directory', 'OFAC SDN list')" },
                          result: { type: "string", description: "Outcome or 'Not performed' with reason" },
                        },
                        required: ["check", "result"],
                        additionalProperties: false,
                      },
                    },
                    validity_conclusion: {
                      type: "string",
                      enum: ["likely_valid", "inconclusive", "likely_invalid"],
                      description: "Categorical validity opinion on the merchant application.",
                    },
                    validity_justification: {
                      type: "string",
                      description: "Brief justification for the validity conclusion.",
                    },
                  },
                  required: ["readiness_score", "summary", "recommended_mcc", "transaction_mix_assessment", "document_completeness", "red_flags", "recommended_actions", "risk_tier", "ofac_screening", "score", "confidence", "recommendation", "score_breakdown", "hard_stops", "public_checks_performed", "validity_conclusion", "validity_justification"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "underwriting_review_report" } },
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up in Settings." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errText = await aiResponse.text();
        console.error("AI gateway error:", status, errText);
        throw new Error(`AI gateway error: ${status}`);
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      let report: Record<string, unknown>;

      if (toolCall?.function?.arguments) {
        report = typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
      } else {
        report = {
          readiness_score: "not_ready",
          summary: aiData.choices?.[0]?.message?.content || "Unable to generate report.",
          recommended_mcc: { code: "N/A", description: "Unable to determine", rationale: "Review failed" },
          transaction_mix_assessment: "Unable to assess",
          document_completeness: [],
          classification_issues: [],
          data_gaps: [],
          red_flags: [],
          recommended_actions: [],
          website_requirements: [],
        };
      }

      // Get triggering user
      const authHeader = req.headers.get("authorization");
      let triggeredBy = "unknown";
      if (authHeader) {
        try {
          const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
          triggeredBy = user?.email || "unknown";
        } catch { /* ignore */ }
      }

      const newScore = (report.readiness_score as string) || "not_ready";

      // Check for no-change
      const { data: lastReport } = await supabase
        .from("validation_reports")
        .select("readiness_score, data_gaps, risk_flags, document_completeness, summary")
        .eq("opportunity_id", opportunityId)
        .eq("no_change", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isNoChange = lastReport
        && lastReport.readiness_score === newScore
        && JSON.stringify(lastReport.data_gaps) === JSON.stringify(report.data_gaps || [])
        && JSON.stringify(lastReport.risk_flags) === JSON.stringify(report.red_flags || []);

      // Persist to validation_reports table
      const { data: savedReport, error: saveError } = await supabase
        .from("validation_reports")
        .insert({
          opportunity_id: opportunityId,
          triggered_by: triggeredBy,
          readiness_score: newScore,
          document_completeness: report.document_completeness || [],
          classification_issues: report.classification_issues || [],
          data_gaps: report.data_gaps || [],
          risk_flags: report.red_flags || [],
          recommended_actions: report.recommended_actions || [],
          summary: (report.summary as string) || null,
          no_change: !!isNoChange,
          risk_tier: (report.risk_tier as string) || null,
        })
        .select()
        .single();

      if (saveError) console.error("Failed to save validation report:", saveError);

      // Also persist website scrutiny if we had a URL
      if (websiteUrl) {
        const wsScore = (report.website_score as number) ?? 0;
        await supabase
          .from("website_scrutiny_reports")
          .insert({
            opportunity_id: opportunityId,
            triggered_by: triggeredBy,
            score: wsScore,
            score_label: (report.website_score_label as string) || "unknown",
            summary: (report.summary as string) || null,
            requirements_met: report.website_requirements || [],
            red_flags: report.red_flags || [],
            recommendations: report.recommended_actions || [],
            website_url: websiteUrl,
            no_change: !!isNoChange,
          });
      }

      // ── AUTO-SAVE AS NOTE ──
      if (!isNoChange) {
        const mcc = report.recommended_mcc as { code?: string; description?: string; rationale?: string } | undefined;
        const recLabel = {
          proceed: "Proceed", proceed_with_conditions: "Proceed with Conditions",
          request_information: "Request Information", escalate_to_risk: "Escalate to Risk", decline: "Decline",
        }[(report.recommendation as string) || ""] || (report.recommendation as string) || "";
        const validityLabel = {
          likely_valid: "Likely Valid", inconclusive: "Inconclusive", likely_invalid: "Likely Invalid",
        }[(report.validity_conclusion as string) || ""] || "";

        const noteLines: string[] = [
          `📋 UNDERWRITING REVIEW — ${newScore === "ready" ? "🟢 Proceed" : newScore === "needs_attention" ? "🟡 Needs Attention" : "🔴 Decline/Escalate"}`,
          `Score: ${report.score ?? "N/A"}/10 | Confidence: ${(report.confidence as string)?.charAt(0).toUpperCase()}${(report.confidence as string)?.slice(1) || "N/A"} | Recommendation: ${recLabel}`,
          "",
          (report.summary as string) || "",
        ];

        // Score breakdown
        const breakdown = report.score_breakdown as Array<{ category: string; max_score: number; score: number; note: string }> | undefined;
        if (breakdown?.length) {
          noteLines.push("", "📊 Score Breakdown:");
          breakdown.forEach(b => noteLines.push(`  ${b.category} (0–${b.max_score}): ${b.score} — ${b.note}`));
        }

        // Hard stops
        const hardStops = report.hard_stops as string[] | undefined;
        noteLines.push("", `🚨 Hard Stops: ${hardStops?.length ? "" : "None"}`);
        hardStops?.forEach(h => noteLines.push(`  ⛔ ${h}`));

        if (mcc) {
          noteLines.push("", `🏷️ Recommended MCC: ${mcc.code || "N/A"} — ${mcc.description || "N/A"}`, `   Rationale: ${mcc.rationale || "N/A"}`);
        }

        if (report.risk_tier === "high_risk") {
          noteLines.push("", "🔴 HIGH-RISK MCC — Reserves, delayed funding, or enhanced monitoring may be required.");
        }

        if (report.ofac_screening) {
          noteLines.push("", `🛡️ OFAC Screening: ${report.ofac_screening}`);
        }

        if (report.transaction_mix_assessment) {
          noteLines.push("", `📊 Transaction Mix: ${report.transaction_mix_assessment}`);
        }

        if (websiteUrl && report.website_score !== undefined) {
          noteLines.push("", `🌐 Website Score: ${report.website_score}/10 (${report.website_score_label || "N/A"})`, `   URL: ${websiteUrl}`);
        }

        // Public checks
        const publicChecks = report.public_checks_performed as Array<{ check: string; tool?: string; result: string }> | undefined;
        if (publicChecks?.length) {
          noteLines.push("", "🔍 Public Checks Performed:");
          publicChecks.forEach(c => noteLines.push(`  ${c.check}${c.tool ? ` (${c.tool})` : ""}: ${c.result}`));
        }

        const redFlags = report.red_flags as Array<{ flag: string; severity: string; detail?: string }> | undefined;
        if (redFlags?.length) {
          noteLines.push("", "🚩 Red Flags:");
          redFlags.forEach(f => noteLines.push(`  ⚠️ [${f.severity.toUpperCase()}] ${f.flag}${f.detail ? ` — ${f.detail}` : ""}`));
        }

        const gaps = report.data_gaps as string[] | undefined;
        if (gaps?.length) {
          noteLines.push("", "❌ Data Gaps:");
          gaps.forEach(g => noteLines.push(`  • ${g}`));
        }

        const actions = report.recommended_actions as string[] | undefined;
        if (actions?.length) {
          noteLines.push("", "💡 Recommended Actions:");
          actions.forEach(a => noteLines.push(`  → ${a}`));
        }

        // Validity conclusion
        noteLines.push("", `✅ Validity: ${validityLabel} — ${report.validity_justification || ""} — Confidence: ${(report.confidence as string) || "N/A"}`);

        const noteContent = noteLines.join("\n");

        // Save as comment
        await supabase.from("comments").insert({
          opportunity_id: opportunityId,
          user_id: AI_BOT_USER_ID,
          user_email: AI_BOT_EMAIL,
          content: noteContent,
        });

        // Log activity
        await supabase.from("activities").insert({
          opportunity_id: opportunityId,
          user_id: AI_BOT_USER_ID,
          user_email: AI_BOT_EMAIL,
          type: "ai_report_saved",
          description: `Underwriting Review completed — ${report.score ?? "N/A"}/10 — ${validityLabel} — ${recLabel}`,
        });
      }

      return new Response(JSON.stringify({
        success: true,
        report,
        website_url: websiteUrl,
        triggered_by: triggeredBy,
        created_at: savedReport?.created_at || new Date().toISOString(),
        no_change: !!isNoChange,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
