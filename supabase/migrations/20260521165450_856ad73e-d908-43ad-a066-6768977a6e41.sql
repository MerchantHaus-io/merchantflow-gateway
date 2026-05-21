-- Support Triage: Zendesk-style ticketing for live & billing merchant clients.
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START WITH 1000;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number     text NOT NULL UNIQUE,
  subject           text NOT NULL,
  description       text,
  category          text NOT NULL DEFAULT 'support'
                      CHECK (category IN ('support','billing','integration','technical')),
  priority          text NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low','normal','high','urgent')),
  status            text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','in_progress','closed')),
  source            text NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual','web_form','email')),
  requester_name    text,
  requester_email   text NOT NULL,
  account_id        uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  contact_id        uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  assigned_to       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_name  text,
  assigned_to_email text,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  claimed_at        timestamptz,
  closed_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status          ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category        ON public.support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to     ON public.support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_account_id      ON public.support_tickets(account_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_requester_email ON public.support_tickets(lower(requester_email));
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at      ON public.support_tickets(created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_ticket_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  body         text NOT NULL,
  is_internal  boolean NOT NULL DEFAULT false,
  author_type  text NOT NULL DEFAULT 'agent'
                 CHECK (author_type IN ('agent','customer','system')),
  author_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_comments_ticket_id
  ON public.support_ticket_comments(ticket_id, created_at);

CREATE OR REPLACE FUNCTION public.support_tickets_set_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'MH-' || nextval('public.support_ticket_number_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_set_number ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_set_number
BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_tickets_set_number();

CREATE OR REPLACE FUNCTION public.support_tickets_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
    NEW.closed_at := now();
  ELSIF NEW.status <> 'closed' AND OLD.status = 'closed' THEN
    NEW.closed_at := NULL;
  END IF;
  IF NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS NULL THEN
    NEW.claimed_at := now();
  ELSIF NEW.assigned_to IS NULL THEN
    NEW.claimed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_touch ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_touch
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_tickets_touch();

CREATE OR REPLACE FUNCTION public.support_ticket_comments_bump_ticket()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_comments_bump ON public.support_ticket_comments;
CREATE TRIGGER trg_support_ticket_comments_bump
AFTER INSERT ON public.support_ticket_comments
FOR EACH ROW EXECUTE FUNCTION public.support_ticket_comments_bump_ticket();

ALTER TABLE public.support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage support tickets" ON public.support_tickets;
CREATE POLICY "Staff manage support tickets"
  ON public.support_tickets FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL AND NOT public.is_referrer())
  WITH CHECK (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DROP POLICY IF EXISTS "Staff manage support ticket comments" ON public.support_ticket_comments;
CREATE POLICY "Staff manage support ticket comments"
  ON public.support_ticket_comments FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL AND NOT public.is_referrer())
  WITH CHECK (auth.uid() IS NOT NULL AND NOT public.is_referrer());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public' AND tablename = 'support_tickets'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public' AND tablename = 'support_ticket_comments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_comments;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.support_tickets IS 'Zendesk-style support tickets for live & billing merchant clients. Separate from the sales pipeline.';
COMMENT ON TABLE public.support_ticket_comments IS 'Conversation thread for a support ticket.';