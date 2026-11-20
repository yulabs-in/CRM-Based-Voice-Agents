
create type public.org_role as enum ('owner','admin','sales_manager','sales_rep','voice_manager','support_agent','analyst','read_only');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, avatar_url text, email text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;
create policy "self read" on public.platform_admins for select to authenticated using (user_id = auth.uid());

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique, industry text, business_type text, website text, phone text, country text, timezone text default 'Asia/Kolkata',
  onboarding_step int not null default 1, onboarding_completed boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role public.org_role not null default 'sales_rep',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
grant select, insert, update, delete on public.memberships to authenticated;
grant all on public.memberships to service_role;
alter table public.memberships enable row level security;

create or replace function public.is_org_member(_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where organization_id = _org and user_id = auth.uid())
$$;
create or replace function public.has_org_role(_org uuid, _roles public.org_role[]) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where organization_id = _org and user_id = auth.uid() and role = any(_roles))
$$;
create or replace function public.can_write_org(_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where organization_id = _org and user_id = auth.uid() and role not in ('read_only','analyst'))
$$;

create policy "profiles self or teammates" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (select 1 from public.memberships m1 join public.memberships m2 on m1.organization_id = m2.organization_id where m1.user_id = auth.uid() and m2.user_id = profiles.id));
create policy "profiles self insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid());

create policy "org members read" on public.organizations for select to authenticated using (public.is_org_member(id) or created_by = auth.uid());
create policy "org create" on public.organizations for insert to authenticated with check (created_by = auth.uid());
create policy "org admins update" on public.organizations for update to authenticated using (public.has_org_role(id, array['owner','admin']::public.org_role[]));
create policy "org owner delete" on public.organizations for delete to authenticated using (public.has_org_role(id, array['owner']::public.org_role[]));

create policy "members read" on public.memberships for select to authenticated using (public.is_org_member(organization_id));
create policy "admins manage members" on public.memberships for all to authenticated using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[])) with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- creator becomes owner
create or replace function public.handle_new_org() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.memberships(organization_id, user_id, role) values (new.id, new.created_by, 'owner'); return new; end $$;
create trigger on_org_created after insert on public.organizations for each row execute function public.handle_new_org();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id, email, full_name, avatar_url) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), new.raw_user_meta_data->>'avatar_url') on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null, role public.org_role not null default 'sales_rep',
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending', invited_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.invitations to authenticated;
grant all on public.invitations to service_role;
alter table public.invitations enable row level security;
create policy "admins manage invites" on public.invitations for all to authenticated using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[])) with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
create policy "invitee reads own" on public.invitations for select to authenticated using (lower(email) = lower(auth.jwt()->>'email'));

create or replace function public.accept_invitation(_token uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations where token = _token and status = 'pending';
  if inv.id is null or lower(inv.email) <> lower(auth.jwt()->>'email') then raise exception 'Invalid invitation'; end if;
  insert into public.memberships(organization_id, user_id, role) values (inv.organization_id, auth.uid(), inv.role) on conflict (organization_id, user_id) do nothing;
  update public.invitations set status = 'accepted' where id = inv.id;
  return inv.organization_id;
end $$;

-- CRM tables
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, industry text, website text, phone text, city text, size text,
  owner_id uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  first_name text not null, last_name text, email text, phone text, job_title text, city text,
  status text not null default 'active', source text, tags text[] not null default '{}',
  owner_id uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  name text not null, email text, phone text, company_name text,
  status text not null default 'new', source text, score int not null default 0, value numeric not null default 0,
  owner_id uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  title text not null, value numeric not null default 0,
  stage text not null default 'qualification', probability int not null default 10, expected_close date,
  owner_id uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null, description text, due_at timestamptz, priority text not null default 'medium', status text not null default 'open',
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  assignee_id uuid default auth.uid(), created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['companies','contacts','leads','deals','tasks'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "tenant read" on public.%I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy "tenant insert" on public.%I for insert to authenticated with check (public.can_write_org(organization_id))', t);
    execute format('create policy "tenant update" on public.%I for update to authenticated using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id))', t);
    execute format('create policy "tenant delete" on public.%I for delete to authenticated using (public.has_org_role(organization_id, array[''owner'',''admin'',''sales_manager'']::public.org_role[]))', t);
    execute format('create index on public.%I (organization_id)', t);
  end loop;
end $$;
