ALTER TABLE public.scoping_submissions
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scoping_submissions_opportunity_id ON public.scoping_submissions(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_scoping_submissions_account_id ON public.scoping_submissions(account_id);
CREATE INDEX IF NOT EXISTS idx_scoping_submissions_contact_id ON public.scoping_submissions(contact_id);
CREATE INDEX IF NOT EXISTS idx_scoping_submissions_assigned_to ON public.scoping_submissions(assigned_to);
CREATE INDEX IF NOT EXISTS idx_scoping_submissions_first_response_at ON public.scoping_submissions(first_response_at);