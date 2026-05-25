CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL UNIQUE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  tier_id text NOT NULL,
  tier_name text NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly','annual')),
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  monthly_cost numeric(12,2) NOT NULL DEFAULT 0,
  monthly_resale numeric(12,2) NOT NULL DEFAULT 0,
  monthly_margin numeric(12,2) NOT NULL DEFAULT 0,
  annual_resale numeric(12,2) NOT NULL DEFAULT 0,
  valid_until timestamptz,
  pdf_filename text,
  client_business_name text,
  client_contact_name text,
  client_email text,
  client_phone text,
  client_monthly_volume text,
  client_average_ticket text,
  client_notes text,
  sender_name text,
  sender_title text,
  sender_company text,
  sender_email text,
  sender_phone text,
  lines_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by_email text,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotes_opportunity_id ON public.quotes(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_quotes_account_id ON public.quotes(account_id);
CREATE INDEX IF NOT EXISTS idx_quotes_contact_id ON public.quotes(contact_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON public.quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_client_email ON public.quotes(lower(client_email));

CREATE OR REPLACE FUNCTION public.quotes_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    NEW.accepted_at := now();
  END IF;
  IF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    NEW.rejected_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_touch ON public.quotes;
CREATE TRIGGER trg_quotes_touch
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_touch();

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage quotes" ON public.quotes;
CREATE POLICY "Staff manage quotes"
  ON public.quotes FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL AND NOT public.is_referrer())
  WITH CHECK (auth.uid() IS NOT NULL AND NOT public.is_referrer());

COMMENT ON TABLE public.quotes IS 'Snapshot of every gateway quote sent to a merchant — pricing, line items, contact info — captured at send time for audit / re-render / acceptance tracking.';
COMMENT ON COLUMN public.quotes.lines_snapshot IS 'JSON array of EditableLine objects from the QuoteGeneratorDialog: id, label, cost, resale, perEvent, enabled, bundled.';
COMMENT ON COLUMN public.quotes.valid_until IS 'Quote expiry (default 30 days from sent_at per disclaimer). Not enforced; informational.';