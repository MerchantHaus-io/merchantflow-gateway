import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { requireAuth } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "opportunity-documents";
// The client uploads statements under this prefix. Restricting reads to it
// stops a caller from pointing the extractor at other merchants' documents.
const PATH_PREFIX = "statement-analysis/";
// Matches the 8MB inline-base64 cap the ai-assistant function uses on the same
// gateway (base64 inflates ~33%).
const MAX_INLINE_BYTES = 8 * 1024 * 1024;

const extractionPrompt = `You are analysing a merchant credit-card processing statement (the monthly statement a business receives from its current payment processor, e.g. First Data/Fiserv, Elavon, TSYS, Global, Square, Stripe, Chase Paymentech, Heartland, Clover, etc.).

Read every page carefully — including the fine print, per-card-brand summaries and the itemised fee schedule. Extract the real numbers. Do NOT guess or fabricate; if a value is genuinely not present, leave it null.

Guidance:
- "total_volume" = total gross card sales/processing volume for the statement period (dollars).
- "total_fees" = ALL fees the merchant was charged for the period (interchange + assessments + processor markup + monthly/other fees). This is the number that matters for the effective rate.
- Break the fees into line items where the statement itemises them. Common buckets: interchange, dues & assessments (Visa/MC network fees), processor discount/markup, authorization/transaction fees, monthly/statement/PCI/gateway/batch fees, and any misc/other.
- "current_processor" = the processor or provider whose name/logo is on the statement.
- Flag "junk" fees: PCI non-compliance fees, monthly minimum fees, statement fees, batch fees, IRS/1099 regulatory fees, "network access", "misc" padding — anything that is markup rather than true cost.
- Money values must be plain numbers (no $ or commas). Percentages as plain numbers (e.g. 2.65 for 2.65%).`;

const feeLineItem = {
  type: "object",
  properties: {
    label: { type: "string", description: "Fee name exactly as printed on the statement" },
    amount: { type: "number", description: "Total dollar amount charged for this line for the period" },
    category: {
      type: "string",
      enum: ["interchange", "assessments", "processor_markup", "authorization", "monthly_fee", "other"],
      description: "Best-fit bucket for this fee line",
    },
    is_junk: {
      type: "boolean",
      description: "True if this is padding/junk markup (PCI non-compliance, monthly minimum, statement fee, batch fee, regulatory pass-through padding, misc)",
    },
  },
  required: ["label", "amount", "category", "is_junk"],
  additionalProperties: false,
};

const cardBrand = {
  type: "object",
  properties: {
    brand: { type: "string", description: "Card brand, e.g. Visa, Mastercard, Discover, Amex" },
    volume: { type: "number", description: "Dollar volume for this brand (null if not shown)" },
    transactions: { type: "number", description: "Transaction count for this brand (null if not shown)" },
  },
  required: ["brand"],
  additionalProperties: false,
};

const extractTool = {
  type: "function",
  function: {
    name: "extract_statement",
    description: "Return the extracted figures from the merchant processing statement.",
    parameters: {
      type: "object",
      properties: {
        is_processing_statement: {
          type: "boolean",
          description: "True only if this document really is a merchant card-processing statement.",
        },
        merchant_name: { type: "string", description: "Business / DBA name on the statement" },
        current_processor: { type: "string", description: "Current processor or provider name" },
        statement_period: { type: "string", description: "Statement month/period as printed, e.g. 'March 2026'" },
        total_volume: { type: "number", description: "Total gross card processing volume for the period (dollars)" },
        transaction_count: { type: "number", description: "Total number of transactions for the period" },
        average_ticket: { type: "number", description: "Average ticket size (dollars) if shown or derivable" },
        total_fees: { type: "number", description: "Total of ALL fees charged for the period (dollars)" },
        effective_rate: { type: "number", description: "Effective rate as a percentage if printed on the statement (else null)" },
        fee_line_items: { type: "array", items: feeLineItem, description: "Itemised fee lines" },
        card_mix: { type: "array", items: cardBrand, description: "Per-card-brand breakdown if shown" },
        confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence in the extracted totals" },
        notes: { type: "string", description: "Anything notable: illegible figures, assumptions, or fields you could not find (1-2 sentences)" },
      },
      required: ["is_processing_statement", "total_volume", "total_fees", "fee_line_items", "confidence"],
      additionalProperties: false,
    },
  },
};

// One extraction pass over a given image_url (signed URL or inline data URL).
// Returns { args } on success, or { status, error } on a gateway failure so
// the caller can decide whether to fall back or surface the error.
async function runExtraction(
  apiKey: string,
  imageUrl: string,
): Promise<{ args?: Record<string, unknown>; status?: number; error?: string }> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a payment-processing statement analyst for an ISO. You read merchant processing statements and extract exact figures using the provided tool. Never invent numbers.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: extractionPrompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      tools: [extractTool],
      tool_choice: { type: "function", function: { name: "extract_statement" } },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { status: resp.status, error: errText.slice(0, 300) };
  }

  const data = await resp.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) return { error: "no tool call in response" };
  try {
    return { args: JSON.parse(toolCall.function.arguments) };
  } catch {
    return { error: "malformed tool arguments" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const unauth = await requireAuth(req, corsHeaders);
  if (unauth) return unauth;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let filePath: string | null = null;

  try {
    const body = await req.json();
    filePath = typeof body.file_path === "string" ? body.file_path : null;
    const fileName = typeof body.file_name === "string" ? body.file_name : null;

    if (!filePath) throw new Error("file_path is required");
    if (!filePath.startsWith(PATH_PREFIX)) {
      return new Response(JSON.stringify({ error: "Invalid file path" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 600);
    if (signErr || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: "Uploaded file not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Primary pass: signed URL (best for large files, no base64 bloat).
    let result = await runExtraction(LOVABLE_API_KEY, signed.signedUrl);

    // Surface hard rate/credit limits immediately rather than falling back.
    if (result.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited, try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (result.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits to the Lovable workspace." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Fallback pass: inline base64 data URL (helps when the gateway can't
    //    fetch the signed URL). Mirrors the ai-assistant PDF strategy.
    if (!result.args) {
      const dl = await fetch(signed.signedUrl);
      if (dl.ok) {
        const buf = await dl.arrayBuffer();
        if (buf.byteLength <= MAX_INLINE_BYTES) {
          const bytes = new Uint8Array(buf);
          const chunkSize = 0x8000;
          let binary = "";
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const ct = dl.headers.get("content-type") || "application/pdf";
          const dataUrl = `data:${ct};base64,${btoa(binary)}`;
          result = await runExtraction(LOVABLE_API_KEY, dataUrl);
        }
      }
    }

    if (!result.args) {
      console.error("analyze-statement extraction failed:", result.error);
      return new Response(
        JSON.stringify({ error: "Could not read that statement. Try a clearer PDF." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const extracted = result.args;
    if (extracted.is_processing_statement === false) {
      return new Response(
        JSON.stringify({
          error:
            "That doesn't look like a merchant processing statement. Upload the monthly statement from the merchant's current processor.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ statement: extracted, file_name: fileName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-statement error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } finally {
    // Always clean up the temporary upload — statements are sensitive and the
    // row is never registered in the documents table.
    if (filePath && filePath.startsWith(PATH_PREFIX)) {
      await supabase.storage.from(BUCKET).remove([filePath]).catch(() => {});
    }
  }
});
