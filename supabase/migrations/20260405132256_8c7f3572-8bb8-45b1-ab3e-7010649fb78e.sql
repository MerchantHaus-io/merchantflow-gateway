
-- Agenda items / ideation submissions
CREATE TABLE public.agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'agenda',
  submitted_by uuid NOT NULL,
  submitted_by_email text NOT NULL,
  status text NOT NULL DEFAULT 'raised',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agenda_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view agenda items"
  ON public.agenda_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can submit agenda items"
  ON public.agenda_items FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = submitted_by);

CREATE POLICY "Admins can update agenda items"
  ON public.agenda_items FOR UPDATE
  USING (is_admin_email());

CREATE POLICY "Admins can delete agenda items"
  ON public.agenda_items FOR DELETE
  USING (is_admin_email());

CREATE TRIGGER update_agenda_items_updated_at
  BEFORE UPDATE ON public.agenda_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Admin-created popup notifications
CREATE TABLE public.admin_popups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  min_display_seconds integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.admin_popups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active popups"
  ON public.admin_popups FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can create popups"
  ON public.admin_popups FOR INSERT
  WITH CHECK (is_admin_email());

CREATE POLICY "Admins can update popups"
  ON public.admin_popups FOR UPDATE
  USING (is_admin_email());

CREATE POLICY "Admins can delete popups"
  ON public.admin_popups FOR DELETE
  USING (is_admin_email());

-- Popup acknowledgments
CREATE TABLE public.admin_popup_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  popup_id uuid NOT NULL REFERENCES public.admin_popups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (popup_id, user_id)
);

ALTER TABLE public.admin_popup_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own acknowledgments"
  ON public.admin_popup_acknowledgments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can acknowledge popups"
  ON public.admin_popup_acknowledgments FOR INSERT
  WITH CHECK (auth.uid() = user_id);
