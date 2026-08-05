import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { notAuthenticated, toError, toJson } from "./_result";

export default defineTool({
  name: "get_opportunity",
  title: "Get opportunity",
  description:
    "Fetch one pipeline opportunity by id, including its account and primary contact details.",
  inputSchema: {
    opportunity_id: z.string().uuid().describe("The opportunity's UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ opportunity_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const { data, error } = await supabase
      .from("opportunities")
      .select(
        "id, stage, status, service_type, pricing_plan, gateway_tier, assigned_to, source, referral_source, outcome_status, outcome_reason, created_at, stage_entered_at, accounts(id, name, website, city, state, country, commission_model), contacts(id, first_name, last_name, email, phone)",
      )
      .eq("id", opportunity_id)
      .maybeSingle();

    if (error) return toError(error.message);
    if (!data) return toError("No opportunity found with that id, or it is not visible to you.");
    return toJson(data);
  },
});
