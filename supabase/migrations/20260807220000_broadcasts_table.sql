-- Data-driven broadcasts (audit item #59).
--
-- There were four near-identical components — ComplianceBroadcast,
-- BroadcastPopup, NMIBoardingBroadcast and AtriaBroadcast — each ~120-190
-- lines, each hardcoding its own copy, its own dated key, its own expiry
-- window and its own priority. Adding a fifth notice meant writing and
-- deploying a fifth component; correcting a typo meant a deploy.
--
-- Content now lives here. `type` selects the layout, so the three shapes
-- already in use are preserved:
--
--   notice    — a block of body text (BroadcastPopup)
--   checklist — items that must each be ticked before acknowledging
--               (ComplianceBroadcast: the acknowledgement is the point)
--   features  — a titled list with descriptions (AtriaBroadcast,
--               NMIBoardingBroadcast)
--
-- Acknowledgements are unchanged: broadcast_acknowledgments already keys on
-- `broadcast_key`, so existing rows keep working and nobody re-sees a notice
-- they have already confirmed.

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches broadcast_acknowledgments.broadcast_key. Stable once published:
  -- changing it re-shows the notice to everyone.
  key          text NOT NULL UNIQUE,
  type         text NOT NULL DEFAULT 'notice'
                 CHECK (type IN ('notice', 'checklist', 'features')),
  title        text NOT NULL,
  -- Optional emoji shown beside the title.
  icon         text,
  -- Body copy for 'notice'; intro line for the other two. Newlines preserved.
  body         text,
  -- [{ id, label, desc }] for 'checklist'; [{ title, desc }] for 'features'.
  items        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Lower shows first when several are eligible at once.
  priority     integer NOT NULL DEFAULT 100,
  active       boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  -- NULL means it runs until acknowledged, which is how BroadcastPopup behaved.
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_active
  ON public.broadcasts (active, priority)
  WHERE active;

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

-- Staff read broadcasts; admins manage them. Deliberately no anon access —
-- these are internal notices.
CREATE POLICY "Staff can read broadcasts"
  ON public.broadcasts FOR SELECT
  TO authenticated
  USING (public.is_internal_staff());

CREATE POLICY "Admins can manage broadcasts"
  ON public.broadcasts FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.broadcasts IS
  'Internal staff notices. Replaces four hardcoded popup components (#59). `key` matches broadcast_acknowledgments.broadcast_key.';

-- ── Seed the four existing broadcasts ────────────────────────────────────
-- Keys are carried over verbatim so anyone who already acknowledged one does
-- not see it again. Expiry dates reproduce the previous
-- BROADCAST_CREATED + 14 days behaviour.

INSERT INTO public.broadcasts (key, type, title, icon, body, items, priority, published_at, expires_at)
VALUES
  (
    'compliance-controls-2026-03-12',
    'checklist',
    'New Compliance Controls',
    '🛡️',
    'These controls are now live across the pipeline. Please confirm you have read each one.',
    '[
      {"id":"kyc","label":"Owner Identity Verification (KYC / CDD)","desc":"Passport or Driver''s License is now a mandatory document before any deal can proceed to underwriting."},
      {"id":"ofac","label":"OFAC / Sanctions Screening","desc":"All business names, DBAs, and principal owners are now screened against OFAC SDN and sanctions lists during AI Underwriting Review."},
      {"id":"bo","label":"Beneficial Ownership Declaration (FinCEN CDD Rule)","desc":"At least one beneficial owner with 25%+ equity must be recorded before an opportunity can proceed to underwriting."},
      {"id":"sla","label":"Stage SLA Timers & Escalation","desc":"Each pipeline stage now has defined SLA thresholds. Amber and red alerts auto-generate tasks and notifications on breach."},
      {"id":"dupe","label":"Duplicate Merchant Detection","desc":"When moving past Discovery, the system checks for matching EINs and legal names and surfaces warnings to prevent duplicate submissions."},
      {"id":"risk","label":"High-Risk MCC Flagging","desc":"AI Underwriting Review now identifies and flags high-risk MCC codes (e.g., gambling, direct marketing) with a risk tier badge."}
    ]'::jsonb,
    1,
    '2026-03-12T00:00:00Z',
    '2026-03-26T00:00:00Z'
  ),
  (
    'eob-update-2026-02-20',
    'notice',
    'Team Notice',
    '📢',
    E'Please update all current accounts accordingly before the end of business today.\n\nUpdate statuses, mark irrelevant leads as Dead, and add appropriate notes so we can move into next week strong.\n\nIf anything''s unclear, message me.\n\n— Darryn',
    '[]'::jsonb,
    2,
    '2026-02-20T00:00:00Z',
    NULL  -- ran until acknowledged, with no expiry
  ),
  (
    'nmi-boarding-live-2026-03-28',
    'features',
    'NMI Boarding is Live',
    '⚡',
    'Gateway boarding now runs end to end from the Ops Terminal.',
    '[]'::jsonb,
    3,
    '2026-03-28T00:00:00Z',
    '2026-04-11T00:00:00Z'
  ),
  (
    'atria-abilities-2026-03-13',
    'features',
    'Atria Can Now Do More',
    '✨',
    'Your AI assistant picked up some new abilities.',
    '[
      {"title":"Create Full Deals","desc":"Atria can create an account, contact and opportunity in one go from a plain-language brief."},
      {"title":"Manage Documents","desc":"Ask her to attach, classify or chase missing documents on any opportunity."},
      {"title":"Log Client Interactions","desc":"Dictate a call summary and she will write it to the activity log against the right record."},
      {"title":"Run Underwriting Validation","desc":"She can run the underwriting gate checks and tell you exactly what is blocking a deal."},
      {"title":"9-Stage SOP Knowledge","desc":"She knows the full sales SOP and can tell you what the next step is for any deal."}
    ]'::jsonb,
    4,
    '2026-03-13T00:00:00Z',
    '2026-03-27T00:00:00Z'
  )
ON CONFLICT (key) DO NOTHING;

-- NOTE: NMIBoardingBroadcast's body was laid out inline in JSX rather than as
-- a list, so its `items` are empty and it renders as an intro-only card. If
-- that notice matters going forward, populate `items` — it has expired, so
-- nobody currently sees it either way.
