
CREATE TABLE public.shared_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completed_by_email text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_todos TO authenticated;
GRANT ALL ON public.shared_todos TO service_role;

ALTER TABLE public.shared_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view todos" ON public.shared_todos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert todos" ON public.shared_todos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update todos" ON public.shared_todos
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete todos" ON public.shared_todos
  FOR DELETE TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_todos;

INSERT INTO public.shared_todos (title, created_by_email) VALUES
  ('Complete TFX.tax forms and payment', 'system@merchanthaus.io'),
  ('Complete Chargeback 911 sign up', 'system@merchanthaus.io'),
  ('Complete Persona sign up', 'system@merchanthaus.io'),
  ('Quote Turnkey corrections', 'system@merchanthaus.io'),
  ('Apply Tax auto-calculator to CRM Auto Biller', 'system@merchanthaus.io'),
  ('Refine Auto Biller on OPS terminal', 'system@merchanthaus.io'),
  ('Open Wyoming LLC & transfer MH ownership', 'system@merchanthaus.io'),
  ('Quote Improv learning', 'system@merchanthaus.io'),
  ('Process 8 existing gateway apps', 'system@merchanthaus.io');
