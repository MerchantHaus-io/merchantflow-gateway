import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GMAIL_API = "https://www.googleapis.com/gmail/v1";

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
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
    console.error(`Token refresh failed: ${resp.status} ${await resp.text()}`);
    return null;
  }
  return await resp.json();
}

function extractEmail(str: string): string {
  const match = str.match(/<([^>]+)>/);
  return (match ? match[1] : str).trim().toLowerCase();
}

function extractName(str: string): string {
  const match = str.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : str.replace(/<[^>]+>/, "").trim();
}

function getHeader(headers: any[], name: string): string {
  const h = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function parseEmailList(header: string): string[] {
  if (!header) return [];
  return header.split(",").map((e) => extractEmail(e)).filter(Boolean);
}

function decodeBase64Url(str: string): string {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const binStr = atob(base64);
    const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function extractBodyFromPayload(payload: any): string {
  if (!payload) return "";

  // Single-part message
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — look for text/plain first, then text/html
  if (payload.parts) {
    // Try text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fallback: text/html stripped to text
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    // Nested multipart (e.g. multipart/alternative inside multipart/mixed)
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBodyFromPayload(part);
        if (nested) return nested;
      }
    }
  }
  return "";
}

// Team emails to exclude from lead creation
const TEAM_EMAILS = [
  "admin@merchanthaus.io",
  "onboarding@merchanthaus.io",
  "support@merchanthaus.io",
  "sales@merchanthaus.io",
  "taryn@merchanthaus.io",
];

// Domains/patterns that should never create leads (newsletters, services, etc.)
const NOISE_DOMAINS = [
  "noreply", "no-reply", "newsletter", "notifications", "mailer-daemon",
  "postmaster", "donotreply", "do-not-reply", "unsubscribe", "bounce",
  "updates@", "marketing@", "info@google", "feedback@",
];
const NOISE_EMAIL_DOMAINS = [
  "google.com", "googlemail.com", "mercury.com", "read.ai",
  "linkedin.com", "facebook.com", "twitter.com", "instagram.com",
  "slack.com", "zoom.us", "calendly.com", "stripe.com", "square.com",
  "hubspot.com", "mailchimp.com", "sendgrid.net", "amazonses.com",
  "intuit.com", "quickbooks.com", "docusign.com", "dropbox.com",
  "github.com", "atlassian.com", "notion.so", "canva.com",
  "theepochtimes.com", "substack.com",
];

function isTeamEmail(email: string): boolean {
  return TEAM_EMAILS.includes(email.toLowerCase()) || email.toLowerCase().endsWith("@merchanthaus.io");
}

function isNoiseEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (NOISE_DOMAINS.some((n) => lower.includes(n))) return true;
  const domain = lower.split("@")[1] || "";
  if (NOISE_EMAIL_DOMAINS.includes(domain)) return true;
  return false;
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

    let filterEmail: string | null = null;
    let backfillBodies = false;
    try {
      const body = await req.json();
      filterEmail = body?.user_email || null;
      backfillBodies = body?.backfill_bodies === true;
    } catch { /* no body */ }

    // Fetch tokens
    let tokenQuery = supabase.from("google_calendar_tokens").select("*");
    if (filterEmail) tokenQuery = tokenQuery.eq("user_email", filterEmail);
    const { data: tokenRows, error: tokenErr } = await tokenQuery;

    if (tokenErr) throw new Error(`Failed to fetch tokens: ${tokenErr.message}`);
    if (!tokenRows || tokenRows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: "No connected accounts" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load all contacts emails for matching
    const { data: allContacts } = await supabase
      .from("contacts")
      .select("id, email, account_id, first_name, last_name");

    const contactsByEmail = new Map<string, any>();
    for (const c of allContacts || []) {
      if (c.email) contactsByEmail.set(c.email.toLowerCase(), c);
    }

    // Load opportunities with their account/contact for matching
    const { data: allOpportunities } = await supabase
      .from("opportunities")
      .select("id, account_id, contact_id");

    const oppsByContact = new Map<string, any>();
    for (const o of allOpportunities || []) {
      if (o.contact_id) oppsByContact.set(o.contact_id, o);
    }

    const now = new Date();
    let totalSynced = 0;
    let leadsCreated = 0;
    let activitiesCreated = 0;

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

      // Check if Gmail scope is available
      const scopes = token.scopes || "";
      if (!scopes.includes("gmail")) {
        console.log(`${token.user_email} does not have Gmail scope, skipping`);
        continue;
      }

      // === BACKFILL MODE: re-fetch bodies for existing emails ===
      if (backfillBodies) {
        // Process max 80 emails per invocation to stay within timeout
        const MAX_BACKFILL = 80;
        let backfilled = 0;

        const { data: missing } = await supabase
          .from("synced_emails")
          .select("id, gmail_message_id")
          .eq("user_email", token.user_email)
          .is("body_text", null)
          .order("received_at", { ascending: false })
          .limit(MAX_BACKFILL);

        if (!missing || missing.length === 0) {
          console.log(`${token.user_email}: no emails need backfill`);
          continue;
        }

        console.log(`${token.user_email}: backfilling ${missing.length} emails`);

        for (const row of missing) {
          try {
            const msgResp = await fetch(
              `${GMAIL_API}/users/me/messages/${row.gmail_message_id}?format=full`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!msgResp.ok) {
              console.error(`Backfill fetch failed for ${row.gmail_message_id}: ${msgResp.status}`);
              // Mark with empty string so we don't retry forever
              await supabase.from("synced_emails").update({ body_text: "" }).eq("id", row.id);
              continue;
            }
            const msg = await msgResp.json();
            const bodyText = extractBodyFromPayload(msg.payload).slice(0, 10000);
            await supabase.from("synced_emails").update({ body_text: bodyText || "" }).eq("id", row.id);
            backfilled++;
          } catch (e) {
            console.error(`Backfill error for ${row.gmail_message_id}:`, e);
          }
        }

        console.log(`${token.user_email}: backfilled ${backfilled}/${missing.length} email bodies`);
        totalSynced += backfilled;
        continue;
      }

      // Fetch ALL messages (paginated)
      let allMessageIds: string[] = [];
      let pageToken: string | null = null;
      let pageCount = 0;
      const MAX_PAGES = 50; // safety cap ~2500 emails per user

      do {
        const listUrl = new URL(`${GMAIL_API}/users/me/messages`);
        listUrl.searchParams.set("maxResults", "50");
        if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

        const listResp = await fetch(listUrl.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!listResp.ok) {
          console.error(`Gmail list failed for ${token.user_email}: ${listResp.status} ${await listResp.text()}`);
          break;
        }

        const listData = await listResp.json();
        const ids = (listData.messages || []).map((m: any) => m.id);
        allMessageIds = allMessageIds.concat(ids);
        pageToken = listData.nextPageToken || null;
        pageCount++;
      } while (pageToken && pageCount < MAX_PAGES);

      const messageIds = allMessageIds;
      console.log(`${token.user_email}: found ${messageIds.length} total messages across ${pageCount} pages`);

      for (const msgId of messageIds) {
        // Check if already synced
        const { data: existing } = await supabase
          .from("synced_emails")
          .select("id")
          .eq("gmail_message_id", msgId)
          .maybeSingle();

        if (existing) continue;

        // Fetch full message with body
        const msgResp = await fetch(
          `${GMAIL_API}/users/me/messages/${msgId}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!msgResp.ok) continue;
        const msg = await msgResp.json();

        const headers = msg.payload?.headers || [];
        const fromRaw = getHeader(headers, "From");
        const toRaw = getHeader(headers, "To");
        const ccRaw = getHeader(headers, "Cc");
        const subject = getHeader(headers, "Subject");
        const dateStr = getHeader(headers, "Date");

        const fromEmail = extractEmail(fromRaw);
        const fromName = extractName(fromRaw);
        const toEmails = parseEmailList(toRaw);
        const ccEmails = parseEmailList(ccRaw);

        // Extract body text
        const bodyText = extractBodyFromPayload(msg.payload).slice(0, 10000); // cap at 10k chars

        // Determine received_at
        let receivedAt: string;
        try {
          receivedAt = new Date(dateStr || parseInt(msg.internalDate)).toISOString();
        } catch {
          receivedAt = new Date(parseInt(msg.internalDate)).toISOString();
        }

        // Find all external emails in this message
        const allEmails = [fromEmail, ...toEmails, ...ccEmails].filter(
          (e) => e && !isTeamEmail(e) && !isNoiseEmail(e)
        );

        // Match to CRM entities
        let matchedAccountId: string | null = null;
        let matchedContactId: string | null = null;
        let matchedOpportunityId: string | null = null;
        let leadCreated = false;

        for (const email of allEmails) {
          const contact = contactsByEmail.get(email);
          if (contact) {
            matchedContactId = contact.id;
            matchedAccountId = contact.account_id;
            // Check for opportunity
            const opp = oppsByContact.get(contact.id);
            if (opp) {
              matchedOpportunityId = opp.id;
            }
            break;
          }
        }

        // If no match found and there are external emails, create a lead
        if (!matchedContactId && allEmails.length > 0) {
          const leadEmail = allEmails[0];
          const leadName = fromEmail === leadEmail ? fromName : leadEmail.split("@")[0];
          console.log(`Creating lead for: ${leadEmail} (${leadName}) from subject: ${subject}`);

          // Create account
          const { data: newAccount, error: accErr } = await supabase
            .from("accounts")
            .insert({
              name: leadName || leadEmail.split("@")[0],
              status: "lead",
            })
            .select("id")
            .single();

          if (accErr) {
            console.error(`Failed to create account for ${leadEmail}:`, accErr.message);
          }
          if (!accErr && newAccount) {
            // Create contact
            const nameParts = (leadName || "").split(" ");
            const { data: newContact, error: ctErr } = await supabase
              .from("contacts")
              .insert({
                account_id: newAccount.id,
                email: leadEmail,
                first_name: nameParts[0] || leadEmail.split("@")[0],
                last_name: nameParts.slice(1).join(" ") || null,
              })
              .select("id")
              .single();

            if (!ctErr && newContact) {
              // Create opportunity as lead
              const { data: newOpp } = await supabase
                .from("opportunities")
                .insert({
                  account_id: newAccount.id,
                  contact_id: newContact.id,
                  stage: "discovery",
                  referral_source: "Email (Auto-Synced)",
                })
                .select("id")
                .single();

              matchedAccountId = newAccount.id;
              matchedContactId = newContact.id;
              matchedOpportunityId = newOpp?.id || null;
              leadCreated = true;
              leadsCreated++;

              // Add to local cache
              contactsByEmail.set(leadEmail, {
                id: newContact.id,
                email: leadEmail,
                account_id: newAccount.id,
              });
              if (newOpp) {
                oppsByContact.set(newContact.id, newOpp);
              }
            }
          }
        }

        // Create activity
        let activityCreated = false;
        if (matchedOpportunityId) {
          const isInbound = !isTeamEmail(fromEmail);
          const { error: actErr } = await supabase.from("activities").insert({
            opportunity_id: matchedOpportunityId,
            type: isInbound ? "email_received" : "email_sent",
            description: `${isInbound ? "📩" : "📤"} ${subject || "(no subject)"} — ${isInbound ? "from" : "to"} ${isInbound ? fromName || fromEmail : toEmails.join(", ")}`,
            user_email: token.user_email,
          });
          if (!actErr) {
            activityCreated = true;
            activitiesCreated++;
          }
        }

        // Record synced email
        await supabase.from("synced_emails").insert({
          gmail_message_id: msgId,
          gmail_thread_id: msg.threadId || null,
          user_email: token.user_email,
          from_email: fromEmail,
          from_name: fromName || null,
          to_emails: toEmails,
          cc_emails: ccEmails,
          subject: subject || null,
          snippet: msg.snippet || null,
          body_text: bodyText || null,
          received_at: receivedAt,
          matched_account_id: matchedAccountId,
          matched_contact_id: matchedContactId,
          matched_opportunity_id: matchedOpportunityId,
          lead_created: leadCreated,
          activity_created: activityCreated,
        });

        totalSynced++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: totalSynced,
        leads_created: leadsCreated,
        activities_created: activitiesCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Gmail sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
