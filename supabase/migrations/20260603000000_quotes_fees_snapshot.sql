-- Quote fee snapshot: persists the full fee picture so every surface agrees.
--
-- Background: the Quote Generator's dialog preview and the emailed PDF render
-- their fee schedule from live React state (add-on lines, core gateway fees,
-- ancillary fees, and an optional one-time activation fee). The public
-- /q/:token acceptance page, however, renders from the persisted quote row and
-- only ever had `lines_snapshot` (add-ons). That meant the binding sign-online
-- surface omitted the per-transaction fee, one-time/setup fees, and — when an
-- activation fee is charged — the Payment Instructions block.
--
-- This column captures everything not already in `lines_snapshot` so the
-- acceptance page can mirror the PDF exactly. `lines_snapshot` is left as-is
-- for backward compatibility with existing readers (AcceptedQuotesPanel).
--
-- Shape (all optional; absent on legacy rows):
--   {
--     "gatewayFees": [{ "id", "label", "description", "resale", "cadence" }],
--     "ancillary":   [{ "id", "label", "description", "amount", "cadence", "waived" }],
--     "activation":  { "label", "amount" } | null,
--     "oneTimeTotal": number
--   }
-- Note: receiving-bank details are NOT stored here — they live in env/config
-- and are read at render time. Only the fact + amount of the activation fee is
-- persisted, which is what gates the Payment Instructions block.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS fees_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.quotes.fees_snapshot IS
  'Full fee picture beyond lines_snapshot: core gateway fees, ancillary fees, optional activation fee, and one-time total. Lets the public acceptance page mirror the PDF. Bank details for the activation Payment Instructions are read from env/config, never stored here.';
