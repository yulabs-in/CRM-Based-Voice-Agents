create table public.voice_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, language text not null default 'hi-IN', voice text, purpose text, greeting text, instructions text,
  sarvam_agent_id text, status text not null default 'active',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.call_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, agent_id uuid references public.voice_agents(id) on delete set null,
  audience text, status text not null default 'draft', starts_at timestamptz, target_count int not null default 0, notes text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.voice_agents(id) on delete set null,
  campaign_id uuid references public.call_campaigns(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  phone text, direction text not null default 'outbound', status text not null default 'queued',
  started_at timestamptz default now(), duration_seconds int not null default 0,
  recording_url text, transcript text, summary text, sentiment text, outcome text, external_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'workflow', name text not null, trigger_event text, condition text, action text,
  schedule_at timestamptz, status text not null default 'active', notes text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null default 'email', contact_id uuid references public.contacts(id) on delete set null,
  recipient text, subject text, body text, direction text not null default 'outbound', status text not null default 'draft',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null, starts_at timestamptz, duration_minutes int not null default 30, location text,
  contact_id uuid references public.contacts(id) on delete set null, notes text, status text not null default 'scheduled',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['voice_agents','call_campaigns','calls','workflows','messages','meetings'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "tenant read" on public.%I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy "tenant insert" on public.%I for insert to authenticated with check (public.can_write_org(organization_id))', t);
    execute format('create policy "tenant update" on public.%I for update to authenticated using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id))', t);
    execute format('create policy "tenant delete" on public.%I for delete to authenticated using (public.has_org_role(organization_id, array[''owner'',''admin'',''sales_manager'',''voice_manager'']::public.org_role[]))', t);
    execute format('create index on public.%I (organization_id)', t);
  end loop;
end $$;