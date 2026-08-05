import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { notAuthenticated, toError, toJson } from "./_result";

export default defineTool({
  name: "create_task",
  title: "Create task",
  description: "Create a task in the Ops Terminal, assigned to a team member by email.",
  inputSchema: {
    title: z.string().trim().min(1).max(200).describe("Short task title."),
    description: z.string().trim().max(2000).optional().describe("Optional task detail."),
    assignee: z.string().trim().email().optional().describe("Assignee email address."),
    priority: z.enum(["low", "medium", "high"]).optional().describe("Task priority (default medium)."),
    due_at: z.string().trim().optional().describe("Optional ISO 8601 due date/time."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ title, description, assignee, priority, due_at }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title,
        description: description ?? null,
        assignee: assignee ?? null,
        priority: priority ?? "medium",
        due_at: due_at ?? null,
        status: "open",
        created_by: ctx.getUserEmail() ?? null,
        source: "mcp",
      })
      .select()
      .maybeSingle();

    if (error) return toError(error.message);
    return toJson({ created: data });
  },
});
