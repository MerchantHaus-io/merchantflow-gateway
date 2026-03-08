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
- Live CRM data — pipeline, accounts, contacts, tasks, team activity, documents (provided below)
- Full SOP procedures, email templates, checklists (provided below)

ACTIONS:
- You can CREATE tasks, UPDATE opportunity stages, ASSIGN opportunities to team members, UPDATE opportunity status, UPDATE account/contact/opportunity records, and ADD NOTES to opportunities.
- When asked to do something, use the available tools to take action immediately. Confirm what you did afterward.
- For ambiguous requests, ask for clarification before acting.
- When updating records, you can change fields like name, website, city, state, status on accounts; first_name, last_name, email, phone on contacts; and service_type, referral_source, language, timezone on opportunities.
- When adding notes, they are saved as comments on the opportunity and logged as activity.
- Team members you can assign to: admin@merchanthaus.io (Jamie), darryn@merchanthaus.io (Darryn), support@merchanthaus.io (Yaseen), sales@merchanthaus.io (Wesley), taryn@merchanthaus.io (Taryn).
- Valid pipeline stages: discovery, qualification, preboarding, underwriting, boarding, live.
- Valid opportunity statuses: active, dead, closed-lost.
- Task priorities: low, medium, high.

SOP REFERENCE (use when team asks about procedures, next steps, or checklists):

SALES WORKFLOW:
1. Discovery — Send intro email, learn about the business, schedule a call if needed. Advance when business model understood and solution fit confirmed.
2. Qualification — Confirm merchant interest, set pipeline type (Processing or Gateway), send Request for Documents email. Advance when doc request acknowledged.
3. Preboarding — Collect all documents, complete the Preboarding Wizard, send "Application in Process" email. Advance when all docs collected and application submitted via NMI microsite.
4. Underwriting — Monitor status daily, respond to stipulations, keep merchant informed, run AI Validate. Advance when processor confirms approval and MID assigned.
5. Boarding — Confirm MID, apply for NMI Gateway (Flat Rate or Interchange+), configure gateway/API/webhooks, run test transactions. Advance when tests pass.
6. Live — Confirm first live transaction, provide support contacts, initiate PCI compliance (SAQ), schedule 30-day check-in.

DOCUMENT CHECKLIST (for preboarding):
3 months bank statements, 3 months processing statements (if switching), voided check or bank letter, Articles of Organization, owner ID (DL/passport), SSN for principal owner.

PRE-UNDERWRITING CHECKLIST (website must-haves before submitting):
Refund/return policy visible, contact page with email+phone, clear product/service description, delivery/fulfillment timeline, terms & conditions, privacy policy, pricing visible and consistent with application.

RED FLAGS (can cause delays or declines):
Coming soon or placeholder site, missing refund policy, no contact info, products on site don't match application, long delivery times (may trigger reserves), aggressive claims, restricted content.

SUBSCRIPTIONS (if applicable):
Clear recurring disclosure (frequency, amount, billing date), cancellation instructions, trial terms explained, refund policy references subscription terms, descriptor matches support contact.

NMI MICROSITES (internal only, never share with merchants):
Flat Rate: for small businesses, predictable volume, simpler pricing.
Interchange+: for high volume, B2B, large ticket, transparent cost-plus pricing.
Workflow: Complete Preboarding Wizard first, then choose pricing model and submit via microsite, then move to Underwriting.

PRICING TIERS:
Starter ($59/mo): Fraud-first foundation, mobile gateway, TXT2PAY.
Intermediate ($99/mo): + Kount AI Fraud Manager, priority support, API access.
Pro ($149/mo): + Level III Advantage, Shopify integration, custom analytics.
Enterprise (Custom): + SLA guarantees, multi-entity, dedicated engineering.

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
    .map((o: any) => `  - ${o.accounts?.name || "Unknown"} (${o.stage} | ${o.status || "active"}) → ${o.assigned_to || "Unassigned"} | Contact: ${[o.contacts?.first_name, o.contacts?.last_name].filter(Boolean).join(" ") || "N/A"}`)
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
        .map((c: any) => `      ${[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed"} | ${c.email || "no email"} | ${c.phone || "no phone"}`)
        .join("\n");
      return `  ${a.name} (${a.status || "active"}) — since ${created}${a.city && a.state ? ` | ${a.city}, ${a.state}` : ""}${a.website ? ` | ${a.website}` : ""}\n${contactLines || "      No contacts on file"}`;
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
        .map((d: any) => `      ${d.file_name} (${d.document_type || "Unassigned"}) — uploaded ${d.created_at ? new Date(d.created_at).toLocaleDateString() : "unknown"}${d.uploaded_by ? " by " + d.uploaded_by : ""}`)
        .join("\n");
      return `  ${acctName} (${docs.length} docs):\n${docLines}`;
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

OPEN TASKS (${tasksRes.data?.length || 0}):
${openTasks || "  None"}

TEAM MEMBERS:
${team || "  None"}

