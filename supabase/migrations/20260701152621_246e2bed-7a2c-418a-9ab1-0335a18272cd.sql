
CREATE TABLE public.nmi_partner_residuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,
  nmi_merchant_id text NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  company_name text,
  gross_volume numeric(14,2) DEFAULT 0,
  transaction_count integer DEFAULT 0,
  interchange_cost numeric(14,2) DEFAULT 0,
  assessments numeric(14,2) DEFAULT 0,
  processor_fees numeric(14,2) DEFAULT 0,
  gateway_fees numeric(14,2) DEFAULT 0,
  partner_residual numeric(14,2) DEFAULT 0,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_month, nmi_merchant_id)
);

GRANT SELECT ON public.nmi_partner_residuals TO authenticated;
GRANT ALL ON public.nmi_partner_residuals TO service_role;

ALTER TABLE public.nmi_partner_residuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can read NMI partner residuals"
  ON public.nmi_partner_residuals
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_nmi_partner_residuals_touch
  BEFORE UPDATE ON public.nmi_partner_residuals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_nmi_partner_residuals_month ON public.nmi_partner_residuals(period_month DESC);
CREATE INDEX idx_nmi_partner_residuals_account ON public.nmi_partner_residuals(account_id);
CREATE INDEX idx_nmi_partner_residuals_mid ON public.nmi_partner_residuals(nmi_merchant_id);
