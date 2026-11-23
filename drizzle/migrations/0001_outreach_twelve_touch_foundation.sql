CREATE OR REPLACE FUNCTION public.outreach_working_day(d date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
WITH years AS (SELECT generate_series(extract(year from d)::integer-1,extract(year from d)::integer+1) y),
fixed AS (SELECT make_date(y,m,day) h FROM years CROSS JOIN (VALUES (1,1),(6,19),(7,4),(11,11),(12,25)) v(m,day)),
observed AS (SELECT CASE extract(isodow from h) WHEN 6 THEN h-1 WHEN 7 THEN h+1 ELSE h END h FROM fixed),
floating AS (
SELECT make_date(y,1,1)+((8-extract(isodow from make_date(y,1,1))::integer)%7)+14 h FROM years
UNION ALL SELECT make_date(y,2,1)+((8-extract(isodow from make_date(y,2,1))::integer)%7)+14 FROM years
UNION ALL SELECT make_date(y,5,31)-((extract(isodow from make_date(y,5,31))::integer+6)%7) FROM years
UNION ALL SELECT make_date(y,9,1)+((8-extract(isodow from make_date(y,9,1))::integer)%7) FROM years
UNION ALL SELECT make_date(y,10,1)+((8-extract(isodow from make_date(y,10,1))::integer)%7)+7 FROM years
UNION ALL SELECT make_date(y,11,1)+((11-extract(isodow from make_date(y,11,1))::integer)%7)+21 FROM years)
SELECT d IS NOT NULL AND extract(isodow from d)<6 AND NOT EXISTS(SELECT 1 FROM observed WHERE h=d) AND NOT EXISTS(SELECT 1 FROM floating WHERE h=d);
$$;
CREATE OR REPLACE FUNCTION public.outreach_touch_template()
RETURNS TABLE(touch_number integer,working_day integer,channel text,title text,thread_touch integer)
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
VALUES (1,1,'linkedin','Connect without a pitch',NULL::integer),(2,1,'email','Intro and one question',NULL::integer),
(3,3,'call','Call and leave email-reference voicemail',NULL::integer),(4,5,'linkedin','Comment on a recent post',NULL::integer),
(5,7,'email','Short bump in the first thread',2),(6,9,'call','Different time slot; no voicemail',NULL::integer),
(7,10,'linkedin','DM if connected; otherwise comment',NULL::integer),(8,14,'email','New angle: disputes and fraud',NULL::integer),
(9,16,'call','Voicemail referencing the disputes email',NULL::integer),(10,18,'linkedin','Share a useful point without an ask',NULL::integer),
(11,21,'email','Ask for the right person in the disputes thread',8),(12,24,'email','Polite close-out',NULL::integer);
$$;
CREATE OR REPLACE FUNCTION public.outreach_due_at(start_on date,day_number integer,touch_channel text,contact_zone text DEFAULT 'America/New_York',touch_no integer DEFAULT 1)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE d date:=start_on; n integer:=0; slot time; result timestamptz;
BEGIN
IF start_on IS NULL OR day_number NOT BETWEEN 1 AND 366 OR touch_channel NOT IN ('email','call','linkedin') THEN RAISE EXCEPTION 'Invalid cadence schedule'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=contact_zone) THEN RAISE EXCEPTION 'Invalid contact timezone'; END IF;
LOOP
IF public.outreach_working_day(d) THEN n:=n+1; END IF;
EXIT WHEN n=day_number;
d:=d+1;
END LOOP;
slot:=CASE WHEN touch_channel<>'call' THEN time '16:00' WHEN contact_zone IN ('America/Los_Angeles','America/Phoenix','America/Anchorage','Pacific/Honolulu') OR touch_no=6 THEN time '18:30' ELSE time '16:30' END;
result:=(d+slot) AT TIME ZONE 'Africa/Johannesburg';
RETURN greatest(result,(d+time '09:00') AT TIME ZONE contact_zone);
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_working_day(date),public.outreach_touch_template(),public.outreach_due_at(date,integer,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outreach_working_day(date),public.outreach_touch_template(),public.outreach_due_at(date,integer,text,text,integer) TO authenticated,service_role;

CREATE TABLE public.outreach_enrollments (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id),
campaign_id uuid NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
contact_id uuid NOT NULL REFERENCES public.outreach_contacts(id) ON DELETE CASCADE,
assigned_user_id uuid NOT NULL, assigned_email text NOT NULL,
start_on date NOT NULL, contact_timezone text NOT NULL DEFAULT 'America/New_York',
website_url text, linkedin_url text,
status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','replied','not_interested','completed','cancelled')),
research jsonb NOT NULL DEFAULT '{}'::jsonb, research_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
research_status text NOT NULL DEFAULT 'not_started' CHECK(research_status IN ('not_started','running','ready','failed','blocked')),
research_error text, research_run_id text, researched_at timestamptz,
created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
UNIQUE(contact_id), UNIQUE(id,tenant_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.outreach_enrollments TO authenticated;
GRANT ALL ON public.outreach_enrollments TO service_role;
ALTER TABLE public.outreach_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_enrollments_staff ON public.outreach_enrollments FOR ALL TO authenticated
USING(public.is_internal_staff() AND tenant_id=public.current_tenant_id())
WITH CHECK(public.is_internal_staff() AND tenant_id=public.current_tenant_id());
CREATE INDEX outreach_enrollments_assignee_status_idx ON public.outreach_enrollments(tenant_id,assigned_user_id,status);

CREATE TABLE public.outreach_touches (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
enrollment_id uuid NOT NULL, touch_number integer NOT NULL CHECK(touch_number BETWEEN 1 AND 12),
working_day integer NOT NULL, channel text NOT NULL CHECK(channel IN ('email','call','linkedin')),
title text NOT NULL, thread_touch integer, due_at timestamptz NOT NULL,
status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','skipped','cancelled')),
subject text NOT NULL DEFAULT '', draft_text text NOT NULL DEFAULT '',
outcome text, notes text, reply_word_for_word text,
completed_at timestamptz, completed_by uuid, provider_message_id text, provider_thread_id text,
notified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
FOREIGN KEY(enrollment_id,tenant_id) REFERENCES public.outreach_enrollments(id,tenant_id) ON DELETE CASCADE,
UNIQUE(enrollment_id,touch_number)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.outreach_touches TO authenticated;
GRANT ALL ON public.outreach_touches TO service_role;
ALTER TABLE public.outreach_touches ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_touches_staff ON public.outreach_touches FOR ALL TO authenticated
USING(public.is_internal_staff() AND tenant_id=public.current_tenant_id())
WITH CHECK(public.is_internal_staff() AND tenant_id=public.current_tenant_id());
CREATE INDEX outreach_touches_due_idx ON public.outreach_touches(due_at,enrollment_id,touch_number) WHERE status='pending' AND notified_at IS NULL;

CREATE OR REPLACE FUNCTION public.outreach_validate_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient text;
BEGIN
IF NOT EXISTS(SELECT 1 FROM public.outreach_contacts c JOIN public.outreach_campaigns p ON p.id=c.campaign_id WHERE c.id=NEW.contact_id AND p.id=NEW.campaign_id AND c.tenant_id=NEW.tenant_id AND p.tenant_id=NEW.tenant_id) THEN RAISE EXCEPTION 'Contact and campaign must belong to the same organisation'; END IF;
SELECT m.email INTO recipient FROM public.tenant_memberships m JOIN public.tenants t ON t.id=m.tenant_id WHERE m.user_id=NEW.assigned_user_id AND m.tenant_id=NEW.tenant_id AND m.status='active' AND t.status IN ('ready','active') AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=m.user_id AND r.tenant_id=m.tenant_id AND r.role IN ('staff','admin'));
IF recipient IS NULL OR recipient='' THEN RAISE EXCEPTION 'Assignee must be an active internal teammate with an email'; END IF;
NEW.assigned_email:=recipient;
IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.contact_timezone) THEN RAISE EXCEPTION 'Invalid contact timezone'; END IF;
IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.campaign_id,NEW.contact_id,NEW.start_on,NEW.contact_timezone) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.campaign_id,OLD.contact_id,OLD.start_on,OLD.contact_timezone) THEN RAISE EXCEPTION 'Cadence identity and schedule are immutable; cancel and enrol again to change them'; END IF;
IF NEW.status='active' AND EXISTS(SELECT 1 FROM public.outreach_contacts c WHERE c.id=NEW.contact_id AND c.status IN ('replied','bounced','converted','opted_out')) THEN RAISE EXCEPTION 'A replied, bounced, converted or opted-out contact cannot be enrolled'; END IF;
NEW.updated_at:=now(); RETURN NEW;
END;
$$;
CREATE TRIGGER outreach_enrollment_validate BEFORE INSERT OR UPDATE ON public.outreach_enrollments FOR EACH ROW EXECUTE FUNCTION public.outreach_validate_enrollment();

