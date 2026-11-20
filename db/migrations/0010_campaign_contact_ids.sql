-- A campaign can target specific contacts (scheduled calls, automation callbacks) instead of a whole project.
alter table public.call_campaigns add column contact_ids uuid[];
