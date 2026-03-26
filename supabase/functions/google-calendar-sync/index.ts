import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Google Calendar API base
const GCAL_API = "https://www.googleapis.com/calendar/v3";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

// Create a JWT and exchange for access token
async function getAccessToken(sa: ServiceAccountKey, impersonateEmail?: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload: any = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };
  if (impersonateEmail) {
    payload.sub = impersonateEmail;
  }

  const enc = (obj: any) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key
  const pemBody = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsignedToken}.${sigB64}`;

  // Exchange JWT for access token
  const resp = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Token exchange failed [${resp.status}]: ${errBody}`);
  }

  const tokenData = await resp.json();
  return tokenData.access_token;
}

async function fetchCalendarEvents(accessToken: string, calendarId: string, timeMin: string, timeMax: string) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });

  const resp = await fetch(`${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`Failed to fetch calendar ${calendarId}: ${resp.status} ${errBody}`);
    return [];
  }

  const data = await resp.json();
  return data.items || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");

    const calendarIds = Deno.env.get("GOOGLE_CALENDAR_IDS") || "";
    const teamEmails = (Deno.env.get("GOOGLE_TEAM_EMAILS") || "admin@merchanthaus.io,darryn@merchanthaus.io,support@merchanthaus.io,sales@merchanthaus.io,taryn@merchanthaus.io").split(",").map(e => e.trim());

    const sa: ServiceAccountKey = JSON.parse(saJson);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Time range: sync 30 days ahead
    const now = new Date();
    const timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const allEvents: any[] = [];

    // 1. Fetch shared calendar events (no impersonation needed if SA has access)
    const sharedCalIds = calendarIds.split(",").map(c => c.trim()).filter(Boolean);
    if (sharedCalIds.length > 0) {
      const sharedToken = await getAccessToken(sa);
      for (const calId of sharedCalIds) {
        const events = await fetchCalendarEvents(sharedToken, calId, timeMin, timeMax);
        for (const ev of events) {
          allEvents.push({ ...ev, _calendarId: calId, _ownerEmail: "shared" });
        }
      }
    }

    // 2. Fetch individual user calendars via impersonation
    for (const email of teamEmails) {
      try {
        const userToken = await getAccessToken(sa, email);
        const events = await fetchCalendarEvents(userToken, "primary", timeMin, timeMax);
        for (const ev of events) {
          allEvents.push({ ...ev, _calendarId: "primary", _ownerEmail: email });
        }
      } catch (err) {
        console.error(`Failed to fetch calendar for ${email}:`, err);
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
      // Delete events that are no longer in Google Calendar
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
