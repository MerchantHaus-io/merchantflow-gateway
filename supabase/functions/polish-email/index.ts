import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { requireAuth } from "../_shared/require-auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const unauth = await requireAuth(req, corsHeaders);
  if (unauth) return unauth;

  try {
    const { html, tone } = await req.json();
    if (!html) throw new Error("Missing html body");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an expert B2B sales email copywriter for a payment processing company (Merchant Haus). 
Your job is to polish the user's draft email while preserving their intent, merge tags (like {{first_name}}, {{company}}), and HTML structure.

Rules:
- Keep the HTML formatting (paragraphs, bold, italic, links, lists) intact
- Make it more professional, concise, and compelling
- Maintain a ${tone || "professional and friendly"} tone
- Keep it short — sales emails should be 3-5 short paragraphs max
- Preserve ALL merge tags exactly as written (e.g. {{first_name}})
- Return ONLY the polished HTML — no explanation, no markdown, no code fences
- Use <p>, <strong>, <em>, <a>, <ul>/<li> tags as needed
- Do NOT add a subject line — only the body`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Polish this sales email draft:\n\n${html}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const polished = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ html: polished }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("polish-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
