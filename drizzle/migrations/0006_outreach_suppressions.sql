-- Per-organisation outreach suppression list. An opt-out is recorded against the
-- address, not the contact row, so the same person cannot be re-enrolled from
-- another campaign or a re-import.
--
-- Verified in production on 24 Nov 2026 before writing this:
--   * public.outreach_contacts has 0 rows and public.outreach_enrollments has 0 rows,
--     so the backfill below is expected to insert nothing there.
--   * outreach_contacts.status has no CHECK constraint ('opted_out' is a convention).
--   * the live public.outreach_validate_enrollment() body equals the 0002 body,
--     which section F reproduces verbatim plus one line.
--   * default ACLs in schema public grant anon/authenticated full table rights and
--     EXECUTE on new functions, so every new object here is explicitly REVOKEd.
-- Not re-runnable: CREATE TABLE fails on a second apply.

CREATE TABLE public.outreach_suppressions (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id),
email text NOT NULL CHECK(email=lower(btrim(email)) AND email<>'' AND position('@' in email)>1),
reason text NOT NULL CHECK(reason IN ('unsubscribe','complaint','manual','not_interested')),
source text NOT NULL DEFAULT 'manual',
created_at timestamptz NOT NULL DEFAULT now(),
created_by uuid
);
CREATE UNIQUE INDEX outreach_suppressions_tenant_email_key ON public.outreach_suppressions(tenant_id,lower(email));

CREATE OR REPLACE FUNCTION public.outreach_suppression_normalize()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
NEW.email:=lower(btrim(NEW.email));
NEW.source:=coalesce(nullif(btrim(NEW.source),''),'manual');
-- A signed-in caller cannot attribute the row to someone else. Service role and
-- definer triggers (no auth.uid()) keep what they pass, usually NULL.
IF auth.uid() IS NOT NULL THEN NEW.created_by:=auth.uid(); END IF;
RETURN NEW;
END;
$$;
CREATE TRIGGER outreach_suppression_normalize BEFORE INSERT ON public.outreach_suppressions FOR EACH ROW EXECUTE FUNCTION public.outreach_suppression_normalize();

