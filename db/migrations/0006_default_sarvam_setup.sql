-- Default Sarvam setup for every workspace (keep in sync with src/lib/sarvam-defaults.ts).
-- New workspaces get the Sarvam org/workspace IDs and a ready-to-use voice agent; existing ones are backfilled.

alter table public.organizations
  alter column sarvam_organization_id set default '019e90bb-4638-7c0c-8779-3b46919584f2',
  alter column sarvam_workspace_id set default '019e90bb-466e-7199-9d47-d08cbf9eb144';

update public.organizations set sarvam_organization_id = '019e90bb-4638-7c0c-8779-3b46919584f2' where coalesce(trim(sarvam_organization_id), '') = '';
update public.organizations set sarvam_workspace_id = '019e90bb-466e-7199-9d47-d08cbf9eb144' where coalesce(trim(sarvam_workspace_id), '') = '';

create or replace function public.create_default_voice_agent(_org uuid, _created_by uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.voice_agents (organization_id, name, purpose, language, status, sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number, created_by)
  select _org, 'Sarvam Conversation Agent', 'support', 'en-IN', 'active', 'Conversatio-db355446-5fb3', 1, '614a33c8-31-e56314c0-c598', '+918064269483', _created_by
  where not exists (select 1 from public.voice_agents where organization_id = _org and sarvam_agent_id = 'Conversatio-db355446-5fb3');
$$;

-- Existing on_org_created trigger makes the creator the owner; also give the workspace the default agent.
create or replace function public.handle_new_org() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.memberships(organization_id, user_id, role) values (new.id, new.created_by, 'owner');
  perform public.create_default_voice_agent(new.id, new.created_by);
  return new;
end $$;

select public.create_default_voice_agent(id, created_by) from public.organizations;

revoke execute on function public.create_default_voice_agent(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_org() from public, anon, authenticated;
