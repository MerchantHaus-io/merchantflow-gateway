// The forced tool schema the LLM must call. Ported verbatim from the origin CRM
// (ai-assistant `underwriting_review_report`) — it already implements the
// response contract in underwriting-bot-spec.md (spec.md). Keep changes minimal
// so behavior parity holds.
export const REVIEW_TOOL = {
  type: "function",
  function: {
    name: "underwriting_review_report",
    description:
      "Return a comprehensive unified underwriting review report covering documents, website, and application details.",
    parameters: {
      type: "object",
      properties: {
        readiness_score: {
          type: "string",
          enum: ["ready", "needs_attention", "not_ready"],
          description:
            "Overall readiness: ready (green), needs_attention (yellow), not_ready (red)",
        },
        website_score: { type: "number", description: "Website readiness score from 0 to 100" },
        website_score_label: {
          type: "string",
          enum: ["will_be_declined", "high_risk", "borderline", "acceptable", "strong", "perfect"],
        },
        summary: {
          type: "string",
          description: "Two to three sentence executive summary of the entire underwriting review.",
        },
        recommended_mcc: {
          type: "object",
          properties: {
            code: { type: "string", description: "Recommended MCC code (e.g., 5999)" },
            description: { type: "string", description: "MCC description" },
            rationale: { type: "string", description: "Why this MCC is appropriate" },
          },
          required: ["code", "description", "rationale"],
          additionalProperties: false,
        },
        transaction_mix_assessment: {
          type: "string",
          description:
            "Assessment of whether the stated transaction mix is consistent with the business model and website.",
        },
        document_completeness: {
          type: "array",
          items: {
            type: "object",
            properties: {
              document: { type: "string" },
              status: { type: "string", enum: ["present", "missing", "unverified"] },
              note: { type: "string" },
            },
            required: ["document", "status"],
            additionalProperties: false,
          },
        },
        website_requirements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              requirement: { type: "string" },
              met: { type: "boolean" },
              detail: { type: "string" },
            },
            required: ["requirement", "met"],
            additionalProperties: false,
          },
        },
        classification_issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file_name: { type: "string" },
              issue: { type: "string" },
            },
            required: ["file_name", "issue"],
            additionalProperties: false,
          },
        },
        data_gaps: { type: "array", items: { type: "string" } },
        red_flags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              flag: { type: "string" },
              severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
              detail: { type: "string" },
            },
            required: ["flag", "severity"],
            additionalProperties: false,
          },
        },
        recommended_actions: { type: "array", items: { type: "string" } },
        risk_tier: {
          type: "string",
          enum: ["standard", "high_risk"],
          description: "Risk tier based on MCC code.",
        },
        ofac_screening: {
          type: "string",
          description: "Summary of OFAC/sanctions screening. 'Clear' if no matches, else describe flags.",
        },
        score: {
          type: "number",
          description: "Overall numerical score out of 100, sum of all score_breakdown categories.",
        },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        recommendation: {
          type: "string",
          enum: ["proceed", "proceed_with_conditions", "request_information", "escalate_to_risk", "decline"],
        },
        score_breakdown: {
          type: "array",
          description: "Per-category scoring breakdown summing to max 100.",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              max_score: { type: "number" },
              score: { type: "number" },
              note: { type: "string", description: "Brief justification with evidence label" },
            },
            required: ["category", "max_score", "score", "note"],
            additionalProperties: false,
          },
        },
        hard_stops: {
          type: "array",
          description: "Critical hard-stop findings that override scoring. Empty array if none.",
          items: { type: "string" },
        },
        public_checks_performed: {
          type: "array",
          items: {
            type: "object",
            properties: {
              check: { type: "string" },
              tool: { type: "string" },
              result: { type: "string", description: "Outcome or 'Not performed' with reason" },
            },
            required: ["check", "result"],
            additionalProperties: false,
          },
        },
        validity_conclusion: {
          type: "string",
          enum: ["likely_valid", "inconclusive", "likely_invalid"],
        },
        validity_justification: { type: "string" },
      },
      required: [
        "readiness_score", "summary", "recommended_mcc", "transaction_mix_assessment",
        "document_completeness", "red_flags", "recommended_actions", "risk_tier",
        "ofac_screening", "score", "confidence", "recommendation", "score_breakdown",
        "hard_stops", "public_checks_performed", "validity_conclusion", "validity_justification",
      ],
      additionalProperties: false,
    },
  },
} as const;
