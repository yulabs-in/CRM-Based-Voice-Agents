-- 0018_api_keys.sql: per-workspace API keys (only the SHA-256 of the key is stored)
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_org_idx on public.api_keys (organization_id);

alter table public.api_keys enable row level security;

create policy "admins read keys" on public.api_keys for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

create policy "admins create keys" on public.api_keys for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

create policy "admins revoke keys" on public.api_keys for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

grant select, insert, update on public.api_keys to authenticated;
grant all on public.api_keys to service_role;