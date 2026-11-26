-- 0027_usage_settings.sql: per-workspace calling rates, monthly budget, and usage_summary RPC

create table if not exists public.usage_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  cost_per_minute numeric(10,2) not null default 0,
  cost_per_attempt numeric(10,2) not null default 0,
  currency text not null default 'INR',
  monthly_budget numeric(12,2),
  hard_stop boolean not null default false,
  rounding text not null default 'per_call_minute' check (rounding in ('per_call_minute', 'exact')),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.usage_settings enable row level security;

create policy "members read usage settings"
  on public.usage_settings for select to authenticated
  using (public.is_org_member(organization_id));

create policy "admins insert usage settings"
  on public.usage_settings for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy "admins update usage settings"
  on public.usage_settings for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

grant select, insert, update on public.usage_settings to authenticated;
grant all on public.usage_settings to service_role;

create or replace function public.usage_summary(
  org uuid,
  from_ts timestamptz,
  to_ts timestamptz
)
returns table (
  day date,
  agent_id uuid,
  campaign_id uuid,
  attempts bigint,
  connected bigint,
  seconds bigint,
  billable_minutes bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (coalesce(c.started_at, c.created_at) at time zone 'Asia/Kolkata')::date as day,
    c.agent_id,
    c.campaign_id,
    count(*)::bigint as attempts,
    count(*) filter (where c.status = 'completed')::bigint as connected,
    coalesce(sum(coalesce(c.duration_seconds, 0)), 0)::bigint as seconds,
    coalesce(
      sum(
        case
          when coalesce(c.duration_seconds, 0) <= 0 then 0
          else ceil(c.duration_seconds / 60.0)
        end
      ),
      0
    )::bigint as billable_minutes
  from public.calls c
  where c.organization_id = org
    and public.is_org_member(org)
    and coalesce(c.started_at, c.created_at) >= from_ts
    and coalesce(c.started_at, c.created_at) < to_ts
  group by 1, 2, 3
  order by 1 asc;
$$;

grant execute on function public.usage_summary(uuid, timestamptz, timestamptz) to authenticated, service_role;
