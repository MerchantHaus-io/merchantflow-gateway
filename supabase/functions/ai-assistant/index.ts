import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_BOT_USER_ID = "00000000-0000-0000-0000-000000000002";
const AI_BOT_EMAIL = "ai-assistant@ops.internal";
const AI_BOT_NAME = "MerchantHaus AI";

const BASE_SYSTEM_PROMPT = `You are MerchantHaus AI — a knowledgeable teammate on an ISO (Independent Sales Organization) team. Think of yourself as the colleague who always has the answer.

TONE & STYLE:
- Talk like a real teammate in Slack — casual, warm, direct. Use first person ("I can see…", "Looks like…").
- Keep it SHORT. A few sentences is usually enough. No walls of text.
- Skip headers, horizontal rules, and heavy formatting. Use bold sparingly for emphasis only.
- Use plain language, not report-speak. Say "3 deals stuck in underwriting" not "There are currently 3 opportunities in the underwriting stage."
- Emojis are fine but don't overdo it — one or two max per message.
- If listing things, keep it tight (no more than 5-6 items). Summarise the rest.
- Never start with "Here is…" or "Based on the data…" — just answer naturally.
- If you don't know something, just say so casually. Don't apologise excessively.

KNOWLEDGE:
- Underwriting (website requirements, doc checklists, red flags)
- Merchant onboarding, payment processing (MCC codes, interchange, chargebacks, reserves)
- Application review guidance and general ops questions
- Live CRM data — pipeline, accounts, contacts, tasks, team activity (provided below)

When answering CRM questions, use ONLY the live data snapshot. Don't guess numbers. If something isn't in the data, say you don't have visibility on it.

You're internal-only — never respond as if talking to a merchant or customer.`;

async function buildCRMContext(supabase: ReturnType<typeof createClient>): Promise<string> {
  const [
    pipelineRes,
    recentOppsRes,
    tasksRes,
    profilesRes,
    accountCountRes,
    contactCountRes,
  ] = await Promise.all([
    // Pipeline stage counts
    supabase.from("opportunities").select("stage, status, assigned_to, account_id").eq("status", "active"),
    // Recent opportunities with account names
    supabase.from("opportunities")
      .select("id, stage, assigned_to, created_at, accounts!inner(name), contacts!inner(first_name, last_name)")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(15),
    // Open tasks
    supabase.from("tasks").select("title, assignee, status, priority, due_at").neq("status", "done").order("created_at", { ascending: false }).limit(15),
    // Team members
    supabase.from("profiles").select("email, full_name, last_seen"),
    // Counts
    supabase.from("accounts").select("id", { count: "exact", head: true }),
    supabase.from("contacts").select("id", { count: "exact", head: true }),
  ]);

  // Pipeline summary
  const opps = pipelineRes.data || [];
  const stageCounts: Record<string, number> = {};
  const assigneeCounts: Record<string, number> = {};
  for (const o of opps) {
    stageCounts[o.stage] = (stageCounts[o.stage] || 0) + 1;
    if (o.assigned_to) assigneeCounts[o.assigned_to] = (assigneeCounts[o.assigned_to] || 0) + 1;
  }

  const pipelineSummary = Object.entries(stageCounts)
    .map(([stage, count]) => `  ${stage}: ${count}`)
    .join("\n");

  const assigneeSummary = Object.entries(assigneeCounts)
    .map(([email, count]) => `  ${email}: ${count} deals`)
    .join("\n");

  // Recent deals
  const recentDeals = (recentOppsRes.data || [])
    .map((o: any) => `  - ${o.accounts?.name || "Unknown"} (${o.stage}) → ${o.assigned_to || "Unassigned"} | Contact: ${[o.contacts?.first_name, o.contacts?.last_name].filter(Boolean).join(" ") || "N/A"}`)
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

  return `

━━━ LIVE CRM DATA SNAPSHOT ━━━

PIPELINE OVERVIEW (${opps.length} active deals):
${pipelineSummary || "  No active deals"}

DEALS BY ASSIGNEE:
${assigneeSummary || "  No assignments"}

RECENT DEALS (newest first):
${recentDeals || "  None"}

OPEN TASKS (${tasksRes.data?.length || 0}):
${openTasks || "  None"}

TEAM MEMBERS:
${team || "  None"}

TOTALS:
  Accounts: ${accountCountRes.count ?? "Unknown"}
  Contacts: ${contactCountRes.count ?? "Unknown"}
  Active Opportunities: ${opps.length}
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

      // Call AI gateway
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
          ],
        }),
      });

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) {
          // Post rate limit message
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

      const aiData = await aiResponse.json();
      const botReply = aiData.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";

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
