-- Add extras_snapshot to quotes so the QuoteGenerator can persist the
-- ancillary/gateway/activation/platform pricing customizations alongside
-- the now-strictly-array lines_snapshot column.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS extras_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.quotes.extras_snapshot IS
  'JSON object of rep-customizable extras associated with the quote: ancillary fees, gateway fees, activation toggle/amount, platformCost, platformResale. lines_snapshot stays the array of line items.';