
CREATE TABLE public.client_interactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  interaction_type text NOT NULL DEFAULT 'note',
  subject text NOT NULL,
  notes text,
  created_by uuid,
  created_by_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.client_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view client interactions"
  ON public.client_interactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create client interactions"
  ON public.client_interactions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete client interactions"
  ON public.client_interactions FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_client_interactions_account_id ON public.client_interactions(account_id);
CREATE INDEX idx_client_interactions_created_at ON public.client_interactions(created_at DESC);
