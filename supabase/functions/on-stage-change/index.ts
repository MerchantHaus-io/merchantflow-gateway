// Drains the stage_change_events outbox written by the on_stage_change()
// Postgres trigger. For each pending row:
//   1) Sends the assigned-to stage-change notification email.
//   2) On entry into "qualified", invokes send-qualified-docs-request with
//      the contact email (if known).
//   3) Marks the outbox row processed (or failed with last_error after 3 attempts).
//
// Invoke periodically via Supabase scheduled function or webhook. The trigger
// is server-side, so even if this function is briefly down events accumulate
// safely in the outbox.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 25;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEAM_EMAIL: Record<string, string> = {
  "Wesley": "sales@merchanthaus.io",
  "Jamie": "jamie@merchanthaus.io",
  "Darryn": "admin@merchanthaus.io",
  "Taryn": "taryn@merchanthaus.io",
  "Sheiky": "support@merchanthaus.io",
};

interface OutboxRow {
  id: string;
  opportunity_id: string;
  account_id: string;
  old_stage: string | null;
  new_stage: string;
  assigned_to: string | null;
  changed_by: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: claimed, error: claimError } = await supabase
    .from("stage_change_events")
    .update({ status: "processing", attempts: undefined })
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE)
    .select("*");

  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (claimed || []) as OutboxRow[];
  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await dispatch(supabase, row);
      await supabase
        .from("stage_change_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", row.id);
      processed++;
    } catch (err) {
      const nextAttempts = (row.attempts ?? 0) + 1;
      const finalStatus = nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await supabase
        .from("stage_change_events")
        .update({
          status: finalStatus,
          attempts: nextAttempts,
          last_error: String(err instanceof Error ? err.message : err),
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ processed, failed, total: rows.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function dispatch(
  supabase: ReturnType<typeof createClient>,
  row: OutboxRow,
): Promise<void> {
  // Pull joined info needed for email payloads.
  const { data: opp } = await supabase
    .from("opportunities")
    .select("id, account_id, contact_id, account:accounts(name), contact:contacts(first_name, last_name, email)")
    .eq("id", row.opportunity_id)
    .maybeSingle();

  const accountName = (opp?.account as any)?.name ?? "Unknown Account";
  const contactEmail = (opp?.contact as any)?.email as string | undefined;
  const contactFirst = (opp?.contact as any)?.first_name as string | undefined;

  // 1) Notify the assigned owner of the stage change.
  if (row.assigned_to) {
    const recipient = TEAM_EMAIL[row.assigned_to];
    if (recipient) {
      const { error } = await supabase.functions.invoke("send-notification-email", {
        body: {
          type: "stage_change",
          recipientEmail: recipient,
          recipientName: row.assigned_to,
          data: {
            accountName,
            oldStage: row.old_stage ?? "—",
            newStage: row.new_stage,
            changedBy: row.changed_by ?? "system",
          },
        },
      });
      if (error) throw error;
    }
  }

  // 2) On qualified, request docs from the contact.
  if (row.new_stage === "qualified" && contactEmail) {
    const { error } = await supabase.functions.invoke("send-qualified-docs-request", {
      body: {
        opportunity_id: row.opportunity_id,
        account_name: accountName,
        contact_email: contactEmail,
        contact_first_name: contactFirst ?? "there",
      },
    });
    if (error) throw error;
  }
}
