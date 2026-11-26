-- 0027_meetings_from_calls.sql: link meetings to calls/deals/owners so AI-booked consultations can be created
alter table public.meetings
  add column if not exists deal_id uuid references public.deals(id) on delete set null,
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists call_id uuid references public.calls(id) on delete set null,
  add column if not exists source text not null default 'manual' check (source in ('manual', 'call')),
  add column if not exists external_event_id text;

-- Full unique index (NULLs are distinct in Postgres) so PostgREST ON CONFLICT (call_id) DO NOTHING works
create unique index if not exists meetings_call_id_key on public.meetings (call_id);
create index if not exists meetings_owner_starts_idx on public.meetings (organization_id, owner_id, starts_at) where owner_id is not null;

alter table public.organizations
  add column if not exists meeting_assignment jsonb not null default '{"mode":"deal_owner_then_round_robin","role":"sales_rep"}'::jsonb;
