-- 0021_sales_orders_kyc_payments.sql: sales orders, client KYC, manually recorded payments, renewal reminders.
-- Apply AFTER 0020 has been applied on its own: the policies below use the 'team_lead' role 0020 adds.
--
-- Who can do what:
--   read orders / payments ............ any workspace member
--   create / edit orders, payments, KYC  owner, admin, sales_manager, team_lead, sales_rep
--   read KYC .......................... the same sales roles only (KYC is personal data)
--   delete ............................ owner, admin, sales_manager
-- Rows written from AI calls are inserted by the server (service role), which bypasses RLS.

-- ---------------------------------------------------------------- per-workspace counters (order numbers)
create table if not exists public.org_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  value bigint not null default 0,
  primary key (organization_id, name)
);
alter table public.org_counters enable row level security; -- no policies: only used by the trigger below

create or replace function public.next_org_counter(_org uuid, _name text) returns bigint
language sql security definer set search_path = public as $$
  insert into public.org_counters (organization_id, name, value) values (_org, _name, 1)
  on conflict (organization_id, name) do update set value = public.org_counters.value + 1
  returning value;
$$;
revoke execute on function public.next_org_counter(uuid, text) from public, anon, authenticated;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------- sales orders
create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  call_id uuid references public.calls(id) on delete set null,
  owner_id uuid references auth.users(id) on delete set null default auth.uid(),
  product_type text not null default 'health'
    check (product_type in ('health', 'family_floater', 'term', 'motor', 'other')),
  plan_name text,
  insurer text,
  premium_amount numeric(12, 2) not null default 0 check (premium_amount >= 0),
  sum_insured numeric(14, 2) check (sum_insured is null or sum_insured >= 0),
  payment_frequency text not null default 'yearly'
    check (payment_frequency in ('single', 'monthly', 'quarterly', 'half_yearly', 'yearly')),
  payment_due_date date,
  amount_paid numeric(12, 2) not null default 0, -- kept in step with payments by a trigger
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'issued', 'cancelled')),
  policy_number text,
  policy_start_date date,
  policy_end_date date, -- the renewal date
  renewed_from_order_id uuid references public.sales_orders(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'ai_call')),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_orders_number_unique unique (organization_id, order_number),
  constraint sales_orders_policy_dates check (policy_end_date is null or policy_start_date is null or policy_end_date > policy_start_date)
);
create index if not exists sales_orders_org_created_idx on public.sales_orders (organization_id, created_at desc);
create index if not exists sales_orders_org_renewal_idx on public.sales_orders (organization_id, policy_end_date) where status = 'issued';
create index if not exists sales_orders_contact_idx on public.sales_orders (organization_id, contact_id);
-- One order per AI call, so webhook retries can't create duplicates.
create unique index if not exists sales_orders_one_per_call on public.sales_orders (call_id) where call_id is not null;

create or replace function public.sales_orders_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'SO-' || lpad(public.next_org_counter(new.organization_id, 'sales_order')::text, 5, '0');
  end if;
  return new;
end $$;
drop trigger if exists sales_orders_number on public.sales_orders;
create trigger sales_orders_number before insert on public.sales_orders
  for each row execute function public.sales_orders_before_insert();
drop trigger if exists sales_orders_touch on public.sales_orders;
create trigger sales_orders_touch before update on public.sales_orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- payments (recorded by staff; no gateway yet)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  mode text not null default 'upi' check (mode in ('upi', 'card', 'netbanking', 'cheque', 'cash', 'other')),
  reference text check (reference is null or char_length(reference) <= 80), -- UTR / transaction id only
  status text not null default 'received' check (status in ('received', 'refunded', 'failed')),
  notes text,
  recorded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_org_paid_idx on public.payments (organization_id, paid_on desc);
create index if not exists payments_order_idx on public.payments (sales_order_id);

-- A payment must belong to an order in the same workspace.
create or replace function public.payments_check_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.sales_orders where id = new.sales_order_id and organization_id = new.organization_id) then
    raise exception 'That sales order is not in this workspace';
  end if;
  return new;
end $$;
drop trigger if exists payments_check_order on public.payments;
create trigger payments_check_order before insert or update of sales_order_id, organization_id on public.payments
  for each row execute function public.payments_check_order();
drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- amount_paid = received - refunded, recomputed whenever a payment changes.
create or replace function public.refresh_order_amount_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare _order uuid;
begin
  foreach _order in array array[case when tg_op <> 'INSERT' then old.sales_order_id end, case when tg_op <> 'DELETE' then new.sales_order_id end] loop
    continue when _order is null;
    update public.sales_orders so set amount_paid = coalesce((
      select sum(case p.status when 'received' then p.amount when 'refunded' then -p.amount else 0 end)
      from public.payments p where p.sales_order_id = _order
    ), 0)
    where so.id = _order;
  end loop;
  return null;
end $$;
drop trigger if exists payments_refresh_paid on public.payments;
create trigger payments_refresh_paid after insert or update or delete on public.payments
  for each row execute function public.refresh_order_amount_paid();

