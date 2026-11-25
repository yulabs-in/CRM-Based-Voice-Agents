-- 0019_notifications.sql: per-user in-app notifications, delivered live via Supabase Realtime
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  priority text not null default 'normal' check (priority in ('normal','high')),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create unique index if not exists notifications_dedupe_key on public.notifications (user_id, dedupe_key);

alter table public.notifications enable row level security;

create policy "own read" on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy "own mark read" on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

alter publication supabase_realtime add table public.notifications;
