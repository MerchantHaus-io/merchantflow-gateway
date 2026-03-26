
-- Calendar events table for synced Google Calendar events
CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_event_id text UNIQUE,
  title text NOT NULL,
  description text,
  location text,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  calendar_id text,
  calendar_owner_email text,
  organizer_email text,
  attendees jsonb DEFAULT '[]'::jsonb,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  status text DEFAULT 'confirmed',
  html_link text,
  color text,
  reminder_created_sent boolean NOT NULL DEFAULT false,
  reminder_24h_sent boolean NOT NULL DEFAULT false,
  reminder_1h_sent boolean NOT NULL DEFAULT false,
  synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view calendar events"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert calendar events"
  ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update calendar events"
  ON public.calendar_events FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete calendar events"
  ON public.calendar_events FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Service role needs access for edge function syncing
CREATE POLICY "Service role full access to calendar events"
  ON public.calendar_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Index for quick upcoming events queries
CREATE INDEX idx_calendar_events_start_time ON public.calendar_events (start_time);
CREATE INDEX idx_calendar_events_google_id ON public.calendar_events (google_event_id);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
