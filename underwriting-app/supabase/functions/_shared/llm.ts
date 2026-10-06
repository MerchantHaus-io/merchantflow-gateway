import { REVIEW_TOOL } from "./reviewSchema.ts";

// OpenAI-compatible chat-completions call with a forced tool. Provider is
// configured per-deployment via LLM_BASE_URL + LLM_API_KEY (owner-hosted, shared
// across tenants); the model is chosen per-tenant (org_settings.llm_model).
const DEFAULT_BASE_URL = "https://ai.gateway.lovable.dev/v1";

export interface ReviewResult {
  report: Record<string, unknown>;
  usage: { total_tokens: number | null };
}

export class LlmError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function runUnderwritingReview(params: {
  model: string;
  system: string;
  user: string;
}): Promise<ReviewResult> {
  const apiKey = Deno.env.get("LLM_API_KEY");
  if (!apiKey) throw new LlmError(500, "LLM_API_KEY not configured");
  const baseUrl = (Deno.env.get("LLM_BASE_URL") || DEFAULT_BASE_URL).replace(/\/$/, "");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      tools: [REVIEW_TOOL],
      tool_choice: { type: "function", function: { name: "underwriting_review_report" } },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new LlmError(429, "Rate limited. Please try again in a moment.");
    if (res.status === 402) throw new LlmError(402, "AI credits exhausted.");
    const text = await res.text();
    throw new LlmError(502, `LLM gateway error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  const totalTokens: number | null = data.usage?.total_tokens ?? null;

  let report: Record<string, unknown>;
  if (toolCall?.function?.arguments) {
    report = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
  } else {
    // Graceful fallback mirrors the origin CRM behavior.
    report = {
      readiness_score: "not_ready",
      summary: data.choices?.[0]?.message?.content || "Unable to generate report.",
      recommended_mcc: { code: "N/A", description: "Unable to determine", rationale: "Review failed" },
      transaction_mix_assessment: "Unable to assess",
      document_completeness: [],
      classification_issues: [],
      data_gaps: [],
      red_flags: [],
      recommended_actions: [],
      score: 0,
      confidence: "low",
      recommendation: "request_information",
      score_breakdown: [],
      hard_stops: [],
      public_checks_performed: [],
      validity_conclusion: "inconclusive",
      validity_justification: "The model did not return a structured report.",
    };
  }
  return { report, usage: { total_tokens: totalTokens } };
}
