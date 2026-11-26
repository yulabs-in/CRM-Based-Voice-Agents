-- 0027_agent_outcome_rules.sql: per-agent mapping from call disposition to lead/deal changes.
create table if not exists public.agent_outcome_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.voice_agents(id) on delete cascade,
  disposition text not null,
  lead_status text,
  deal_stage text,
  probability int check (probability between 0 and 100),
  create_lead boolean not null default true,
  create_task boolean not null default true,
  block_contact boolean not null default false,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (agent_id, disposition)
);

alter table public.agent_outcome_rules enable row level security;
create policy "tenant read" on public.agent_outcome_rules
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "admins write" on public.agent_outcome_rules
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','voice_manager']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','voice_manager']::public.org_role[]));

grant select, insert, update, delete on public.agent_outcome_rules to authenticated;
grant all on public.agent_outcome_rules to service_role;

create index if not exists agent_outcome_rules_agent_idx on public.agent_outcome_rules (agent_id);

alter table public.voice_agents add column if not exists lead_columns text[] not null default '{}';
