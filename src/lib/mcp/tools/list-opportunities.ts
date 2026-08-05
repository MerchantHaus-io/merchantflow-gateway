import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { notAuthenticated, toError, toJson } from "./_result";

export default defineTool({
  name: "list_opportunities",
  title: "List opportunities",
  description:
    "List CRM pipeline opportunities visible to the signed-in user, optionally filtered by stage or assignee.",
  inputSchema: {
    stage: z.string().trim().min(1).optional().describe("Pipeline stage to filter by, e.g. 'discovery'."),
    assigned_to: z.string().trim().min(1).optional().describe("Assignee name or email to filter by."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stage, assigned_to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("opportunities")
      .select(
        "id, stage, status, service_type, assigned_to, outcome_status, created_at, stage_entered_at, accounts(name, website, city, state)",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);

    if (stage) query = query.eq("stage", stage);
    if (assigned_to) query = query.eq("assigned_to", assigned_to);

    const { data, error } = await query;
    if (error) return toError(error.message);
    return toJson({ count: data?.length ?? 0, opportunities: data ?? [] });
  },
});
