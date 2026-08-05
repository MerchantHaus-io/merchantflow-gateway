import type { ToolResult } from "@lovable.dev/mcp-js";

export function toJson(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function toError(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function notAuthenticated(): ToolResult {
  return toError("Not authenticated. Reconnect this integration and sign in again.");
}
