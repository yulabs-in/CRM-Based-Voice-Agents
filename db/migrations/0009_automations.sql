-- Automations: workflows = trigger + rules (conditions) + actions, plus a run log.
-- Triggers fire server-side when Sarvam reports call results / campaigns finish / contacts are imported.

alter table public.workflows
  add column trigger jsonb not null default '{"event":"call.completed"}',
  add column conditions jsonb not null default '[]',
  add column match text not null default 'all' check (match in ('all', 'any')),
  add column actions jsonb not null default '[]',
  add column project_id uuid references public.projects(id) on delete set null,
  add column campaign_id uuid references public.call_campaigns(id) on delete set null,
  add column run_count int not null default 0,
  add column last_run_at timestamptz;

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid references public.workflows(id) on delete cascade,
  event text not null,
  call_id uuid references public.calls(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_id uuid references public.call_campaigns(id) on delete set null,
  matched boolean not null default true,
  status text not null default 'success' check (status in ('success', 'partial', 'failed', 'skipped')),
  results jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now()
);
create index workflow_runs_org_created_idx on public.workflow_runs (organization_id, created_at desc);
create index workflow_runs_workflow_idx on public.workflow_runs (workflow_id, created_at desc);
-- One run per workflow per call, so webhook retries don't repeat actions.
create unique index workflow_runs_once_per_call on public.workflow_runs (workflow_id, call_id, event);

grant select, insert, update, delete on public.workflow_runs to authenticated;
grant all on public.workflow_runs to service_role;
alter table public.workflow_runs enable row level security;
create policy "tenant read" on public.workflow_runs for select to authenticated using (public.is_org_member(organization_id));
create policy "tenant delete" on public.workflow_runs for delete to authenticated using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- A campaign created by an automation (e.g. scheduled callback) remembers where it came from.
alter table public.call_campaigns add column source text not null default 'manual' check (source in ('manual', 'scheduled', 'automation'));
