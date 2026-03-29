import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GCAL_API = "https://www.googleapis.com/calendar/v3";

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<{ access_token: string; expires_in: number } | null> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`Token refresh failed: ${resp.status} ${errBody}`);
    return null;
  }

  return await resp.json();
}

async function fetchCalendarEvents(accessToken: string, calendarId: string, timeMin?: string, timeMax?: string) {
  const allItems: any[] = [];
  let pageToken: string | null = null;
  let pages = 0;
  const MAX_PAGES = 50;

  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (timeMin) params.set("timeMin", timeMin);
    if (timeMax) params.set("timeMax", timeMax);
    if (pageToken) params.set("pageToken", pageToken);

    const resp = await fetch(`${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`Failed to fetch calendar ${calendarId}: ${resp.status} ${errBody}`);
      break;
    }

    const data = await resp.json();
    allItems.push(...(data.items || []));
    pageToken = data.nextPageToken || null;
    pages++;
  } while (pageToken && pages < MAX_PAGES);

  return allItems;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("Google OAuth credentials not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Optional: sync only a specific user
    let filterEmail: string | null = null;
    try {
      const body = await req.json();
      filterEmail = body?.user_email || null;
    } catch { /* no body */ }

    // Fetch all stored tokens
    let tokenQuery = supabase.from("google_calendar_tokens").select("*");
    if (filterEmail) {
      tokenQuery = tokenQuery.eq("user_email", filterEmail);
    }
    const { data: tokenRows, error: tokenErr } = await tokenQuery;

    if (tokenErr) throw new Error(`Failed to fetch tokens: ${tokenErr.message}`);
    if (!tokenRows || tokenRows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: "No connected calendars" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    // Sync all-time: no timeMin, 1 year forward
    const timeMax = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const allEvents: any[] = [];
    const sharedCalIds = (Deno.env.get("GOOGLE_CALENDAR_IDS") || "").split(",").map(c => c.trim()).filter(Boolean);
    let sharedCalsFetched = false;

    for (const token of tokenRows) {
      let accessToken = token.access_token;

      // Refresh if expired
      const expiresAt = new Date(token.expires_at);
      if (expiresAt <= now) {
        const refreshed = await refreshAccessToken(token.refresh_token, clientId, clientSecret);
        if (!refreshed) {
          console.error(`Failed to refresh token for ${token.user_email}`);
          continue;
        }
        accessToken = refreshed.access_token;
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

        await supabase.from("google_calendar_tokens").update({
          access_token: accessToken,
          expires_at: newExpiry,
          updated_at: new Date().toISOString(),
        }).eq("user_email", token.user_email);
      }

      // Fetch user's primary calendar
      try {
        const events = await fetchCalendarEvents(accessToken, "primary", timeMin, timeMax);
        for (const ev of events) {
          allEvents.push({ ...ev, _calendarId: "primary", _ownerEmail: token.user_email });
        }
      } catch (err) {
        console.error(`Failed to fetch primary calendar for ${token.user_email}:`, err);
      }

      // Fetch shared calendars using the first available token
      if (!sharedCalsFetched && sharedCalIds.length > 0) {
        for (const calId of sharedCalIds) {
          try {
            const events = await fetchCalendarEvents(accessToken, calId, timeMin, timeMax);
            for (const ev of events) {
              allEvents.push({ ...ev, _calendarId: calId, _ownerEmail: "shared" });
            }
            sharedCalsFetched = true;
          } catch (err) {
            console.error(`Failed to fetch shared calendar ${calId}:`, err);
          }
        }
      }
    }

    // Deduplicate by Google event ID
    const uniqueEvents = new Map<string, any>();
    for (const ev of allEvents) {
      if (ev.id && !uniqueEvents.has(ev.id)) {
        uniqueEvents.set(ev.id, ev);
      }
    }

    // Upsert to database
    let synced = 0;
    for (const [googleId, ev] of uniqueEvents) {
      const startTime = ev.start?.dateTime || ev.start?.date;
      const endTime = ev.end?.dateTime || ev.end?.date;
      if (!startTime || !endTime) continue;

      const isAllDay = !ev.start?.dateTime;
      const attendees = (ev.attendees || []).map((a: any) => ({
        email: a.email,
        displayName: a.displayName || null,
        responseStatus: a.responseStatus || null,
        self: a.self || false,
      }));

      const row = {
        google_event_id: googleId,
        title: ev.summary || "Untitled",
        description: ev.description || null,
        location: ev.location || null,
        start_time: isAllDay ? `${startTime}T00:00:00Z` : startTime,
        end_time: isAllDay ? `${endTime}T00:00:00Z` : endTime,
        all_day: isAllDay,
        calendar_id: ev._calendarId,
        calendar_owner_email: ev._ownerEmail,
        organizer_email: ev.organizer?.email || null,
        attendees,
        status: ev.status || "confirmed",
        html_link: ev.htmlLink || null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("calendar_events")
        .upsert(row, { onConflict: "google_event_id" });

      if (error) {
        console.error(`Failed to upsert event ${googleId}:`, error);
      } else {
        synced++;
      }
    }

    // Clean up cancelled/deleted events
    const googleIds = Array.from(uniqueEvents.keys());
    if (googleIds.length > 0) {
      const { data: existing } = await supabase
        .from("calendar_events")
        .select("id, google_event_id")
        .gte("start_time", timeMin)
        .lte("start_time", timeMax);

      if (existing) {
        const toDelete = existing.filter(e => e.google_event_id && !googleIds.includes(e.google_event_id));
        for (const del of toDelete) {
          await supabase.from("calendar_events").delete().eq("id", del.id);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced, total: uniqueEvents.size }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Calendar sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
