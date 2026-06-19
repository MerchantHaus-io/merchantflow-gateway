// Validate-only: posts payload to EMS validation endpoint and returns
// field-level errors WITHOUT creating a deal or writing to kurv_deal_submissions.
// Tries Validate{SignedDealV2|UnsignedDeal} first, then falls back to ValidateDeal.
import { requireAuth } from "../_shared/require-auth.ts";
import { kurvCors, kurvFetch, kurvJson, adminClient } from "../_shared/kurv.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: kurvCors });
  const unauth = await requireAuth(req, kurvCors);
  if (unauth) return unauth;

  try {
    const { deal_type = "unsigned", payload } = await req.json();
    if (!payload || typeof payload !== "object") {
      return kurvJson({ error: "payload is required" }, 400);
    }
    if (!["signed", "unsigned"].includes(deal_type)) {
      return kurvJson({ error: "deal_type must be signed|unsigned" }, 400);
    }

    const sb = adminClient();
    const candidates = deal_type === "signed"
      ? ["/api/v1/Deal/ValidateSignedDealV2", "/api/v1/Deal/ValidateDeal"]
      : ["/api/v1/Deal/ValidateUnsignedDeal", "/api/v1/Deal/ValidateDeal"];

    const attempts: Array<{ endpoint: string; status: number; body: any }> = [];
    let final: { endpoint: string; status: number; body: any } | null = null;

    for (const endpoint of candidates) {
      const res = await kurvFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      }, sb);
      const text = await res.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
      attempts.push({ endpoint, status: res.status, body: parsed });
      // 404 = endpoint doesn't exist in this EMS env, try the next candidate.
      if (res.status === 404) continue;
      final = { endpoint, status: res.status, body: parsed };
      break;
    }

    if (!final) {
      return kurvJson({
        ok: false,
        unsupported: true,
        message: "EMS validate endpoints not available in this environment",
        attempts,
      }, 200);
    }

    // Normalize EMS error shapes into a flat list.
    const issues: Array<{ field?: string; message: string; severity: "error" | "warning" }> = [];
    const b = final.body;
    if (b && typeof b === "object") {
      // ASP.NET ModelState: { errors: { "Field.Path": ["msg"] } }
      if (b.errors && typeof b.errors === "object") {
        for (const [field, msgs] of Object.entries(b.errors)) {
          (Array.isArray(msgs) ? msgs : [msgs]).forEach((m) =>
            issues.push({ field, message: String(m), severity: "error" })
          );
        }
      }
      // EMS-style: { ValidationErrors: [{ Field, Message }] }
      const ve = b.ValidationErrors ?? b.validationErrors ?? b.Errors ?? b.errors_list;
      if (Array.isArray(ve)) {
        ve.forEach((e: any) =>
          issues.push({
            field: e.Field ?? e.field ?? e.PropertyName,
            message: String(e.Message ?? e.message ?? e.ErrorMessage ?? JSON.stringify(e)),
            severity: (e.Severity ?? "error").toLowerCase() === "warning" ? "warning" : "error",
          })
        );
      }
      // Single message
      if (!issues.length && (b.Message || b.message) && final.status >= 400) {
        issues.push({ message: String(b.Message ?? b.message), severity: "error" });
      }
    }

    return kurvJson({
      ok: final.status < 400,
      endpoint: final.endpoint,
      status: final.status,
      issues,
      raw: final.body,
      attempts,
    });
  } catch (err) {
    return kurvJson({ error: (err as Error).message }, 500);
  }
});
