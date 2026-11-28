-- 0034_dnc_registry.sql: phone-level do-not-contact registry, append-only compliance audit log,
-- campaign_targets 'skipped' status, and backfill of existing do-not-call contacts.

-- Normalise stored contact phone numbers to E.164 (matches normalizePhoneNumber in src/lib/sarvam-call.ts).
create or replace function public.normalize_phone_e164(_raw text) returns text
language plpgsql immutable set search_path = public as $$
declare
  compact text;
  digits text;
begin
  compact := regexp_replace(btrim(coalesce(_raw, '')), '[\s().-]+', '', 'g');
  if compact ~ '^\+[1-9][0-9]{7,14}$' then
    return compact;
  end if;
  digits := regexp_replace(compact, '[^0-9]', '', 'g');
  if digits ~ '^[6-9][0-9]{9}$' then
    return '+91' || digits;
  end if;
  if digits ~ '^0[6-9][0-9]{9}$' then
    return '+91' || substring(digits from 2);
  end if;
  if digits ~ '^91[6-9][0-9]{9}$' then
    return '+' || digits;
  end if;
  return null;
end $$;
revoke execute on function public.normalize_phone_e164(text) from public, anon;

-- ---------------------------------------------------------------- phone-level DNC registry
create table if not exists public.dnc_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_e164 text not null,
  reason text,
  source text not null default 'manual' check (source in ('call', 'manual', 'import')),
  call_id uuid references public.calls(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid,
  removed_reason text
);

create unique index if not exists dnc_numbers_active_key
  on public.dnc_numbers (organization_id, phone_e164)
  where removed_at is null;

create index if not exists dnc_numbers_org_created_idx
  on public.dnc_numbers (organization_id, created_at desc);

alter table public.dnc_numbers enable row level security;
grant select, insert, update on public.dnc_numbers to authenticated;
grant all on public.dnc_numbers to service_role;

drop policy if exists "tenant read dnc_numbers" on public.dnc_numbers;
drop policy if exists "tenant insert dnc_numbers" on public.dnc_numbers;
drop policy if exists "tenant update dnc_numbers" on public.dnc_numbers;

create policy "tenant read dnc_numbers"
  on public.dnc_numbers for select to authenticated
  using (public.is_org_member(organization_id));

create policy "tenant insert dnc_numbers"
  on public.dnc_numbers for insert to authenticated
  with check (public.can_write_org(organization_id));

create policy "tenant update dnc_numbers"
  on public.dnc_numbers for update to authenticated
  using (public.can_write_org(organization_id))
  with check (public.can_write_org(organization_id));

-- ---------------------------------------------------------------- append-only compliance audit log
create table if not exists public.compliance_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_e164 text,
  contact_id uuid references public.contacts(id) on delete set null,
  event text not null check (event in ('consent_given', 'opt_out', 'blocked', 'reactivated', 'blocked_attempt')),
  actor uuid,
  call_id uuid references public.calls(id) on delete set null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists compliance_log_org_time_idx
  on public.compliance_log (organization_id, created_at desc);

create index if not exists compliance_log_org_event_idx
  on public.compliance_log (organization_id, event, created_at desc);

-- Append-only: members read their org's log; inserts only via service_role (never forgeable or editable from browser).
alter table public.compliance_log enable row level security;
grant select on public.compliance_log to authenticated;
grant all on public.compliance_log to service_role;

drop policy if exists "tenant read compliance_log" on public.compliance_log;
create policy "tenant read compliance_log"
  on public.compliance_log for select to authenticated
  using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------- allow 'skipped' on campaign_targets
alter table public.campaign_targets drop constraint if exists campaign_targets_status_check;
alter table public.campaign_targets add constraint campaign_targets_status_check
  check (status in ('pending', 'queued', 'calling', 'retrying', 'completed', 'no_answer', 'busy', 'failed', 'excluded', 'skipped'));

-- ---------------------------------------------------------------- Realtime publication
do $$
declare t text;
begin
  foreach t in array array['dnc_numbers', 'compliance_log'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- backfill existing do-not-call contacts
with backfilled as (
  insert into public.dnc_numbers (organization_id, phone_e164, reason, source, created_at)
  select distinct on (c.organization_id, public.normalize_phone_e164(c.phone))
    c.organization_id,
    public.normalize_phone_e164(c.phone),
    'Backfilled from do-not-call contacts',
    'call',
    coalesce(c.updated_at, c.created_at, now())
  from public.contacts c
  where c.status = 'inactive'
    and 'do-not-call' = any(c.tags)
    and c.phone is not null
    and public.normalize_phone_e164(c.phone) is not null
  order by c.organization_id, public.normalize_phone_e164(c.phone), c.updated_at desc nulls last
  on conflict (organization_id, phone_e164) where removed_at is null do nothing
  returning organization_id, phone_e164, created_at
)
insert into public.compliance_log (organization_id, phone_e164, event, details, created_at)
select
  b.organization_id,
  b.phone_e164,
  'opt_out',
  jsonb_build_object('source', 'backfill', 'reason', 'Backfilled from do-not-call contacts'),
  b.created_at
from backfilled b;
