// ─────────────────────────────────────────────────────────────────────────────
// underwriting-review edge function
// Standalone, tenant-scoped port of the origin CRM's ai-assistant
// `underwriting-review` action. Given a caseId, it authorizes the caller against
// the case's org (service-role self-enforcement — see _shared/tenant.ts), builds
// a tenant-parameterized prompt, runs the forced-tool LLM review, and persists a
// validation_reports row + usage_events, all scoped to the org.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { authorizeCaseAccess } from "../_shared/tenant.ts";
import { buildPrompt } from "../_shared/prompt.ts";
import { runUnderwritingReview, LlmError } from "../_shared/llm.ts";
import { fetchWebsiteText } from "../_shared/website.ts";
import type { DocRow } from "../_shared/types.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "Missing Authorization header" }, 401);

    const { caseId } = await req.json().catch(() => ({ caseId: undefined }));
    if (!caseId) return json({ error: "Missing caseId" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Service-role client bypasses RLS — authorizeCaseAccess re-checks membership.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authz = await authorizeCaseAccess(admin, jwt, caseId);
    if (!authz.ok) return json({ error: authz.error }, authz.status);
    const { userId, caseRow, settings } = authz;

    const { data: docsData } = await admin
      .from("documents")
      .select("file_name, document_type")
      .eq("case_id", caseId);
    const documents: DocRow[] = (docsData as DocRow[]) ?? [];

    // Website fetch (feature-flagged tenants could skip this; kept simple for v1).
    const website = await fetchWebsiteText(caseRow.website_url);

    const todayIso = new Date().toISOString().split("T")[0];
    const { system, user } = buildPrompt(
      caseRow,
      documents,
      website,
      settings.house_rules ?? {},
      todayIso,
    );

    const { report, usage } = await runUnderwritingReview({
      model: settings.llm_model || "google/gemini-2.5-flash",
      system,
      user,
    });

    const num = (v: unknown): number | null =>
      typeof v === "number" ? v : v == null ? null : Number(v) || null;
    const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

    // Persist report (org + case scoped). Service-role write; org_id comes from
    // the authorized case, never the client.
    const { data: saved, error: saveErr } = await admin
      .from("validation_reports")
      .insert({
        org_id: caseRow.org_id,
        case_id: caseId,
        triggered_by: userId,
        readiness_score: (report.readiness_score as string) ?? "not_ready",
        score: num(report.score),
        website_score: num(report.website_score),
        confidence: (report.confidence as string) ?? null,
        recommendation: (report.recommendation as string) ?? null,
        risk_tier: (report.risk_tier as string) ?? null,
        summary: (report.summary as string) ?? null,
        document_completeness: arr(report.document_completeness),
        classification_issues: arr(report.classification_issues),
        data_gaps: arr(report.data_gaps),
        red_flags: arr(report.red_flags),
        recommended_actions: arr(report.recommended_actions),
        score_breakdown: arr(report.score_breakdown),
        hard_stops: arr(report.hard_stops),
        public_checks_performed: arr(report.public_checks_performed),
        validity_conclusion: (report.validity_conclusion as string) ?? null,
        validity_justification: (report.validity_justification as string) ?? null,
        raw_report: report,
      })
      .select()
      .single();

    if (saveErr) {
      console.error("Failed to save report:", saveErr);
      return json({ error: "Failed to save report" }, 500);
    }

    // Metering + advance case status (best-effort; do not fail the response).
    await admin.from("usage_events").insert({
      org_id: caseRow.org_id,
      kind: "underwriting_review",
      tokens: usage.total_tokens,
    });
    await admin.from("cases").update({ status: "in_review" }).eq("id", caseId);

    return json({ report: saved, meta: { website_error: website.error || null } });
  } catch (e) {
    if (e instanceof LlmError) return json({ error: e.message }, e.status);
    console.error("underwriting-review error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
