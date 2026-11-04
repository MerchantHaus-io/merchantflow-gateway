-- Quote void + support spam / blocked domains.
--
-- MIGRATION-ONLY. No client or edge-function changes ride with this file; the
-- consumers that live outside the database are listed in the PR for the next
-- session.
--
-- Part A — quotes can be voided (never deleted: quote_acceptances.quote_id is
--          ON DELETE CASCADE, so deleting an accepted quote destroys the signed
--          audit row). Voiding an accepted quote stops everything downstream of
--          it, partner earnings included.
-- Part B — support tickets can be marked spam (retained, out of the queue), and
--          domains can be blocked: new mail from a blocked domain lands as spam,
--          and blocking a domain moves its open/in-progress tickets to spam.
--
-- Verified against production (SELECT-only, 4 Nov 2026) before writing:
--   quotes_status_check           = draft/sent/accepted/rejected/expired
--   support_tickets_status_check  = open/in_progress/closed
--   referrer_ledger_status_chk    = pending/payable/paid/void  ('void' already allowed)
--   build_referrer_ledger()       = the 20260906204923 definition (start_months CTE)
--   quote_acceptance_summary      = no reloptions (i.e. NOT security_invoker)
--   referrer_commission_records   = security_invoker=true
--   policies "Staff manage quotes" / "Staff manage support tickets"
--                                 = is_internal_staff() AND tenant_visible(tenant_id)
--   support_blocked_domains       = does not exist

-- ═══════════════════════════════════════════════════════════════════════════
-- PART A — QUOTE VOID
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A1. Columns + status ────────────────────────────────────────────────────
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS voided_at       timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_by_email text;

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft','sent','accepted','rejected','expired','void'));

