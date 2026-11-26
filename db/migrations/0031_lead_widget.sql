-- 0031_lead_widget.sql: per-workspace website lead-capture widget settings

create table if not exists public.widget_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  widget_key text not null unique,
  allowed_domains text[] not null default '{}',
  project_id uuid references public.projects(id) on delete set null,
  agent_id uuid references public.voice_agents(id) on delete set null,
  instant_callback boolean not null default false,
  calling_hours jsonb not null default '{"start":"09:00","end":"20:00","tz":"Asia/Kolkata"}',
  appearance jsonb not null default '{"colour":"#6d28d9","title":"Get a call back","button":"Call me"}',
  privacy_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.widget_settings enable row level security;

create policy "members read widget settings"
  on public.widget_settings for select to authenticated
  using (public.is_org_member(organization_id));

create policy "admins insert widget settings"
  on public.widget_settings for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

create policy "admins update widget settings"
  on public.widget_settings for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.org_role[]));

grant select, insert, update on public.widget_settings to authenticated;
grant all on public.widget_settings to service_role;
