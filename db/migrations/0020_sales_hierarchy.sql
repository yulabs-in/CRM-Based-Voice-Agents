-- 0020_sales_hierarchy.sql: sales reporting lines (Sales Manager > Team Lead > Sales Representative).
-- Run this file ON ITS OWN, before 0021. Postgres won't let a new enum value be used in the same
-- transaction that adds it, and 0021's policies use 'team_lead'.
-- (0019 is taken by the notifications PR, #14.)

alter type public.org_role add value if not exists 'team_lead' after 'sales_manager';

-- Who each member reports to, inside the same workspace. Null = top of the tree.
alter table public.memberships
  add column if not exists reports_to uuid references auth.users(id) on delete set null;

alter table public.memberships drop constraint if exists memberships_not_self_report;
alter table public.memberships
  add constraint memberships_not_self_report check (reports_to is null or reports_to <> user_id);

create index if not exists memberships_reports_to_idx on public.memberships (organization_id, reports_to);

-- reports_to must point at a member of the same workspace, and must not create a loop (A > B > A).
create or replace function public.check_reports_to() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reports_to is null then return new; end if;
  if not exists (
    select 1 from public.memberships where organization_id = new.organization_id and user_id = new.reports_to
  ) then
    raise exception 'reports_to must be a member of the same workspace';
  end if;
  if exists (
    with recursive chain(user_id, depth) as (
      select new.reports_to, 1
      union all
      select m.reports_to, c.depth + 1
      from chain c join public.memberships m on m.organization_id = new.organization_id and m.user_id = c.user_id
      where m.reports_to is not null and c.depth < 50
    )
    select 1 from chain where user_id = new.user_id
  ) then
    raise exception 'That reporting line would create a loop';
  end if;
  return new;
end $$;

drop trigger if exists memberships_check_reports_to on public.memberships;
create trigger memberships_check_reports_to before insert or update of reports_to on public.memberships
  for each row execute function public.check_reports_to();

-- When someone leaves, their direct reports move up to that person's own manager.
create or replace function public.reassign_reports_on_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.memberships set reports_to = old.reports_to
  where organization_id = old.organization_id and reports_to = old.user_id;
  return old;
end $$;

drop trigger if exists memberships_reassign_reports on public.memberships;
create trigger memberships_reassign_reports after delete on public.memberships
  for each row execute function public.reassign_reports_on_leave();
