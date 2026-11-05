-- Auto-add support requesters to contacts.
--
-- MIGRATION-ONLY. Depends on 20261104120000_quote_void_and_support_spam.sql
-- (status 'spam', public.is_blocked_support_domain(), public.support_email_domain()).
-- The guard below refuses to run without it.
--
-- Every new support ticket links its requester to a contact (and that contact's
-- account), creating them when needed — with safeguards so bulk mail, spam and
-- staff never become CRM records. No backfill here: the owner wants spam
-- domains blocked first. A deliberate, run-later backfill block is in the PR.
--
-- Verified against production (SELECT-only, 5 Nov 2026):
--   accounts NOT NULL without default: name only (tenant_id defaults to
--     default_tenant_id(); status defaults 'active', CHECK active/dead)
--   contacts NOT NULL without default: account_id (FK accounts ON DELETE CASCADE)
--   no unique index on contacts.email; 5 emails already appear twice
--     (case-insensitive), so a match picks the oldest contact
--   support_tickets.contact_id / account_id FKs are ON DELETE SET NULL
--   BEFORE INSERT triggers on support_tickets fire alphabetically:
--     set_tenant_id_support_tickets, trg_support_tickets_autospam (#134),
--     trg_support_tickets_link_requester (this file),
--     trg_support_tickets_set_number, trg_support_tickets_spam_stamp (#134)
--   so the tenant is set and auto-spam has run before this trigger looks.
--   some staff/admin users sign in with gmail.com addresses, so "internal" is
--   merchanthaus.io OR any staff/admin user's own address.

DO $$
BEGIN
  IF to_regprocedure('public.is_blocked_support_domain(text)') IS NULL
     OR to_regprocedure('public.support_email_domain(text)') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261104120000_quote_void_and_support_spam.sql first: it creates is_blocked_support_domain(), support_email_domain() and the spam status this migration relies on.';
  END IF;
END $$;

-- ── 1. Pure helpers ─────────────────────────────────────────────────────────

-- Bare, lower-case address from an address or a From header ("Name <a@b.com>").
CREATE OR REPLACE FUNCTION public.support_email_address(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(rtrim(lower(substring(_raw FROM '([^<>[:space:]",;@]+@[^<>[:space:]",;@]+)')), '.'), '')
$$;

COMMENT ON FUNCTION public.support_email_address(text) IS
  'Lower-case bare email address from an address or From header; NULL if none.';

-- Consumer mailbox providers: a shared domain says nothing about the company,
-- so these never match an existing account by domain.
CREATE OR REPLACE FUNCTION public.is_free_mail_domain(_domain text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(btrim(COALESCE(_domain, ''))) = ANY (ARRAY[
    'gmail.com','googlemail.com',
    'outlook.com','hotmail.com','hotmail.co.uk','live.com','msn.com',
    'yahoo.com','yahoo.co.uk','ymail.com','rocketmail.com',
    'icloud.com','me.com','mac.com',
    'aol.com',
    'proton.me','protonmail.com','pm.me',
    'gmx.com','gmx.net','mail.com','yandex.com',
    'comcast.net','att.net','sbcglobal.net','verizon.net'
  ])
$$;

COMMENT ON FUNCTION public.is_free_mail_domain(text) IS
  'True for consumer mailbox domains (gmail.com, outlook.com, …). Such requesters never match an account by domain; a new account is named after the person.';

-- Automated / bulk senders, judged on the local part.
--   prefix match : noreply…, no-reply…, donotreply…, do-not-reply…,
--                  mailer-daemon…, bounce…
--   whole word   : newsletter(s), news, postmaster, notification(s), notify,
--                  alert(s), marketing, updates, digest, automated,
--                  auto-reply / auto-confirm / autoresponder, outgoing,
--                  unsubscribe   (an optional +tag is allowed)
CREATE OR REPLACE FUNCTION public.is_bulk_sender_address(_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    split_part(public.support_email_address(_email), '@', 1) ~ (
      '^((no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|bounces?)'
      || '|((newsletters?|news|postmaster|notifications?|notify|alerts?|marketing|updates'
      || '|digest|automated|auto[-_.]?(reply|confirm|responder)|outgoing|unsubscribe)(\+.*)?$))'
    ),
    false)
$$;

COMMENT ON FUNCTION public.is_bulk_sender_address(text) IS
  'True for automated/bulk local parts (noreply, newsletter, mailer-daemon, notifications, bounce, …). Such senders are linked to an existing contact but never create one.';

-- "Last, First" -> (First, Last); otherwise split on the first space. A trailing
-- "at Company" / "from Company" or a trailing domain-like word is dropped first.
CREATE OR REPLACE FUNCTION public.support_requester_split_name(
  _name text, OUT first_name text, OUT last_name text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v text := btrim(regexp_replace(COALESCE(_name, ''), '^["'']+|["'']+$', '', 'g'));
BEGIN
  -- Mail-client display names: "Tina at Quo", "Bob from Acme", "sales addcanada.ca".
  v := btrim(regexp_replace(v, '\s+(at|from)\s+\S.*$', '', 'i'));
  v := btrim(regexp_replace(v, '\s+\S+\.[a-z]{2,}$', '', 'i'));
  IF v = '' OR position('@' IN v) > 0 THEN
    RETURN;  -- both NULL: no usable name
  END IF;
  IF position(',' IN v) > 0 THEN
    last_name  := NULLIF(btrim(split_part(v, ',', 1)), '');
    first_name := NULLIF(btrim(substr(v, position(',' IN v) + 1)), '');
  ELSIF position(' ' IN v) > 0 THEN
    first_name := NULLIF(btrim(split_part(v, ' ', 1)), '');
    last_name  := NULLIF(btrim(substr(v, position(' ' IN v) + 1)), '');
  ELSE
    first_name := v;
  END IF;
END;
$$;

-- Staff never become contacts: merchanthaus.io (and subdomains), or the
-- address of any staff/admin user (several use gmail.com).
CREATE OR REPLACE FUNCTION public.is_internal_support_address(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH a AS (SELECT public.support_email_address(_email) AS addr)
  SELECT COALESCE((
    SELECT split_part(a.addr, '@', 2) = 'merchanthaus.io'
        OR split_part(a.addr, '@', 2) LIKE '%.merchanthaus.io'
        OR EXISTS (SELECT 1
                     FROM auth.users u
                     JOIN public.user_roles ur ON ur.user_id = u.id
                    WHERE ur.role IN ('staff'::public.app_role, 'admin'::public.app_role)
                      AND lower(btrim(u.email)) = a.addr)
      FROM a WHERE a.addr IS NOT NULL), false)
$$;

REVOKE ALL ON FUNCTION public.is_internal_support_address(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_internal_support_address(text) TO service_role;

-- ── 2. The decision, with no writes ─────────────────────────────────────────
-- One place decides what should happen for a requester. The trigger and the
-- (later, manual) backfill both execute it, and a SELECT over it is the dry run.
--
-- action:
--   skip_spam / skip_quarantined / skip_no_email / skip_blocked_domain /
--   skip_internal    -> nothing is linked or created
--   already_linked   -> ticket had contact_id; fill account_id from it
--   link_contact     -> a contact with this email exists (oldest wins)
--   skip_bulk_sender -> automated sender with no existing contact: no contact
--   create_contact   -> create a contact on account_id (the ticket's own
--                       account, or the one account matching a business domain)
--   create_account_and_contact -> new account named new_account_name + contact
CREATE OR REPLACE FUNCTION public.support_requester_plan(
  _email       text,
  _name        text,
  _tenant_id   uuid,
  _contact_id  uuid    DEFAULT NULL,
  _account_id  uuid    DEFAULT NULL,
  _status      text    DEFAULT 'open',
  _quarantined boolean DEFAULT false)
RETURNS TABLE (
  action           text,
  contact_id       uuid,
  account_id       uuid,
  new_account_name text,
  first_name       text,
  last_name        text,
  email            text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  uuid := COALESCE(_tenant_id, public.default_tenant_id());
  v_email   text := public.support_email_address(_email);
  v_domain  text := split_part(public.support_email_address(_email), '@', 2);
  v_contact uuid;
  v_account uuid;
  v_count   integer;
  v_first   text;
  v_last    text;
BEGIN
  email := v_email;

  IF _contact_id IS NOT NULL THEN
    SELECT c.account_id INTO v_account FROM public.contacts c WHERE c.id = _contact_id;
    action := 'already_linked';
    contact_id := _contact_id;
    account_id := COALESCE(_account_id, v_account);
    RETURN NEXT; RETURN;
  END IF;

  IF _status = 'spam' THEN action := 'skip_spam'; RETURN NEXT; RETURN; END IF;
  IF COALESCE(_quarantined, false) THEN action := 'skip_quarantined'; RETURN NEXT; RETURN; END IF;
  IF v_email IS NULL THEN action := 'skip_no_email'; RETURN NEXT; RETURN; END IF;
  IF public.is_blocked_support_domain(v_email) THEN action := 'skip_blocked_domain'; RETURN NEXT; RETURN; END IF;
  IF public.is_internal_support_address(v_email) THEN action := 'skip_internal'; RETURN NEXT; RETURN; END IF;

  -- Existing contact on the same address (case-insensitive) -> link, never duplicate.
  SELECT c.id, c.account_id INTO v_contact, v_account
    FROM public.contacts c
   WHERE c.tenant_id = v_tenant
     AND lower(btrim(c.email)) = v_email
   ORDER BY c.created_at, c.id
   LIMIT 1;
  IF v_contact IS NOT NULL THEN
    action := 'link_contact';
    contact_id := v_contact;
    account_id := COALESCE(_account_id, v_account);
    RETURN NEXT; RETURN;
  END IF;

  IF public.is_bulk_sender_address(v_email) THEN
    action := 'skip_bulk_sender';
    account_id := _account_id;
    RETURN NEXT; RETURN;
  END IF;

  SELECT s.first_name, s.last_name INTO v_first, v_last
    FROM public.support_requester_split_name(_name) s;
  first_name := v_first;
  last_name  := v_last;

  -- Staff chose the account on the ticket: the contact goes there.
  IF _account_id IS NOT NULL THEN
    action := 'create_contact';
    account_id := _account_id;
    RETURN NEXT; RETURN;
  END IF;

  -- Business domain: reuse an account only when exactly one live account has
  -- contacts on that domain. Zero or several -> new account.
  IF NOT public.is_free_mail_domain(v_domain) THEN
    SELECT count(DISTINCT c.account_id), min(c.account_id::text)::uuid
      INTO v_count, v_account
      FROM public.contacts c
      JOIN public.accounts a ON a.id = c.account_id
     WHERE c.tenant_id = v_tenant
       AND a.tenant_id = v_tenant
       AND COALESCE(a.status, 'active') <> 'dead'
       AND public.support_email_domain(c.email) = v_domain;
    IF v_count = 1 THEN
      action := 'create_contact';
      account_id := v_account;
      RETURN NEXT; RETURN;
    END IF;
    action := 'create_account_and_contact';
    new_account_name := v_domain;
    RETURN NEXT; RETURN;
  END IF;

  -- Free-mail: the account is the person.
  action := 'create_account_and_contact';
  new_account_name := COALESCE(
    NULLIF(btrim(concat_ws(' ', v_first, v_last)), ''),
    v_email);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.support_requester_plan(text, text, uuid, uuid, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_requester_plan(text, text, uuid, uuid, uuid, text, boolean) TO service_role;

COMMENT ON FUNCTION public.support_requester_plan(text, text, uuid, uuid, uuid, text, boolean) IS
  'Read-only: what auto-linking would do for a support requester (link / create contact / create account + contact / skip_*). The trigger and the manual backfill execute this plan; SELECT it for a dry run.';

-- ── 3. Execute the plan ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_requester_apply(
  _email       text,
  _name        text,
  _tenant_id   uuid,
  _contact_id  uuid    DEFAULT NULL,
  _account_id  uuid    DEFAULT NULL,
  _status      text    DEFAULT 'open',
  _quarantined boolean DEFAULT false)
RETURNS TABLE (action text, contact_id uuid, account_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := COALESCE(_tenant_id, public.default_tenant_id());
  p record;
  v_account uuid;
  v_contact uuid;
BEGIN
  SELECT * INTO p
    FROM public.support_requester_plan(_email, _name, v_tenant, _contact_id, _account_id, _status, _quarantined);

  action := p.action;
  v_account := p.account_id;
  v_contact := p.contact_id;

  IF p.action = 'create_account_and_contact' THEN
    INSERT INTO public.accounts (name, tenant_id)
    VALUES (p.new_account_name, v_tenant)
    RETURNING id INTO v_account;
  END IF;

  IF p.action IN ('create_contact', 'create_account_and_contact') THEN
    INSERT INTO public.contacts (account_id, first_name, last_name, email, tenant_id)
    VALUES (v_account, p.first_name, p.last_name, p.email, v_tenant)
    RETURNING id INTO v_contact;
  END IF;

  contact_id := v_contact;
  account_id := v_account;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.support_requester_apply(text, text, uuid, uuid, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_requester_apply(text, text, uuid, uuid, uuid, text, boolean) TO service_role;

COMMENT ON FUNCTION public.support_requester_apply(text, text, uuid, uuid, uuid, text, boolean) IS
  'Executes support_requester_plan(): creates the account/contact it calls for and returns the ids to put on the ticket. Not callable by clients; used by the ticket trigger and the manual backfill.';

-- ── 4. Ticket trigger ───────────────────────────────────────────────────────
-- Covers every intake path (support-inbound-email, gmail-poll-support,
-- submit-support-ticket, the staff NewTicketDialog) because they all INSERT.
-- A failure here must never lose a support ticket: any error is downgraded to a
-- WARNING and the ticket is saved unlinked (the subtransaction rolls back any
-- half-made account/contact).
CREATE OR REPLACE FUNCTION public.support_tickets_link_requester()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  BEGIN
    SELECT * INTO r
      FROM public.support_requester_apply(
             NEW.requester_email, NEW.requester_name, NEW.tenant_id,
             NEW.contact_id, NEW.account_id, NEW.status,
             NEW.quarantined_at IS NOT NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'support_tickets_link_requester: % (%); ticket saved without a contact', SQLERRM, SQLSTATE;
    RETURN NEW;
  END;

  NEW.contact_id := COALESCE(NEW.contact_id, r.contact_id);
  NEW.account_id := COALESCE(NEW.account_id, r.account_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_link_requester ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_link_requester
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_link_requester();

COMMENT ON FUNCTION public.support_tickets_link_requester() IS
  'BEFORE INSERT on support_tickets: links the requester to a contact/account per support_requester_plan(), creating them when the plan says so. Never blocks a ticket.';
