-- Projects (inside a workspace/organization), file imports, project-based Sarvam campaigns,
-- per-contact campaign targets, and richer call results (answers, transcript turns, recordings).

-- Repeat test calls must be allowed; the app itself prevents two active calls to one number.
drop index if exists public.calls_one_time_test_number_idx;

-- Projects --------------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  source text not null default 'manual' check (source in ('manual', 'csv', 'xlsx')),
  contact_count int not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  file_name text not null,
  file_path text,
  file_type text not null check (file_type in ('csv', 'xlsx')),
  column_mapping jsonb not null default '{}',
  total_rows int not null default 0,
  inserted int not null default 0,
  skipped int not null default 0,
  errors jsonb not null default '[]',
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts
  add column project_id uuid references public.projects(id) on delete set null,
  add column custom_fields jsonb not null default '{}';
create index contacts_project_id_idx on public.contacts (project_id);
-- Non-partial so PostgREST upserts can target it; NULLs never conflict.
create unique index contacts_project_phone_uniq on public.contacts (project_id, phone);

-- Campaigns -------------------------------------------------------------------------------
alter table public.call_campaigns
  add column project_id uuid references public.projects(id) on delete set null,
  add column sarvam_campaign_id text,
  add column sarvam_cohort_ids text[] not null default '{}',
  add column allowed_start_time text not null default '09:00',
  add column allowed_end_time text not null default '21:00',
  add column allowed_days text[] not null default array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  add column timezone text not null default 'Asia/Kolkata',
  add column max_retries int not null default 2 check (max_retries between 0 and 20),
  add column retry_interval_minutes int not null default 60 check (retry_interval_minutes > 0),
  add column attempts_per_second numeric not null default 1 check (attempts_per_second between 0.1 and 500),
  add column ends_at timestamptz,
  add column webhook_token_hash text,
  add column consent_confirmed boolean not null default false,
  add column launched_at timestamptz,
  add column last_error text;
create index call_campaigns_project_id_idx on public.call_campaigns (project_id);

create table public.campaign_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.call_campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  phone text not null,
  status text not null default 'pending'
    check (status in ('pending', 'queued', 'calling', 'retrying', 'completed', 'no_answer', 'busy', 'failed', 'excluded')),
  attempts int not null default 0,
  last_call_id uuid,
  answers jsonb not null default '{}',
  last_outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);
create index campaign_targets_campaign_status_idx on public.campaign_targets (campaign_id, status);

-- Calls -----------------------------------------------------------------------------------
alter table public.calls
  add column answers jsonb not null default '{}',
  add column transcript_turns jsonb,
  add column recording_path text,
  add column retry_attempt int not null default 0,
  add column sarvam_campaign_id text,
  add column campaign_target_id uuid references public.campaign_targets(id) on delete set null,
  add column ended_at timestamptz;
create unique index calls_org_external_id_uniq on public.calls (organization_id, external_id);
create index calls_campaign_id_idx on public.calls (campaign_id);

-- Existing rows saved by the old webhook only ever pointed at this path.
update public.calls set recording_path = organization_id::text || '/' || id::text || '.wav'
where recording_url is not null and recording_path is null;

-- RLS for new tenant tables (same pattern as the existing CRM tables) ---------------------
do $$ declare t text; begin
  foreach t in array array['projects', 'imports', 'campaign_targets'] loop
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

-- Keep projects.contact_count accurate however contacts change (statement-level so bulk imports stay fast).
create or replace function public.refresh_project_contact_counts(_projects uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.projects p set contact_count = (select count(*) from public.contacts c where c.project_id = p.id), updated_at = now()
  where p.id = any(_projects);
$$;
create or replace function public.contacts_project_count_ins() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.refresh_project_contact_counts(array(select distinct project_id from new_rows where project_id is not null)); return null; end $$;
create or replace function public.contacts_project_count_del() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.refresh_project_contact_counts(array(select distinct project_id from old_rows where project_id is not null)); return null; end $$;
create or replace function public.contacts_project_count_upd() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.refresh_project_contact_counts(array(
  select project_id from new_rows where project_id is not null union select project_id from old_rows where project_id is not null)); return null; end $$;
create trigger contacts_project_count_ins after insert on public.contacts referencing new table as new_rows
  for each statement execute function public.contacts_project_count_ins();
create trigger contacts_project_count_del after delete on public.contacts referencing old table as old_rows
  for each statement execute function public.contacts_project_count_del();
create trigger contacts_project_count_upd after update on public.contacts referencing old table as old_rows new table as new_rows
  for each statement execute function public.contacts_project_count_upd();

-- Private storage for original import files: {organization_id}/{import_id}/{file} ---------
insert into storage.buckets (id, name, public) values ('imports', 'imports', false) on conflict (id) do nothing;

create policy "Workspace members can read their import files" on storage.objects for select to authenticated using (
  bucket_id = 'imports' and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_org_member(split_part(name, '/', 1)::uuid) else false end);
create policy "Workspace writers can upload import files" on storage.objects for insert to authenticated with check (
  bucket_id = 'imports' and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.can_write_org(split_part(name, '/', 1)::uuid) else false end);

-- Trigger functions must not be callable through the REST API (Supabase advisor 0028/0029).
revoke execute on function public.handle_new_org() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.refresh_project_contact_counts(uuid[]) from public, anon, authenticated;
revoke execute on function public.contacts_project_count_ins() from public, anon, authenticated;
revoke execute on function public.contacts_project_count_del() from public, anon, authenticated;
revoke execute on function public.contacts_project_count_upd() from public, anon, authenticated;
