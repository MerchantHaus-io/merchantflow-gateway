
CREATE TABLE public.mcp_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name text NOT NULL,
  args jsonb,
  result_summary text,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_audit_log_created_at ON public.mcp_audit_log (created_at DESC);
CREATE INDEX idx_mcp_audit_log_tool_name ON public.mcp_audit_log (tool_name);

ALTER TABLE public.mcp_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view MCP audit log"
  ON public.mcp_audit_log
  FOR SELECT
  USING (public.is_admin_email());
