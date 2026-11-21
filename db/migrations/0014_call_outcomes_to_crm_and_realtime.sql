-- Call outcomes flow into Leads, Deals and the Sales Pipeline automatically, and the app updates live.

-- Set once a finished call's outcome has been applied to the CRM (claim marker, so it runs exactly once).
alter table public.calls add column if not exists crm_synced_at timestamptz;

-- Which call last changed a lead / deal (shown as the source of the update).
alter table public.leads add column if not exists last_call_id uuid references public.calls(id) on delete set null;
alter table public.deals add column if not exists last_call_id uuid references public.calls(id) on delete set null;

create index if not exists calls_crm_pending_idx on public.calls (organization_id, updated_at) where crm_synced_at is null and status = 'completed';
create index if not exists leads_org_contact_idx on public.leads (organization_id, contact_id);
create index if not exists deals_org_contact_idx on public.deals (organization_id, contact_id);

-- Realtime: the browser subscribes to row changes (RLS still decides who sees what) instead of waiting for a refresh.
do $$
declare t text;
begin
  foreach t in array array['calls', 'leads', 'deals', 'contacts', 'tasks', 'call_campaigns', 'campaign_targets'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