-- voided_at is present exactly when the quote is void.
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_void_stamp_check;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_void_stamp_check
  CHECK ((status = 'void') = (voided_at IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_quotes_account_void
  ON public.quotes(account_id)
  WHERE status = 'void';

COMMENT ON COLUMN public.quotes.voided_at IS
  'When the quote was voided. Set by trg_quotes_void_guard; non-null iff status = ''void''. Void is terminal.';
COMMENT ON COLUMN public.quotes.voided_by IS
  'auth.users id of the staff member who voided the quote (the caller''s auth.uid(); a value passed by a service-role caller is used only when there is no auth.uid()).';
COMMENT ON COLUMN public.quotes.voided_by_email IS
  'Email of whoever voided the quote, captured at void time.';

-- ── A2. Void guard: stamp, keep terminal, refuse void-on-insert ─────────────
-- Kept separate from quotes_touch() so that function stays as it is. Trigger
-- names fire alphabetically: trg_quotes_touch, then trg_quotes_void_guard.
CREATE OR REPLACE FUNCTION public.quotes_void_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'void' THEN
      RAISE EXCEPTION 'quote_void_on_insert: a quote cannot be created void'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.voided_at := NULL;
    NEW.voided_by := NULL;
    NEW.voided_by_email := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status = 'void' THEN
    IF NEW.status IS DISTINCT FROM 'void' THEN
      RAISE EXCEPTION 'quote_void_terminal: quote % is void and cannot change status', OLD.quote_number
        USING ERRCODE = 'check_violation';
    END IF;
    -- The void stamp is not rewritable.
    NEW.voided_at := OLD.voided_at;
    NEW.voided_by := OLD.voided_by;
    NEW.voided_by_email := OLD.voided_by_email;
  ELSIF NEW.status = 'void' THEN
    NEW.voided_at := now();
    NEW.voided_by := COALESCE(auth.uid(), NEW.voided_by);
    NEW.voided_by_email := COALESCE(auth.jwt() ->> 'email', NEW.voided_by_email);
  ELSE
    NEW.voided_at := NULL;
    NEW.voided_by := NULL;
    NEW.voided_by_email := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_void_guard ON public.quotes;
CREATE TRIGGER trg_quotes_void_guard
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_void_guard();

-- ── A3. A void quote cannot be (re-)accepted ────────────────────────────────
-- accept-quote runs as service role, so RLS does not stop it. It inserts the
-- acceptance row BEFORE flipping status, so the guard has to sit on the insert,
-- not only on the status change (A2 already refuses void -> accepted).
-- Existing quote_acceptances rows are not touched.
CREATE OR REPLACE FUNCTION public.quote_acceptances_refuse_void()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = NEW.quote_id AND q.status = 'void') THEN
    RAISE EXCEPTION 'quote_void: cannot record an acceptance against a void quote'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_acceptances_refuse_void ON public.quote_acceptances;
CREATE TRIGGER trg_quote_acceptances_refuse_void
  BEFORE INSERT ON public.quote_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.quote_acceptances_refuse_void();

-- ── A4. One definition of "this account's downstream is stopped" ────────────
-- Returns the first month in which nothing should accrue for the account, or
-- NULL when the account is live. An account is stopped when it has a quote that
-- was accepted and is now void AND it has no quote currently accepted (a fresh
-- acceptance re-starts it). Cut-off = the month of the latest such void.
--
-- Accounts that never had a quote return NULL — that is deliberate: two of the
-- three referred merchants have neither an invoice nor an accepted quote and
-- must keep earning (CLAUDE.md "Affiliate programme basis").
--
-- SECURITY DEFINER because referrer_commission_records is security_invoker and
-- its readers (partners) cannot read quotes; without it the filter would
-- silently return NULL for them and not bite. It returns only a month.
CREATE OR REPLACE FUNCTION public.account_downstream_void_month(_account_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _account_id IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM public.quotes q
                  WHERE q.account_id = _account_id AND q.status = 'accepted') THEN NULL
    ELSE (SELECT date_trunc('month', MAX(q.voided_at))::date
            FROM public.quotes q
           WHERE q.account_id = _account_id
             AND q.status = 'void'
             AND (q.accepted_at IS NOT NULL
                  OR EXISTS (SELECT 1 FROM public.quote_acceptances qa WHERE qa.quote_id = q.id)))
  END
$$;

REVOKE ALL ON FUNCTION public.account_downstream_void_month(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_downstream_void_month(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.account_downstream_void_month(uuid) IS
  'First month from which nothing accrues for an account because its accepted quote was voided (and no other quote is accepted). NULL = live. Used by build_referrer_ledger(), referrer_commission_records and the void trigger.';

-- ── A5. Voiding stops partner earnings already queued ───────────────────────
-- Unpaid commission entries for the cut-off month onward are set to 'void'
-- (an existing ledger status). Paid entries, entries in a payout run, and
-- months before the void are left alone. Months already earned before the void
-- are real gateway months and stay payable.
CREATE OR REPLACE FUNCTION public.quotes_void_stop_downstream()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff date;
BEGIN
  IF NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_cutoff := public.account_downstream_void_month(NEW.account_id);
  IF v_cutoff IS NULL THEN
    RETURN NEW;   -- another quote is still accepted, or this one was never accepted
  END IF;

  UPDATE public.referrer_ledger_entries e
     SET status = 'void',
         updated_at = now()
   WHERE e.account_id = NEW.account_id
     AND e.entry_type = 'commission'
     AND e.status IN ('pending', 'payable')
     AND e.payout_run_id IS NULL
     AND e.paid_at IS NULL
     AND e.period_start >= v_cutoff;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_void_stop_downstream ON public.quotes;
CREATE TRIGGER trg_quotes_void_stop_downstream
  AFTER UPDATE OF status ON public.quotes
  FOR EACH ROW
  WHEN (NEW.status = 'void' AND OLD.status IS DISTINCT FROM 'void')
  EXECUTE FUNCTION public.quotes_void_stop_downstream();

-- ── A6. build_referrer_ledger(): ignore void quotes, stop at the void month ─
-- Identical to 20260906204923 except the two lines marked "void". The
-- accepted-quote start-month fallback already reads status = 'accepted' only,
-- so a void quote never supplies a start month; the cut-off additionally stops
-- the commission_records fallback from carrying a voided account on.
CREATE OR REPLACE FUNCTION public.build_referrer_ledger()
RETURNS TABLE (inserted integer, promoted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_promoted integer := 0;
BEGIN
  IF NOT (public.is_internal_staff() OR public.is_admin() OR public.is_admin_email()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  WITH start_months AS (
    SELECT
      a.id AS account_id,
      COALESCE(
        (SELECT date_trunc('month', MIN(bd.issued_date))::date
           FROM public.billing_documents bd
          WHERE bd.account_id = a.id
            AND bd.doc_type = 'invoice'),
        (SELECT date_trunc('month', COALESCE(q.accepted_at, q.created_at))::date
           FROM public.quotes q
          WHERE q.account_id = a.id
            AND q.status = 'accepted'
          ORDER BY q.accepted_at DESC NULLS LAST, q.created_at DESC
          LIMIT 1),
        (SELECT MIN(cp.period_start)
           FROM public.commission_records cr2
           JOIN public.commission_periods cp ON cp.id = cr2.period_id
          WHERE cr2.account_id = a.id)
      ) AS start_month,
      public.account_downstream_void_month(a.id) AS void_month          -- void
    FROM public.accounts a
    WHERE a.referrer_id IS NOT NULL
  ), months AS (
    SELECT
      a.id                       AS account_id,
      a.name                     AS company_name,
      a.referrer_id,
      r.commission_rate,
      r.monthly_cap_per_merchant,
      cp.period_start,
      cp.period_end,
      public.gateway_net(cr.transaction_count) AS net_margin
    FROM public.commission_records cr
    JOIN public.commission_periods cp ON cp.id = cr.period_id
    JOIN public.accounts a ON a.id = cr.account_id
    JOIN public.referrers r ON r.id = a.referrer_id
    JOIN start_months sm ON sm.account_id = a.id
    WHERE a.referrer_id IS NOT NULL
      AND r.active
      AND COALESCE(r.attribution_only, false) = false
      AND r.commission_rate > 0
      AND cp.period_start < date_trunc('month', CURRENT_DATE)::date
      AND sm.start_month IS NOT NULL
      AND cp.period_start >= sm.start_month
      AND (sm.void_month IS NULL OR cp.period_start < sm.void_month)     -- void
  ), priced AS (
    SELECT
      m.*,
      public.partner_share(m.net_margin, m.commission_rate, m.monthly_cap_per_merchant) AS amount
    FROM months m
  ), ins AS (
    INSERT INTO public.referrer_ledger_entries
      (referrer_id, entry_type, amount, period_start, period_end, account_id, description)
    SELECT p.referrer_id, 'commission', p.amount, p.period_start, p.period_end, p.account_id,
           'Gateway referral commission — ' || COALESCE(p.company_name, 'merchant')
      FROM priced p
     WHERE p.amount > 0
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM ins;

  WITH promo AS (
    UPDATE public.referrer_ledger_entries
       SET status = 'payable'
     WHERE status = 'pending'
       AND payable_on IS NOT NULL
       AND payable_on <= CURRENT_DATE
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_promoted FROM promo;

  RETURN QUERY SELECT v_inserted, v_promoted;
END;
$$;

REVOKE ALL ON FUNCTION public.build_referrer_ledger() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.build_referrer_ledger() TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_referrer_ledger() TO service_role;

COMMENT ON FUNCTION public.build_referrer_ledger() IS
  'Builds/backdates monthly gateway-only partner commission entries: each month gateway net (billed less our cost, via public.gateway_net) times the partner rate, capped per merchant per month, from the month of the merchant first gateway invoice onwards, and stopping at the month its accepted quote was voided (public.account_downstream_void_month). Promotes matured entries to payable. Idempotent.';

-- ── A7. referrer_commission_records: hide months after a void ───────────────
-- Same columns, same order; WHERE added. security_invoker restated explicitly
-- so the replace cannot drop it.
CREATE OR REPLACE VIEW public.referrer_commission_records
WITH (security_invoker = true) AS
SELECT
  cr.id AS record_id,
  cr.period_id,
  cp.period_start,
  cp.period_end,
  cr.account_id,
  cr.company_name,
  cr.transaction_volume,
  cr.transaction_count,
  cr.total_commission AS processing_residual,
  cr.gateway_invoiced,
  cr.gateway_margin,
  cr.gateway_margin AS company_commission,
  a.referrer_id,
  r.commission_rate,
  r.monthly_cap_per_merchant,
  (cr.gateway_margin * r.commission_rate) AS uncapped_payout,
  CASE
    WHEN r.monthly_cap_per_merchant > 0::numeric
      THEN LEAST(cr.gateway_margin * r.commission_rate, r.monthly_cap_per_merchant)
    ELSE cr.gateway_margin * r.commission_rate
  END AS payout,
  CASE
    WHEN r.monthly_cap_per_merchant > 0::numeric
     AND (cr.gateway_margin * r.commission_rate) > r.monthly_cap_per_merchant
      THEN true
    ELSE false
  END AS at_cap
FROM public.commission_records cr
JOIN public.accounts a ON a.id = cr.account_id
JOIN public.referrers r ON r.id = a.referrer_id
JOIN public.commission_periods cp ON cp.id = cr.period_id
WHERE public.account_downstream_void_month(cr.account_id) IS NULL
   OR cp.period_start < public.account_downstream_void_month(cr.account_id);

GRANT SELECT ON public.referrer_commission_records TO authenticated;
GRANT SELECT ON public.referrer_commission_records TO service_role;

-- ── A8. quote_acceptance_summary: expose the void, and stop bypassing RLS ───
-- New columns appended at the end (CREATE OR REPLACE VIEW only allows that).
-- The live view has no security_invoker, so it ran as its owner and returned
-- every quote + signatory to any authenticated user, partners included,
-- regardless of the "Staff manage quotes" policy. Making it security_invoker
-- puts it back under that policy. This only narrows access.
CREATE OR REPLACE VIEW public.quote_acceptance_summary
WITH (security_invoker = true) AS
SELECT
  q.id                                  AS quote_id,
  q.quote_number,
  q.status,
  q.client_business_name,
  q.sender_email,
  q.opportunity_id,
  q.account_id,
  q.contact_id,
  a.id                                  AS acceptance_id,
  a.signatory_name,
  a.signatory_title,
  a.signatory_email,
  a.accepted_at,
  a.ach_authorized,
  a.terms_version,
  a.ip_address,
  a.fee_schedule_hash,
  q.voided_at,
  q.voided_by_email,
  (q.status = 'void')                   AS is_void
FROM public.quotes q
LEFT JOIN LATERAL (
  SELECT *
  FROM public.quote_acceptances qa
  WHERE qa.quote_id = q.id
  ORDER BY qa.accepted_at DESC
  LIMIT 1
) a ON true;

COMMENT ON VIEW public.quote_acceptance_summary IS
  'One row per quote with the latest acceptance (if any) joined. A void quote keeps its acceptance (the signed audit row) but is_void = true: it must not offer Generate Contract. security_invoker — follows the quotes / quote_acceptances RLS.';

GRANT SELECT ON public.quote_acceptance_summary TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART B — SUPPORT SPAM + BLOCKED DOMAINS
-- ═══════════════════════════════════════════════════════════════════════════

-- ── B1. 'spam' status + audit stamps ────────────────────────────────────────
-- Status, not a flag: the queue is "not closed, not archived". A flag would be
-- a second axis every queue query, count and MCP tool must remember to filter,
-- and an open ticket that is also flagged would still read as open. A status
-- cannot be open and spam at once. archive_stale_closed_tickets() touches only
-- status = 'closed', so spam is never auto-archived: it is retained, as asked.
-- The stamps record who/when/why; they are not a parallel state (the CHECK ties
-- them to the status).
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS spam_marked_at       timestamptz,
  ADD COLUMN IF NOT EXISTS spam_marked_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS spam_marked_by_email text,
  ADD COLUMN IF NOT EXISTS spam_reason          text;

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN ('open','in_progress','closed','spam'));

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_spam_reason_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_spam_reason_check
  CHECK (spam_reason IS NULL OR spam_reason IN ('manual','blocked_domain'));

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_spam_stamp_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_spam_stamp_check
  CHECK ((status = 'spam') = (spam_marked_at IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_support_tickets_spam
  ON public.support_tickets(spam_marked_at DESC)
  WHERE status = 'spam';

COMMENT ON COLUMN public.support_tickets.spam_marked_at IS
  'When the ticket was moved to status ''spam''. Non-null iff status = ''spam''; cleared when it is restored.';
COMMENT ON COLUMN public.support_tickets.spam_reason IS
  '''manual'' (staff marked it) or ''blocked_domain'' (requester domain is in support_blocked_domains).';

-- ── B2. Blocked domains ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_blocked_domains (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain           text NOT NULL UNIQUE,
  created_by       uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text DEFAULT (auth.jwt() ->> 'email'),
  created_at       timestamptz NOT NULL DEFAULT now(),
  tenant_id        uuid,
  CONSTRAINT support_blocked_domains_domain_format CHECK (
    domain = lower(domain)
    AND domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  )
);

COMMENT ON TABLE public.support_blocked_domains IS
  'Sender domains whose support mail is spam. Blocking a domain also blocks its subdomains, moves open/in-progress tickets from it to spam, and makes new tickets from it arrive as spam.';
COMMENT ON COLUMN public.support_blocked_domains.domain IS
  'Bare lower-case domain, e.g. example.com. Normalised on write: trimmed, lower-cased, a pasted address or leading @ / *. is reduced to the domain.';

-- Normalise before the CHECK sees it.
CREATE OR REPLACE FUNCTION public.support_blocked_domains_normalise()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.domain := lower(btrim(NEW.domain));
  IF position('@' IN NEW.domain) > 0 THEN
    NEW.domain := COALESCE(public.support_email_domain(NEW.domain), NEW.domain);
  END IF;
  NEW.domain := regexp_replace(NEW.domain, '^(\*\.)+', '');
  NEW.domain := rtrim(NEW.domain, '.');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_blocked_domains_normalise ON public.support_blocked_domains;
CREATE TRIGGER trg_support_blocked_domains_normalise
  BEFORE INSERT OR UPDATE OF domain ON public.support_blocked_domains
  FOR EACH ROW EXECUTE FUNCTION public.support_blocked_domains_normalise();

DROP TRIGGER IF EXISTS set_tenant_id_support_blocked_domains ON public.support_blocked_domains;
CREATE TRIGGER set_tenant_id_support_blocked_domains
  BEFORE INSERT ON public.support_blocked_domains
  FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default();

DROP TRIGGER IF EXISTS trg_backup_enqueue ON public.support_blocked_domains;
CREATE TRIGGER trg_backup_enqueue
  AFTER INSERT OR DELETE OR UPDATE ON public.support_blocked_domains
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_backup_change();

-- RLS: mirrors "Staff manage support tickets".
ALTER TABLE public.support_blocked_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage support blocked domains" ON public.support_blocked_domains;
CREATE POLICY "Staff manage support blocked domains"
  ON public.support_blocked_domains FOR ALL
  TO authenticated
  USING (public.is_internal_staff() AND public.tenant_visible(tenant_id))
  WITH CHECK (public.is_internal_staff() AND public.tenant_visible(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_blocked_domains TO authenticated;
GRANT ALL ON public.support_blocked_domains TO service_role;

-- ── B3. Domain helpers ──────────────────────────────────────────────────────
-- Extracts the domain from a bare address or a From header ("Name <a@b.com>").
CREATE OR REPLACE FUNCTION public.support_email_domain(_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(rtrim(lower(substring(_email FROM '@([^@[:space:]<>,;"]+)')), '.'), '')
$$;

COMMENT ON FUNCTION public.support_email_domain(text) IS
  'Lower-case domain of an email address or From header; NULL if none.';

-- STABLE (reads a table). SECURITY DEFINER so it answers the same for the
-- service-role edge functions and for an RLS-scoped caller. Exact domain or
-- any subdomain of it matches.
CREATE OR REPLACE FUNCTION public.is_blocked_support_domain(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT EXISTS (
      SELECT 1
        FROM public.support_blocked_domains b
       WHERE d.dom = b.domain
          OR right(d.dom, length(b.domain) + 1) = '.' || b.domain
    )
    FROM (SELECT public.support_email_domain(_email) AS dom) d
    WHERE d.dom IS NOT NULL
  ), false)
$$;

REVOKE ALL ON FUNCTION public.is_blocked_support_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_support_domain(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_blocked_support_domain(text) IS
  'True when the sender''s domain (or a parent domain) is in support_blocked_domains. Accepts a bare address or a From header.';

-- ── B4. Spam stamps ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_tickets_spam_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'spam' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'spam' THEN
      NEW.spam_marked_at := now();
      NEW.spam_marked_by := COALESCE(auth.uid(), NEW.spam_marked_by);
      NEW.spam_marked_by_email := COALESCE(auth.jwt() ->> 'email', NEW.spam_marked_by_email);
      NEW.spam_reason := COALESCE(NEW.spam_reason, 'manual');
    ELSE
      NEW.spam_marked_at := OLD.spam_marked_at;
      NEW.spam_marked_by := OLD.spam_marked_by;
      NEW.spam_marked_by_email := OLD.spam_marked_by_email;
      NEW.spam_reason := OLD.spam_reason;
    END IF;
  ELSE
    NEW.spam_marked_at := NULL;
    NEW.spam_marked_by := NULL;
    NEW.spam_marked_by_email := NULL;
    NEW.spam_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ── B5. New mail from a blocked domain arrives as spam ──────────────────────
-- BEFORE INSERT, so all three intake paths (support-inbound-email,
-- gmail-poll-support, submit-support-ticket) are covered without touching them;
-- each inserts status 'open'. A ticket staff create by hand (source 'manual')
-- is left alone: that is a deliberate act.
CREATE OR REPLACE FUNCTION public.support_tickets_autospam()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('open', 'in_progress')
     AND COALESCE(NEW.source, '') <> 'manual'
     AND public.is_blocked_support_domain(NEW.requester_email) THEN
    NEW.status := 'spam';
    NEW.spam_reason := 'blocked_domain';
  END IF;
  RETURN NEW;
END;
$$;

-- Fire order is alphabetical: autospam, then spam_stamp.
DROP TRIGGER IF EXISTS trg_support_tickets_autospam ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_autospam
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_autospam();

DROP TRIGGER IF EXISTS trg_support_tickets_spam_stamp ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_spam_stamp
  BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_spam_stamp();

-- ── B6. Blocking a domain spams its open / in-progress tickets ──────────────
-- A trigger rather than an RPC: RLS already lets staff INSERT into
-- support_blocked_domains directly, so an RPC would leave a path (the table
-- itself, the MCP, SQL) that blocks a domain without spamming its tickets. The
-- trigger makes the two one atomic act whatever the path.
-- SECURITY INVOKER on purpose: the UPDATE runs under the caller's
-- "Staff manage support tickets" policy, so it reaches only tickets in the
-- caller's tenant. Closed tickets are left as they are.
CREATE OR REPLACE FUNCTION public.support_blocked_domains_spam_existing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets t
     SET status = 'spam',
         spam_reason = 'blocked_domain'
   WHERE t.status IN ('open', 'in_progress')
     AND (public.support_email_domain(t.requester_email) = NEW.domain
          OR right(public.support_email_domain(t.requester_email), length(NEW.domain) + 1) = '.' || NEW.domain);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_blocked_domains_spam_existing ON public.support_blocked_domains;
CREATE TRIGGER trg_support_blocked_domains_spam_existing
  AFTER INSERT OR UPDATE OF domain ON public.support_blocked_domains
  FOR EACH ROW EXECUTE FUNCTION public.support_blocked_domains_spam_existing();