-- ---------------------------------------------------------------- client KYC (one record per contact)
create table if not exists public.client_kyc (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  full_name text,
  date_of_birth date,
  email text,
  address_line text,
  city text,
  state text,
  pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  nominee_name text,
  nominee_relation text,
  -- Only a masked PAN is stored (e.g. ABCxxxx4F). The full number is collected later on the insurer's form.
  pan_masked text check (pan_masked is null or pan_masked ~ '^[A-Z]{3}x{4,5}[0-9A-Z]{1,2}$'),
  consent_given boolean not null default false,
  consent_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'collected', 'verified', 'rejected')),
  source text not null default 'manual' check (source in ('manual', 'ai_call')),
  call_id uuid references public.calls(id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_kyc_one_per_contact unique (organization_id, contact_id)
);
create index if not exists client_kyc_org_status_idx on public.client_kyc (organization_id, status, updated_at desc);
drop trigger if exists client_kyc_touch on public.client_kyc;
create trigger client_kyc_touch before update on public.client_kyc
  for each row execute function public.touch_updated_at();

-- Stamp who verified a KYC record and when; clear the stamp if it goes back to another status.
create or replace function public.client_kyc_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    new.verified_by := coalesce(auth.uid(), new.verified_by);
    new.verified_at := now();
  elsif new.status <> 'verified' then
    new.verified_by := null;
    new.verified_at := null;
  end if;
  if new.consent_given and new.consent_at is null then new.consent_at := now(); end if;
  return new;
end $$;
drop trigger if exists client_kyc_verification on public.client_kyc;
create trigger client_kyc_verification before insert or update on public.client_kyc
  for each row execute function public.client_kyc_verification();

-- ---------------------------------------------------------------- renewal reminders
-- One reminder task per order per window (30, 15, 7, 1 days before the policy ends, and 0 = overdue).
create table if not exists public.renewal_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  days_before int not null check (days_before in (0, 1, 7, 15, 30)),
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint renewal_reminders_once unique (sales_order_id, days_before)
);

-- Creates the reminder tasks that are due today. Safe to run any number of times.
create or replace function public.queue_renewal_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  _task uuid;
  _count int := 0;
begin
  for r in
    select so.id, so.organization_id, so.contact_id, so.deal_id, so.owner_id, so.product_type, so.insurer, so.policy_end_date,
           (so.policy_end_date - current_date) as days_left,
           case
             when so.policy_end_date - current_date < 0 then 0
             when so.policy_end_date - current_date <= 1 then 1
             when so.policy_end_date - current_date <= 7 then 7
             when so.policy_end_date - current_date <= 15 then 15
             else 30
           end as bucket,
           coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), 'Client') as client
    from public.sales_orders so
    left join public.contacts c on c.id = so.contact_id
    where so.status = 'issued'
      and so.policy_end_date is not null
      and so.policy_end_date between current_date - 30 and current_date + 30
      and not exists (select 1 from public.sales_orders nxt where nxt.renewed_from_order_id = so.id and nxt.status <> 'cancelled')
  loop
    continue when exists (select 1 from public.renewal_reminders rr where rr.sales_order_id = r.id and rr.days_before = r.bucket);
    insert into public.tasks (organization_id, title, description, due_at, priority, status, contact_id, deal_id, assignee_id, created_by)
    values (
      r.organization_id,
      left(case when r.days_left < 0 then 'Renewal overdue: ' else 'Renewal due in ' || r.days_left || ' day' || case when r.days_left = 1 then '' else 's' end || ': ' end
           || r.client || ' (' || replace(r.product_type, '_', ' ') || coalesce(', ' || r.insurer, '') || ')', 200),
      'Policy ends on ' || to_char(r.policy_end_date, 'DD Mon YYYY') || '. Open Renewals to call the client or record the renewal.',
      now() + interval '1 day',
      case when r.days_left <= 7 then 'high' else 'medium' end,
      'open', r.contact_id, r.deal_id, r.owner_id, null
    ) returning id into _task;
    insert into public.renewal_reminders (organization_id, sales_order_id, days_before, task_id)
    values (r.organization_id, r.id, r.bucket, _task)
    on conflict (sales_order_id, days_before) do nothing;
    _count := _count + 1;
  end loop;
  return _count;
end $$;
revoke execute on function public.queue_renewal_reminders() from public, anon, authenticated;

-- Every day at 03:30 UTC (09:00 IST).
select cron.unschedule(jobid) from cron.job where jobname = 'crm-renewal-reminders';
select cron.schedule('crm-renewal-reminders', '30 3 * * *', $job$ select public.queue_renewal_reminders(); $job$);

-- ---------------------------------------------------------------- grants and row-level security
do $$
declare t text;
begin
  foreach t in array array['sales_orders', 'payments', 'client_kyc', 'renewal_reminders'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "members read orders" on public.sales_orders for select to authenticated
  using (public.is_org_member(organization_id));
create policy "sales write orders" on public.sales_orders for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]));
create policy "sales update orders" on public.sales_orders for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]));
create policy "managers delete orders" on public.sales_orders for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','sales_manager']::public.org_role[]));

create policy "members read payments" on public.payments for select to authenticated
  using (public.is_org_member(organization_id));
create policy "sales write payments" on public.payments for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]));
create policy "sales update payments" on public.payments for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]));
create policy "managers delete payments" on public.payments for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','sales_manager']::public.org_role[]));

create policy "sales read kyc" on public.client_kyc for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]));
create policy "sales write kyc" on public.client_kyc for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]));
create policy "sales update kyc" on public.client_kyc for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]));
create policy "managers delete kyc" on public.client_kyc for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','sales_manager']::public.org_role[]));

create policy "members read reminders" on public.renewal_reminders for select to authenticated
  using (public.is_org_member(organization_id));

-- Live updates in the browser.
do $$
declare t text;
begin
  foreach t in array array['sales_orders', 'payments', 'client_kyc'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
