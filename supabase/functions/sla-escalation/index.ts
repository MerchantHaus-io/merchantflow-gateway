import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * SLA thresholds per pipeline stage (in hours).
 */
const SLA_THRESHOLDS: Record<string, { amber: number; red: number }> = {
  discovery:           { amber: 48,  red: 96 },
  qualified:           { amber: 48,  red: 72 },
  application_prep:    { amber: 72,  red: 120 },
  underwriting_review: { amber: 72,  red: 120 },
  processor_approval:  { amber: 48,  red: 96 },
  gateway_submitted:   { amber: 48,  red: 72 },
  integration_setup:   { amber: 72,  red: 120 },
  testing:             { amber: 48,  red: 72 },
  go_live_ready:       { amber: 24,  red: 48 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all active opportunities
    const { data: opps, error } = await supabase
      .from("opportunities")
      .select("id, stage, stage_entered_at, created_at, sla_status, assigned_to, account_id")
      .eq("status", "active")
      .is("outcome_status", null);

    if (error) throw error;

    const now = Date.now();
    let updated = 0;
    let tasksCreated = 0;

    for (const opp of opps || []) {
      const thresholds = SLA_THRESHOLDS[opp.stage];
      if (!thresholds) continue;

      const enteredAt = opp.stage_entered_at
        ? new Date(opp.stage_entered_at).getTime()
        : new Date(opp.created_at).getTime();
      const hoursInStage = (now - enteredAt) / (1000 * 60 * 60);

      let newStatus: string | null = null;
      if (hoursInStage >= thresholds.red) newStatus = "red";
      else if (hoursInStage >= thresholds.amber) newStatus = "amber";
      else newStatus = "green";

      // Only update if status changed
      if (newStatus !== opp.sla_status) {
        await supabase
          .from("opportunities")
          .update({ sla_status: newStatus })
          .eq("id", opp.id);
        updated++;

        // Create escalation task on red breach
        if (newStatus === "red" && opp.sla_status !== "red") {
          // Get account name
          const { data: account } = await supabase
            .from("accounts")
            .select("name")
            .eq("id", opp.account_id)
            .single();

          const accountName = account?.name || "Unknown Account";
          const daysInStage = Math.floor(hoursInStage / 24);

          await supabase.from("tasks").insert({
            title: `SLA Breach: ${accountName} stuck in ${opp.stage} (${daysInStage}d)`,
            description: `Opportunity has been in the ${opp.stage} stage for ${daysInStage} days, exceeding the SLA threshold. Immediate attention required.`,
            assignee: opp.assigned_to || null,
            status: "open",
            priority: "high",
            source: "sla",
            related_opportunity_id: opp.id,
            created_by: "system@ops.internal",
          });
          tasksCreated++;

          // Create notification for assigned user
          if (opp.assigned_to) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id, email")
              .eq("email", opp.assigned_to)
              .single();

            if (profile) {
              await supabase.from("notifications").insert({
                user_id: profile.id,
                user_email: profile.email,
                title: "🔴 SLA Breach",
                message: `${accountName} has been in ${opp.stage} for ${daysInStage} days. Action required.`,
                type: "task",
                link: "/",
              });
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: (opps || []).length,
        updated,
        tasksCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sla-escalation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
