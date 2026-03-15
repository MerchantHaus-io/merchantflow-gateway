import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_LABELS = [
  "Bank Statement", "Processing Statement", "Voided Check",
  "Bank Confirmation Letter", "Articles of Organization",
  "EIN / Tax Document", "Passport/Drivers License",
  "Business License", "Lease Agreement", "Transaction History",
  "VAR/Tear Sheet", "Signed Agreement", "Other",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { document_id } = await req.json();
    if (!document_id) throw new Error("document_id is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch doc metadata
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, file_name, file_path, content_type, document_type")
      .eq("id", document_id)
      .single();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ct = (doc.content_type || "").toLowerCase();
    const isImage = ct.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.file_name);
    const isPdf = ct === "application/pdf" || /\.pdf$/i.test(doc.file_name);
    const isWord = /\.(doc|docx)$/i.test(doc.file_name) || ct.includes("word") || ct.includes("openxmlformats");

    if (!isImage && !isPdf && !isWord) {
      return new Response(JSON.stringify({ label: null, confidence: "low", reasoning: "Unsupported file type" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Signed URL
    const { data: signed, error: signErr } = await supabase.storage
      .from("opportunity-documents")
      .createSignedUrl(doc.file_path, 600);
    if (signErr || !signed?.signedUrl) throw new Error("Failed to create signed URL");

    const classificationPrompt = `Analyze this document and classify it into exactly ONE of these categories:
${VALID_LABELS.map(l => `- ${l}`).join("\n")}

Look at the actual content, logos, headers, formatting, and data to determine the document type. Do not rely on the filename.`;

    // Build content payload
    let content: unknown[];
    if (isImage) {
      const resp = await fetch(signed.signedUrl);
      if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const chunkSize = 0x8000;
      let binary = "";
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const b64 = btoa(binary);
      content = [
        { type: "text", text: classificationPrompt },
        { type: "image_url", image_url: { url: `data:${ct || "image/jpeg"};base64,${b64}` } },
      ];
    } else if (isPdf) {
      content = [
        { type: "text", text: classificationPrompt },
        { type: "image_url", image_url: { url: signed.signedUrl } },
      ];
    } else {
      // Word doc
      const resp = await fetch(signed.signedUrl);
      if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      if (buf.byteLength > 8 * 1024 * 1024) throw new Error("File too large (>8MB)");
      const bytes = new Uint8Array(buf);
      const chunkSize = 0x8000;
      let binary = "";
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const b64 = btoa(binary);
      content = [
        { type: "text", text: classificationPrompt },
        { type: "image_url", image_url: { url: `data:${ct || "application/octet-stream"};base64,${b64}` } },
      ];
    }

    // Call AI gateway
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a document classification specialist for a payment processing ISO. Analyze the document and classify it accurately using the provided tool." },
          { role: "user", content },
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_result",
            description: "Return the document classification result.",
            parameters: {
              type: "object",
              properties: {
                label: { type: "string", enum: VALID_LABELS, description: "The classified document type" },
                confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence level" },
                reasoning: { type: "string", description: "Brief explanation (1-2 sentences)" },
              },
              required: ["label", "confidence", "reasoning"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify_result" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway returned ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ label: null, confidence: "low", reasoning: "Could not classify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const classification = JSON.parse(toolCall.function.arguments);
    const { label, confidence, reasoning } = classification;

    // Auto-relabel if not "Other" and confidence is not low
    if (label && label !== "Other" && confidence !== "low") {
      await supabase
        .from("documents")
        .update({ document_type: label })
        .eq("id", document_id);
    }

    return new Response(JSON.stringify({ label, confidence, reasoning, document_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("classify-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
