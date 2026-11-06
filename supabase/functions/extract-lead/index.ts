// extract-lead — read a raw lead (pasted text, or a screenshot / photo with the
// text in it) and return the contact details plus a first outreach email draft.
//
// Nothing is written here. The rep reviews and edits both in the Lead intake
// dialog, which saves the account / contact / opportunity under their own RLS,
// and only then sends the email through send-lead-outreach.
//
// Same Lovable AI gateway + forced tool call pattern as analyze-statement.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireRole } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Same inline cap as analyze-statement / ai-assistant on this gateway. The
// client downscales screenshots well below this before sending.
const MAX_IMAGE_DATA_URL_CHARS = Math.ceil((8 * 1024 * 1024 * 4) / 3);
const MAX_TEXT_CHARS = 20_000;
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif|heic|heif);base64,[A-Za-z0-9+/=]+$/i;

const SYSTEM_PROMPT = `You work for Merchant Haus (merchanthaus.io), a merchant services company: card processing, payment gateways and ACH for small and mid-sized businesses. You turn raw sales leads into clean CRM records and write the first outreach email.

Extraction rules:
- Read everything you are given: a pasted message, a forwarded email, a form submission, a business card, a screenshot of a chat or a social post.
- Only return details that are actually present. Never invent a name, email, phone number or company. Leave a field empty if it is not there.
- Emails lower-case. Phone numbers as written, digits and + ( ) - only.
- The "lead" is the prospective merchant, not the person who forwarded it and not Merchant Haus staff (anyone @merchanthaus.io).
- is_lead is false only when the input plainly is not a sales lead (spam, a newsletter, an unrelated document).

Email rules (email_subject / email_body):
- A short, warm, human first-touch email to the lead from the Merchant Haus sales team. Plain text, no markdown, no HTML.
- Greet by first name if known, otherwise "Hi there,".
- Reference what the lead said or needs, specifically, when the input says it (business type, problem, current processor, volume). Do not invent facts about them.
- One clear next step: a quick call, or sending a recent processing statement for a free statement review.
- Never quote rates, fees, prices, costs, margins or savings figures. No numbers about pricing at all.
- 90-160 words. Sign off as:
  The Merchant Haus Team
  sales@merchanthaus.io
- Subject: under 60 characters, specific to the lead, no clickbait, no ALL CAPS.`;

const extractTool = {
  type: "function",
  function: {
    name: "record_lead",
    description: "Return the lead's details and a first outreach email draft.",
    parameters: {
      type: "object",
      properties: {
        is_lead: { type: "boolean", description: "False only if the input is clearly not a sales lead." },
        first_name: { type: "string" },
        last_name: { type: "string" },
        email: { type: "string", description: "The lead's email address, lower-case." },
        phone: { type: "string" },
        company: { type: "string", description: "Business / DBA name." },
        title: { type: "string", description: "The lead's job title or role, if given." },
        website: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        business_type: { type: "string", description: "What the business sells or does." },
        current_processor: { type: "string", description: "Their current card processor / gateway, if mentioned." },
        monthly_volume: { type: "string", description: "Monthly card volume as written, if mentioned." },
        lead_source: { type: "string", description: "Where the lead came from if the input says (e.g. WhatsApp, Facebook, referral from X)." },
        summary: { type: "string", description: "One or two sentences: who they are and what they want." },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        email_subject: { type: "string" },
        email_body: { type: "string", description: "Plain-text email body including the greeting and sign-off." },
      },
      required: ["is_lead", "confidence", "email_subject", "email_body"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = await requireRole(req, corsHeaders, ["staff", "admin"], { allowServiceRole: false });
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const image = typeof body.image === "string" ? body.image.trim() : "";

    if (!text && !image) return json({ error: "Paste the lead text or drop an image." }, 400);
    if (text.length > MAX_TEXT_CHARS) return json({ error: "That text is too long. Paste just the lead." }, 400);
    if (image) {
      if (image.length > MAX_IMAGE_DATA_URL_CHARS) return json({ error: "That image is too large." }, 400);
      if (!IMAGE_DATA_URL.test(image)) return json({ error: "Unsupported image. Use a PNG, JPG or WebP." }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const userContent: unknown[] = [
      {
        type: "text",
        text: image
          ? `Here is a new lead as an image${text ? ", with a note from the rep" : ""}. Extract the lead and draft the email.${text ? `\n\nRep's note / extra text:\n${text}` : ""}`
          : `Here is a new lead. Extract the lead and draft the email.\n\n---\n${text}\n---`,
      },
    ];
    if (image) userContent.push({ type: "image_url", image_url: { url: image } });

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [extractTool],
        tool_choice: { type: "function", function: { name: "record_lead" } },
      }),
    });

    if (resp.status === 429) return json({ error: "Rate limited, try again in a moment." }, 429);
    if (resp.status === 402) return json({ error: "AI credits exhausted. Add credits to the Lovable workspace." }, 402);
    if (!resp.ok) {
      console.error("extract-lead gateway error:", resp.status, (await resp.text()).slice(0, 300));
      return json({ error: "Could not read that lead. Try again, or paste the text." }, 502);
    }

    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let lead: Record<string, unknown>;
    try {
      lead = JSON.parse(args);
    } catch {
      console.error("extract-lead: no/malformed tool call");
      return json({ error: "Could not read that lead. Try again, or paste the text." }, 422);
    }

    return json({ lead });
  } catch (e) {
    console.error("extract-lead error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
