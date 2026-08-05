import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { notAuthenticated, toError, toJson } from "./_result";

export default defineTool({
  name: "list_tasks",
  title: "List tasks",
  description: "List team tasks, optionally filtered by status or assignee email.",
  inputSchema: {
    status: z.string().trim().min(1).optional().describe("Task status to filter by, e.g. 'open'."),
    assignee: z.string().trim().min(1).optional().describe("Assignee email to filter by."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, assignee, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    let builder = supabase
      .from("tasks")
      .select("id, title, description, status, priority, assignee, created_by, due_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);

    if (status) builder = builder.eq("status", status);
    if (assignee) builder = builder.eq("assignee", assignee);

    const { data, error } = await builder;
    if (error) return toError(error.message);
    return toJson({ count: data?.length ?? 0, tasks: data ?? [] });
  },
});