CREATE OR REPLACE FUNCTION public.outreach_validate_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.outreach_enrollments; t record;
BEGIN
SELECT * INTO STRICT e FROM public.outreach_enrollments WHERE id=NEW.enrollment_id AND tenant_id=NEW.tenant_id;
SELECT * INTO STRICT t FROM public.outreach_touch_template() WHERE touch_number=NEW.touch_number;
IF (NEW.working_day,NEW.channel,NEW.thread_touch) IS DISTINCT FROM (t.working_day,t.channel,t.thread_touch) THEN RAISE EXCEPTION 'Touch must match the 12-step cadence'; END IF;
IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.enrollment_id,NEW.touch_number,NEW.working_day,NEW.channel,NEW.thread_touch) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.enrollment_id,OLD.touch_number,OLD.working_day,OLD.channel,OLD.thread_touch) THEN RAISE EXCEPTION 'Touch identity is immutable'; END IF;
IF NEW.status IN ('completed','skipped') AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
IF e.status<>'active' THEN RAISE EXCEPTION 'Cadence is not active'; END IF;
IF EXISTS(SELECT 1 FROM public.outreach_touches p WHERE p.enrollment_id=e.id AND p.touch_number<NEW.touch_number AND p.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'Complete earlier touches first'; END IF;
IF NEW.status='completed' AND NEW.channel='email' AND (NEW.provider_message_id IS NULL OR NEW.provider_message_id='') THEN RAISE EXCEPTION 'Email completion requires confirmed delivery'; END IF;
IF NEW.status='completed' AND NEW.channel='call' AND (NEW.outcome IS NULL OR NEW.outcome='') THEN RAISE EXCEPTION 'Log a call outcome'; END IF;
NEW.completed_at:=now(); NEW.completed_by:=auth.uid();
END IF;
IF TG_OP='UPDATE' AND OLD.status<>'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'A finished touch cannot be reopened'; END IF;
IF TG_OP='UPDATE' AND NEW.due_at IS DISTINCT FROM OLD.due_at THEN NEW.notified_at:=NULL; END IF;
NEW.updated_at:=now(); RETURN NEW;
END;
$$;
CREATE TRIGGER outreach_touch_validate BEFORE INSERT OR UPDATE ON public.outreach_touches FOR EACH ROW EXECUTE FUNCTION public.outreach_validate_touch();

CREATE OR REPLACE FUNCTION public.outreach_initialize_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
UPDATE public.outreach_contacts SET status='cadence_active' WHERE id=NEW.contact_id AND tenant_id=NEW.tenant_id;
INSERT INTO public.outreach_touches(tenant_id,enrollment_id,touch_number,working_day,channel,title,thread_touch,due_at)
SELECT NEW.tenant_id,NEW.id,t.touch_number,t.working_day,t.channel,t.title,t.thread_touch,public.outreach_due_at(NEW.start_on,t.working_day,t.channel,NEW.contact_timezone,t.touch_number) FROM public.outreach_touch_template() t;
RETURN NEW;
END;
$$;
CREATE TRIGGER outreach_enrollment_initialize AFTER INSERT ON public.outreach_enrollments FOR EACH ROW EXECUTE FUNCTION public.outreach_initialize_enrollment();

CREATE OR REPLACE FUNCTION public.outreach_stop_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NEW.status IN ('replied','not_interested','completed','cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
UPDATE public.outreach_touches SET status='cancelled' WHERE enrollment_id=NEW.id AND tenant_id=NEW.tenant_id AND status='pending';
END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER outreach_enrollment_stop AFTER UPDATE OF status ON public.outreach_enrollments FOR EACH ROW EXECUTE FUNCTION public.outreach_stop_enrollment();

CREATE OR REPLACE FUNCTION public.outreach_contact_reply_stop()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NEW.status IN ('replied','bounced','converted','opted_out') AND NEW.status IS DISTINCT FROM OLD.status THEN
UPDATE public.outreach_enrollments SET status=CASE WHEN NEW.status='replied' THEN 'replied' WHEN NEW.status='opted_out' THEN 'not_interested' ELSE 'cancelled' END WHERE contact_id=NEW.id AND tenant_id=NEW.tenant_id AND status IN ('active','paused');
END IF;
IF NEW.status IN ('pending','sent') AND EXISTS(SELECT 1 FROM public.outreach_enrollments WHERE contact_id=NEW.id AND status IN ('active','paused')) THEN RAISE EXCEPTION 'Managed cadence contacts cannot enter bulk email delivery'; END IF;
RETURN NEW;
END;
$$;
CREATE TRIGGER outreach_contact_stop BEFORE UPDATE OF status ON public.outreach_contacts FOR EACH ROW EXECUTE FUNCTION public.outreach_contact_reply_stop();

CREATE OR REPLACE FUNCTION public.outreach_finish_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NEW.status IN ('completed','skipped') AND NOT EXISTS(SELECT 1 FROM public.outreach_touches WHERE enrollment_id=NEW.enrollment_id AND status NOT IN ('completed','skipped')) THEN
UPDATE public.outreach_enrollments SET status='completed' WHERE id=NEW.enrollment_id AND tenant_id=NEW.tenant_id AND status='active';
END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER outreach_touch_finish AFTER UPDATE OF status ON public.outreach_touches FOR EACH ROW EXECUTE FUNCTION public.outreach_finish_enrollment();

CREATE OR REPLACE FUNCTION public.outreach_notify_due()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; sent integer:=0;
BEGIN
FOR t IN
SELECT x.id,x.touch_number,x.title,e.campaign_id,e.assigned_user_id,m.email,e.tenant_id,coalesce(c.company,c.email) company
FROM public.outreach_touches x JOIN public.outreach_enrollments e ON e.id=x.enrollment_id AND e.tenant_id=x.tenant_id
JOIN public.outreach_contacts c ON c.id=e.contact_id AND c.tenant_id=e.tenant_id
JOIN public.tenant_memberships m ON m.user_id=e.assigned_user_id AND m.tenant_id=e.tenant_id AND m.status='active'
JOIN public.tenants org ON org.id=e.tenant_id AND org.status IN ('ready','active')
WHERE x.status='pending' AND x.notified_at IS NULL AND x.due_at<=now() AND e.status='active'
AND c.status='cadence_active' AND m.email IS NOT NULL
AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=m.user_id AND r.tenant_id=m.tenant_id AND r.role IN ('staff','admin'))
AND NOT EXISTS(SELECT 1 FROM public.outreach_touches p WHERE p.enrollment_id=e.id AND p.touch_number<x.touch_number AND p.status NOT IN ('completed','skipped'))
ORDER BY x.due_at LIMIT 250 FOR UPDATE OF x SKIP LOCKED
LOOP
INSERT INTO public.notifications(tenant_id,user_id,user_email,title,message,type,link)
VALUES(t.tenant_id,t.assigned_user_id,t.email,'Outreach next step: '||t.company,'Touch '||t.touch_number||'/12 — '||t.title,'task','/outreach/'||t.campaign_id);
UPDATE public.outreach_touches SET notified_at=now() WHERE id=t.id;
sent:=sent+1;
END LOOP; RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.outreach_validate_enrollment(),public.outreach_validate_touch(),public.outreach_initialize_enrollment(),public.outreach_stop_enrollment(),public.outreach_contact_reply_stop(),public.outreach_finish_enrollment(),public.outreach_notify_due() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_notify_due() TO service_role;
COMMENT ON TABLE public.outreach_enrollments IS 'Manual 12-touch outreach; research is untrusted evidence and drafts require rep approval. Separate app/function phase implements Quo and assigned-sender delivery.';
COMMENT ON COLUMN public.outreach_touches.provider_message_id IS 'Confirmed provider delivery reference; do not mark email complete before delivery succeeds.';