-- No UPDATE for anyone, so an opt-out persists; removal is an admin DELETE. No TRUNCATE.
REVOKE ALL ON public.outreach_suppressions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,DELETE ON public.outreach_suppressions TO authenticated;
GRANT SELECT,INSERT ON public.outreach_suppressions TO service_role;
ALTER TABLE public.outreach_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY outreach_suppressions_staff_read ON public.outreach_suppressions FOR SELECT TO authenticated
USING(public.is_internal_staff() AND tenant_id=public.current_tenant_id());
CREATE POLICY outreach_suppressions_staff_insert ON public.outreach_suppressions FOR INSERT TO authenticated
WITH CHECK(public.is_internal_staff() AND tenant_id=public.current_tenant_id());
CREATE POLICY outreach_suppressions_admin_delete ON public.outreach_suppressions FOR DELETE TO authenticated
USING(public.is_internal_staff() AND public.has_role(auth.uid(),'admin'::public.app_role) AND tenant_id=public.current_tenant_id());
REVOKE ALL ON FUNCTION public.outreach_suppression_normalize() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.outreach_email_suppressed(p_tenant uuid,p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT coalesce(p_tenant IS NOT NULL AND nullif(lower(btrim(p_email)),'') IS NOT NULL
AND EXISTS(SELECT 1 FROM public.outreach_suppressions s WHERE s.tenant_id=p_tenant AND lower(s.email)=lower(btrim(p_email))),false);
$$;
-- service_role only: it takes an arbitrary tenant and bypasses RLS, so granting it to
-- authenticated would be a cross-tenant membership oracle. Clients read the table
-- through RLS, edge functions use service_role, the enrolment trigger runs as definer.
REVOKE ALL ON FUNCTION public.outreach_email_suppressed(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outreach_email_suppressed(uuid,text) TO service_role;
COMMENT ON FUNCTION public.outreach_email_suppressed(uuid,text) IS 'True when the address is on the tenant''s outreach suppression list; never NULL. Bypasses RLS: service_role and definer triggers only.';

-- Feed the list from contacts. reason is 'not_interested' when the opt-out came from a
-- completed touch with that outcome (the outreach_finish_enrollment path in 0002);
-- otherwise it is the staff Opt Out button, recorded as 'manual'. A malformed address
-- is skipped rather than allowed to abort the contact write.
CREATE OR REPLACE FUNCTION public.outreach_contact_suppress_opt_out()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE addr text:=nullif(lower(btrim(NEW.email)),'');
BEGIN
IF addr IS NULL OR position('@' in addr)<=1 THEN RETURN NEW; END IF;
INSERT INTO public.outreach_suppressions(tenant_id,email,reason,source,created_by)
VALUES(NEW.tenant_id,addr,CASE WHEN EXISTS(SELECT 1 FROM public.outreach_touches x JOIN public.outreach_enrollments e ON e.id=x.enrollment_id AND e.tenant_id=x.tenant_id WHERE e.contact_id=NEW.id AND x.status='completed' AND x.outcome='not_interested') THEN 'not_interested' ELSE 'manual' END,'outreach_contact',auth.uid())
ON CONFLICT (tenant_id,lower(email)) DO NOTHING;
RETURN NEW;
END;
$$;
CREATE TRIGGER outreach_contact_suppress_insert AFTER INSERT ON public.outreach_contacts FOR EACH ROW WHEN (NEW.status='opted_out') EXECUTE FUNCTION public.outreach_contact_suppress_opt_out();
CREATE TRIGGER outreach_contact_suppress_update AFTER UPDATE OF status ON public.outreach_contacts FOR EACH ROW WHEN (NEW.status='opted_out' AND OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.outreach_contact_suppress_opt_out();
REVOKE ALL ON FUNCTION public.outreach_contact_suppress_opt_out() FROM PUBLIC,anon,authenticated;

-- Backfill contacts that opted out before this migration.
INSERT INTO public.outreach_suppressions(tenant_id,email,reason,source)
SELECT DISTINCT ON (c.tenant_id,lower(btrim(c.email))) c.tenant_id,lower(btrim(c.email)),
CASE WHEN EXISTS(SELECT 1 FROM public.outreach_touches x JOIN public.outreach_enrollments e ON e.id=x.enrollment_id AND e.tenant_id=x.tenant_id WHERE e.contact_id=c.id AND x.status='completed' AND x.outcome='not_interested') THEN 'not_interested' ELSE 'manual' END,
'backfill_0006'
FROM public.outreach_contacts c
WHERE c.status='opted_out' AND nullif(lower(btrim(c.email)),'') IS NOT NULL AND position('@' in lower(btrim(c.email)))>1
ORDER BY c.tenant_id,lower(btrim(c.email)),EXISTS(SELECT 1 FROM public.outreach_touches x JOIN public.outreach_enrollments e ON e.id=x.enrollment_id AND e.tenant_id=x.tenant_id WHERE e.contact_id=c.id AND x.status='completed' AND x.outcome='not_interested') DESC
ON CONFLICT (tenant_id,lower(email)) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.outreach_contacts c
             WHERE c.status='opted_out' AND nullif(lower(btrim(c.email)),'') IS NOT NULL AND position('@' in lower(btrim(c.email)))>1
               AND NOT EXISTS (SELECT 1 FROM public.outreach_suppressions s WHERE s.tenant_id=c.tenant_id AND lower(s.email)=lower(btrim(c.email)))) THEN
    RAISE EXCEPTION 'Suppression backfill verification failed';
  END IF;
END $$;

-- 0002 body verbatim plus the suppression check. It refuses *activation* (INSERT, or
-- paused->active) only; OLD.status IS DISTINCT FROM 'active' keeps later updates of an
-- already-active enrolment (research writes, reassignment) from raising.
-- CREATE OR REPLACE keeps the existing grants, so nothing is re-granted.
CREATE OR REPLACE FUNCTION public.outreach_validate_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient text; needs_active boolean;
BEGIN
IF NOT EXISTS(SELECT 1 FROM public.outreach_contacts c JOIN public.outreach_campaigns p ON p.id=c.campaign_id WHERE c.id=NEW.contact_id AND p.id=NEW.campaign_id AND c.tenant_id=NEW.tenant_id AND p.tenant_id=NEW.tenant_id) THEN RAISE EXCEPTION 'Contact and campaign must belong to the same organisation'; END IF;
needs_active:=TG_OP='INSERT' OR NEW.status='active';
IF TG_OP='UPDATE' THEN
needs_active:=needs_active OR NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id;
IF (NEW.id,NEW.tenant_id,NEW.campaign_id,NEW.contact_id,NEW.start_on,NEW.contact_timezone) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.campaign_id,OLD.contact_id,OLD.start_on,OLD.contact_timezone) THEN RAISE EXCEPTION 'Cadence identity and schedule are immutable; cancel and enrol again to change them'; END IF;
END IF;
IF needs_active THEN
SELECT m.email INTO recipient FROM public.tenant_memberships m JOIN public.tenants t ON t.id=m.tenant_id WHERE m.user_id=NEW.assigned_user_id AND m.tenant_id=NEW.tenant_id AND m.status='active' AND t.status IN ('ready','active') AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=m.user_id AND r.tenant_id=m.tenant_id AND r.role IN ('staff','admin'));
IF recipient IS NULL OR recipient='' THEN RAISE EXCEPTION 'Assignee must be an active internal teammate with an email'; END IF;
NEW.assigned_email:=recipient;
ELSIF TG_OP='UPDATE' THEN NEW.assigned_email:=OLD.assigned_email;
END IF;
IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.contact_timezone) THEN RAISE EXCEPTION 'Invalid contact timezone'; END IF;
IF NEW.status='active' AND EXISTS(SELECT 1 FROM public.outreach_contacts c WHERE c.id=NEW.contact_id AND c.status IN ('replied','bounced','converted','opted_out')) THEN RAISE EXCEPTION 'A replied, bounced, converted or opted-out contact cannot be enrolled'; END IF;
IF NEW.status='active' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'active') AND EXISTS(SELECT 1 FROM public.outreach_contacts c WHERE c.id=NEW.contact_id AND c.tenant_id=NEW.tenant_id AND public.outreach_email_suppressed(NEW.tenant_id,c.email)) THEN RAISE EXCEPTION 'This address is on the organisation''s outreach suppression list and cannot be enrolled'; END IF;
NEW.updated_at:=now(); RETURN NEW;
END;
$$;
