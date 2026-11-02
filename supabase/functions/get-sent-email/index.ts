// Returns the email behind an `email_*` activity row so staff can view what was
// actually sent (subject, recipient, timestamp, rendered HTML).
//
// We do not persist sent email bodies; Resend does. The activity row records the
// recipient (in its description) and the moment it was logged, which is just
// after the send. This function finds the Resend email to that recipient sent
// closest to (and not long before) the activity time.
//
// The caller passes only an activity_id. The activity is read with the caller's
// own JWT, so RLS decides whether they may see it — this cannot be used to
// browse arbitrary outbound mail.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole } from "../_shared/require-auth.ts";
import { corsHeaders as buildCors, handleOptions } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Email must have been created within this window around the activity time.
const WINDOW_BEFORE_MS = 10 * 60 * 1000;
const WINDOW_AFTER_MS = 2 * 60 * 1000;
const MAX_PAGES = 10;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

// Resend returns e.g. "2026-11-02 21:39:12.123456+00".
function parseResendDate(s: string | undefined | null): number {
  if (!s) return NaN;
  let iso = s.trim().replace(" ", "T");
  if (/[+-]\d{2}$/.test(iso)) iso += ":00";
  return Date.parse(iso);
}

interface ResendListItem {
  id: string;
  to: string[] | string;
  created_at: string;
  subject?: string;
}

async function resendGet(path: string) {
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

const handler = async (req: Request): Promise<Response> => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return handleOptions(req, cors);

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  const denied = await requireRole(req, cors, ["staff", "admin"], { allowServiceRole: false });
  if (denied) return denied;

  if (!RESEND_API_KEY) return json({ error: "Email service not configured" }, 500);

  try {
    const { activity_id } = await req.json();
    if (!activity_id || typeof activity_id !== "string") {
      return json({ error: "activity_id is required" }, 400);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const { data: activity, error: actErr } = await userClient
      .from("activities")
      .select("id, type, description, created_at")
      .eq("id", activity_id)
      .maybeSingle();

    if (actErr) return json({ error: actErr.message }, 500);
    if (!activity) return json({ error: "Activity not found" }, 404);
    if (!activity.type?.startsWith("email_")) {
      return json({ error: "This activity is not an email" }, 400);
    }

    const recipient = activity.description?.match(EMAIL_RE)?.[0]?.toLowerCase();
    if (!recipient) return json({ error: "No recipient recorded on this activity" }, 404);

    const at = Date.parse(activity.created_at);
    const lower = at - WINDOW_BEFORE_MS;
    const upper = at + WINDOW_AFTER_MS;

    // Resend lists newest first. Walk back until we're past the window.
    let best: { id: string; diff: number } | null = null;
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ limit: "100" });
      if (after) qs.set("after", after);
      const { ok, status, body } = await resendGet(`/emails?${qs}`);
      if (!ok) return json({ error: body?.message || "Failed to list emails" }, status);

      const items: ResendListItem[] = body?.data ?? [];
      let pastWindow = false;
      for (const item of items) {
        const created = parseResendDate(item.created_at);
        if (Number.isNaN(created)) continue;
        if (created < lower) { pastWindow = true; continue; }
        if (created > upper) continue;
        const tos = (Array.isArray(item.to) ? item.to : [item.to]).map((t) => String(t).toLowerCase());
        if (!tos.some((t) => t.includes(recipient))) continue;
        const diff = Math.abs(at - created);
        if (!best || diff < best.diff) best = { id: item.id, diff };
      }

      if (pastWindow || !body?.has_more || items.length === 0) break;
      after = items[items.length - 1].id;
    }

    if (!best) {
      return json({ error: "The sent email could not be found with the email provider" }, 404);
    }

    const { ok, status, body: email } = await resendGet(`/emails/${encodeURIComponent(best.id)}`);
    if (!ok) return json({ error: email?.message || "Failed to load email" }, status);

    return json({
      id: email.id,
      subject: email.subject ?? null,
      from: email.from ?? null,
      to: email.to ?? [recipient],
      cc: email.cc ?? null,
      reply_to: email.reply_to ?? null,
      created_at: email.created_at ? new Date(parseResendDate(email.created_at)).toISOString() : activity.created_at,
      last_event: email.last_event ?? null,
      html: email.html ?? null,
      text: email.text ?? null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in get-sent-email:", error);
    return json({ error: msg }, 500);
  }
};

serve(handler);
