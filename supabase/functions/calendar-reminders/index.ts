import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isBlockedRecipient } from "../_shared/blocked-emails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const twentyThreeHoursFromNow = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const fortyFiveMinFromNow = new Date(now.getTime() + 45 * 60 * 1000);

    // Get all team profiles for notifications (excluding silenced test accounts)
    const { data: allProfiles } = await supabase.from("profiles").select("id, email");
    const profiles = (allProfiles ?? []).filter((p) => !isBlockedRecipient(p.email));
    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let notificationsSent = 0;

    // 1. Events starting within the next hour (1h reminder) - not yet sent
    const { data: soonEvents } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("reminder_1h_sent", false)
      .eq("status", "confirmed")
      .gte("start_time", fortyFiveMinFromNow.toISOString())
      .lte("start_time", oneHourFromNow.toISOString());

    for (const event of soonEvents || []) {
      for (const profile of profiles) {
        await supabase.from("notifications").insert({
          user_id: profile.id,
          user_email: profile.email || "",
          title: "📅 Meeting in 1 hour",
          message: `${event.title} starts at ${new Date(event.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
          type: "calendar",
          link: "/calendar",
        });
      }
      await supabase
        .from("calendar_events")
        .update({ reminder_1h_sent: true })
        .eq("id", event.id);
      notificationsSent++;
    }

    // 2. Events starting in ~24 hours (24h reminder)
    const { data: tomorrowEvents } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("reminder_24h_sent", false)
      .eq("status", "confirmed")
      .gte("start_time", twentyThreeHoursFromNow.toISOString())
      .lte("start_time", twentyFourHoursFromNow.toISOString());

    for (const event of tomorrowEvents || []) {
      for (const profile of profiles) {
        await supabase.from("notifications").insert({
          user_id: profile.id,
          user_email: profile.email || "",
          title: "📅 Meeting tomorrow",
          message: `${event.title} — ${new Date(event.start_time).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}`,
          type: "calendar",
          link: "/calendar",
        });
      }
      await supabase
        .from("calendar_events")
        .update({ reminder_24h_sent: true })
        .eq("id", event.id);
      notificationsSent++;
    }

    // 3. Newly synced FUTURE events (not backdated) that haven't had creation notification
    //    Only notify if the event was created recently on Google (not just synced now from history)
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    const { data: newEvents } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("reminder_created_sent", false)
      .eq("status", "confirmed")
      .gte("synced_at", fifteenMinAgo)
      .gte("start_time", now.toISOString());

    for (const event of newEvents || []) {
      // Skip events that started more than 1 hour from now — these are backdated/old
      const eventStart = new Date(event.start_time);
      const hoursUntilEvent = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      // Only notify for events happening within the next 30 days (skip very old synced events)
      if (hoursUntilEvent > 30 * 24) {
        await supabase
          .from("calendar_events")
          .update({ reminder_created_sent: true })
          .eq("id", event.id);
        continue;
      }

      for (const profile of profiles) {
        await supabase.from("notifications").insert({
          user_id: profile.id,
          user_email: profile.email || "",
          title: "📅 New meeting scheduled",
          message: `${event.title} — ${new Date(event.start_time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
          type: "calendar",
          link: "/calendar",
        });
      }
      await supabase
        .from("calendar_events")
        .update({ reminder_created_sent: true })
        .eq("id", event.id);
      notificationsSent++;
    }

    return new Response(
      JSON.stringify({ success: true, sent: notificationsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Calendar reminder error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
