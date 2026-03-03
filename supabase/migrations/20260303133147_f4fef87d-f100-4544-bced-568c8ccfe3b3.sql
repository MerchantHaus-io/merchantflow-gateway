
CREATE TABLE public.audit_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date date NOT NULL DEFAULT CURRENT_DATE,
  prompt text NOT NULL DEFAULT '',
  item_id text NOT NULL,
  type text NOT NULL DEFAULT 'bug',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  expected_outcome text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  resolved_at timestamp with time zone,
  resolved_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit entries"
  ON public.audit_entries FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can create audit entries"
  ON public.audit_entries FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_email());

CREATE POLICY "Admins can update audit entries"
  ON public.audit_entries FOR UPDATE
  TO authenticated
  USING (is_admin_email());

CREATE POLICY "Admins can delete audit entries"
  ON public.audit_entries FOR DELETE
  TO authenticated
  USING (is_admin_email());
