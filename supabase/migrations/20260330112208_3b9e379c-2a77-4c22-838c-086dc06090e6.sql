
CREATE TABLE public.sop_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id text NOT NULL,
  section_title text NOT NULL,
  original_content text,
  proposed_content text NOT NULL,
  reason text,
  submitted_by text NOT NULL,
  submitted_by_name text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by text,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sop_change_requests ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view change requests
CREATE POLICY "Authenticated users can view sop changes"
  ON public.sop_change_requests FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can submit change requests
CREATE POLICY "Authenticated users can submit sop changes"
  ON public.sop_change_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only admin (Jamie) can update (approve/decline)
CREATE POLICY "Admin can update sop changes"
  ON public.sop_change_requests FOR UPDATE
  TO authenticated
  USING (public.is_admin_email());

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.sop_change_requests;
