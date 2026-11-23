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
NEW.updated_at:=now(); RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.outreach_finish_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status AND (NEW.outcome IN ('replied','positive','maybe','not_interested') OR nullif(trim(NEW.reply_word_for_word),'') IS NOT NULL) THEN
UPDATE public.outreach_contacts c SET status=CASE WHEN NEW.outcome='not_interested' THEN 'opted_out' ELSE 'replied' END, replied_at=CASE WHEN NEW.outcome='not_interested' THEN c.replied_at ELSE now() END,reply_snippet=coalesce(NEW.reply_word_for_word,c.reply_snippet)
FROM public.outreach_enrollments e WHERE e.id=NEW.enrollment_id AND c.id=e.contact_id AND c.tenant_id=NEW.tenant_id;
ELSIF NEW.status IN ('completed','skipped') AND NOT EXISTS(SELECT 1 FROM public.outreach_touches WHERE enrollment_id=NEW.enrollment_id AND status NOT IN ('completed','skipped')) THEN
UPDATE public.outreach_enrollments SET status='completed' WHERE id=NEW.enrollment_id AND tenant_id=NEW.tenant_id AND status='active';
END IF; RETURN NEW;
END;
$$;