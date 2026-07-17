// One-shot: re-sanitise support_tickets.description for email-sourced tickets
// that still contain marketing noise. Idempotent. Guarded by a header secret
// when SUPPORT_INBOUND_SECRET is set; otherwise open (call once, then remove).
//
//   curl -X POST https://<project>.functions.supabase.co/sanitize-existing-tickets \
//     -H "x-webhook-secret: <SUPPORT_INBOUND_SECRET>"

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeInboundBody } from "../_shared/support-intake.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = Deno.env.get("SUPPORT_INBOUND_SECRET");
  if (gate) {
    const secret = req.headers.get("x-webhook-secret") ||
      new URL(req.url).searchParams.get("secret");
    if (secret !== gate) return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, description")
    .eq("source", "email")
    .limit(1000);

  if (error) return json({ error: error.message }, 500);

  const updates: Array<{ id: string; ticket_number: string; before: number; after: number }> = [];
  for (const row of data ?? []) {
    const desc = String(row.description ?? "");
    if (!desc) continue;
    // Only rewrite rows that look noisy — cheap sniff test.
    const noisy = /\$\{|\[\[|View in browser|View as webpage|Unsubscribe|©\s*20\d{2}|https?:\/\/\S{200,}/i.test(desc);
    if (!noisy) continue;
    const cleaned = sanitizeInboundBody(desc, "");
    if (cleaned === desc || cleaned === "(no message body)") continue;
    const { error: upErr } = await supabase
      .from("support_tickets")
      .update({ description: cleaned })
      .eq("id", row.id);
    if (!upErr) {
      updates.push({
        id: row.id,
        ticket_number: row.ticket_number,
        before: desc.length,
        after: cleaned.length,
      });
    }
  }

  return json({ ok: true, updated: updates.length, updates });
});
