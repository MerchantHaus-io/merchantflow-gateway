DO $$
DECLARE
  t text;
  tabs text[] := ARRAY[
    -- activity / collaboration
    'activities','action_items','tasks','shared_todos','agenda_items','comments',
    'audit_entries','deletion_requests','sop_change_requests','team_roster',
    'user_favorites','user_sessions','scoping_submissions','terminal_updates',
    'partner_leads','lead_referrers',
    -- messaging / comms
    'notifications','chat_channels','chat_messages','direct_messages','message_reactions',
    'message_logs','synced_emails','push_subscriptions','broadcast_acknowledgments',
    'admin_popups','admin_popup_acknowledgments','outreach_campaigns','outreach_contacts',
    'cadence_steps','office_avatars','support_tickets','support_ticket_comments',
    -- quoting / billing / commissions
    'quotes','quote_acceptances','billing_documents','commission_periods','commission_records',
    'commission_sync_logs','nmi_partner_residuals','referrers','referrer_ledger_entries',
    'referrer_payout_runs','referrer_impersonation_logs',
    -- integrations
    'kurv_api_tokens','kurv_merchants','kurv_deal_submissions','kurv_sync_logs',
    'kurv_transactions_daily','google_calendar_tokens'
  ];
BEGIN
  FOREACH t IN ARRAY tabs LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='tenant_id'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid', t);
    EXECUTE format('UPDATE public.%I SET tenant_id = public.default_tenant_id() WHERE tenant_id IS NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.default_tenant_id()', t);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)',
      t, t || '_tenant_id_fkey');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', 'idx_' || t || '_tenant_id', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default()',
      'set_tenant_id_' || t, t);
  END LOOP;
END $$;