TOTALS:
  Accounts: ${allAccounts.length} total (${activeAccounts} active, ${deadAccounts} dead)
  Contacts: ${contactCountRes.count ?? "Unknown"}
  All Opportunities: ${opps.length} (${activeOpps.length} active, ${deadOpps.length} dead/closed-lost)
  Documents: ${allDocs.length} total
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
        buildCRMContext(supabase),
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
                new_stage: { type: "string", enum: ["discovery", "qualification", "preboarding", "underwriting", "boarding", "live"], description: "The new pipeline stage" },
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
          model: "google/gemini-3-flash-preview",
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
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }

        // Call AI again with tool results
        const followUp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages,
            tools: crmTools,
          }),
        });

        if (!followUp.ok) {
          console.error("Follow-up AI call failed:", followUp.status);
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

    // ── ACTION: VALIDATE DOCUMENTS ──
    if (action === "validate-documents") {
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

      // Build context for AI
      const docList = documents.map((d) => `- ${d.file_name} (type: ${d.document_type || "Unassigned"})`).join("\n");

      const applicationContext = `
ACCOUNT: ${account?.name || "Unknown"}
WEBSITE: ${account?.website || "Not provided"}
ADDRESS: ${[account?.address1, account?.city, account?.state, account?.zip].filter(Boolean).join(", ") || "Not provided"}

CONTACT: ${[contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Unknown"}
EMAIL: ${contact?.email || "Not provided"}
PHONE: ${contact?.phone || "Not provided"}

SERVICE TYPE: ${opp.service_type || "processing"}

WIZARD/APPLICATION DATA:
- DBA Name: ${wizardForm.dbaName || wizardForm.dba_name || "Not provided"}
- Legal Entity: ${wizardForm.legalEntityName || wizardForm.legal_entity_name || "Not provided"}
- Federal Tax ID: ${wizardForm.tin || wizardForm.federal_tax_id ? "Provided" : "Not provided"}
- Ownership Type: ${wizardForm.ownershipType || wizardForm.ownership_type || "Not provided"}
- Monthly Volume: ${wizardForm.monthlyVolume || wizardForm.monthly_volume || "Not provided"}
- Avg Ticket: ${wizardForm.avgTicket || wizardForm.average_transaction || "Not provided"}
- High Ticket: ${wizardForm.highTicket || wizardForm.high_ticket || "Not provided"}
- Products/Services: ${wizardForm.products || wizardForm.product_description || "Not provided"}

UPLOADED DOCUMENTS (${documents.length} total):
${docList || "No documents uploaded"}
`;

      const validationPrompt = `You are an underwriting document reviewer for a merchant services ISO. Analyze this merchant application and its uploaded documents.

${applicationContext}

Return your analysis by calling the "validation_report" function. Be concise and actionable.`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "You are an expert underwriting document reviewer for payment processing merchant applications." },
            { role: "user", content: validationPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "validation_report",
                description: "Return a structured validation report for a merchant application.",
                parameters: {
                  type: "object",
                  properties: {
                    readiness_score: {
                      type: "string",
                      enum: ["ready", "needs_attention", "not_ready"],
                      description: "Overall readiness: ready (green), needs_attention (yellow), not_ready (red)",
                    },
                    summary: {
                      type: "string",
                      description: "One-sentence summary of the application readiness.",
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
                      description: "Required documents with their presence status.",
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
                      description: "Documents that appear misclassified.",
                    },
                    data_gaps: {
                      type: "array",
                      items: { type: "string" },
                      description: "Critical application fields that are missing.",
                    },
                    risk_flags: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          flag: { type: "string" },
                          severity: { type: "string", enum: ["low", "medium", "high"] },
                        },
                        required: ["flag", "severity"],
                        additionalProperties: false,
                      },
                      description: "Risk concerns with severity levels.",
                    },
                    recommended_actions: {
                      type: "array",
                      items: { type: "string" },
                      description: "Specific steps to take before submission.",
                    },
                  },
                  required: ["readiness_score", "summary", "document_completeness", "recommended_actions"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "validation_report" } },
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up in Settings." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errText = await aiResponse.text();
        console.error("AI gateway error:", status, errText);
        throw new Error(`AI gateway error: ${status}`);
      }

      const aiData = await aiResponse.json();
      
      // Extract structured data from tool call
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      let report: Record<string, unknown>;
      
      if (toolCall?.function?.arguments) {
        report = typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
      } else {
        // Fallback if model didn't use tool calling
        report = {
          readiness_score: "unknown",
          summary: aiData.choices?.[0]?.message?.content || "Unable to generate report.",
          document_completeness: [],
          classification_issues: [],
          data_gaps: [],
          risk_flags: [],
          recommended_actions: [],
        };
      }

      // Get triggering user's email from auth header
      const authHeader = req.headers.get("authorization");
      let triggeredBy = "unknown";
      if (authHeader) {
        try {
          const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
          triggeredBy = user?.email || "unknown";
        } catch { /* ignore */ }
      }

      // Persist to database
      const { data: savedReport, error: saveError } = await supabase
        .from("validation_reports")
        .insert({
          opportunity_id: opportunityId,
          triggered_by: triggeredBy,
          readiness_score: (report.readiness_score as string) || "unknown",
          document_completeness: report.document_completeness || [],
          classification_issues: report.classification_issues || [],
          data_gaps: report.data_gaps || [],
          risk_flags: report.risk_flags || [],
          recommended_actions: report.recommended_actions || [],
          summary: (report.summary as string) || null,
        })
        .select()
        .single();

      if (saveError) {
        console.error("Failed to save validation report:", saveError);
      }

      return new Response(JSON.stringify({ success: true, report, id: savedReport?.id }), {
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
