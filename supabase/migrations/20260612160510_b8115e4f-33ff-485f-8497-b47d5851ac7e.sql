
-- Sequence table: one counter per (doc_type, year)
CREATE TABLE public.billing_doc_sequences (
  doc_type text NOT NULL,
  year int NOT NULL,
  last_value int NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, year)
);

GRANT SELECT, INSERT, UPDATE ON public.billing_doc_sequences TO authenticated;
GRANT ALL ON public.billing_doc_sequences TO service_role;
ALTER TABLE public.billing_doc_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth team can read sequences" ON public.billing_doc_sequences
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.next_billing_doc_number(p_doc_type text, p_year int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next int;
  v_prefix text;
BEGIN
  IF p_doc_type NOT IN ('invoice','receipt') THEN
    RAISE EXCEPTION 'Invalid doc_type: %', p_doc_type;
  END IF;

  INSERT INTO public.billing_doc_sequences (doc_type, year, last_value)
  VALUES (p_doc_type, p_year, 1)
  ON CONFLICT (doc_type, year)
  DO UPDATE SET last_value = public.billing_doc_sequences.last_value + 1
  RETURNING last_value INTO v_next;

  v_prefix := CASE p_doc_type WHEN 'invoice' THEN 'INV' ELSE 'RCT' END;
  RETURN v_prefix || '-' || p_year::text || '-' || lpad(v_next::text, 5, '0');
END;
$$;

-- Main table
CREATE TABLE public.billing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,

  doc_type text NOT NULL CHECK (doc_type IN ('invoice','receipt')),
  doc_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','sent','paid','void')),

  issued_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Chicago')::date,
  due_date date,
  paid_date date,
  period_start date,
  period_end date,

  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,

  gateway_tier text,
  billing_cycle text CHECK (billing_cycle IN ('monthly','annual')),

  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ancillary_fees jsonb NOT NULL DEFAULT '[]'::jsonb,

  notes text,
  merchant_name text,
  merchant_email text,
  merchant_phone text,
  sender jsonb,

  pdf_path text,
  sent_at timestamptz,
  sent_to text[],

  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_documents_account_idx ON public.billing_documents(account_id, issued_date DESC);
CREATE INDEX billing_documents_type_status_idx ON public.billing_documents(doc_type, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_documents TO authenticated;
GRANT ALL ON public.billing_documents TO service_role;

ALTER TABLE public.billing_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth team can view billing docs" ON public.billing_documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth team can create billing docs" ON public.billing_documents
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth team can update billing docs" ON public.billing_documents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth team can delete billing docs" ON public.billing_documents
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER billing_documents_touch
BEFORE UPDATE ON public.billing_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
