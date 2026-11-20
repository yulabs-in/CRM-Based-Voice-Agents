-- Sarvam agent Conversatio-db355446-5fb3 published version 7; make it the default and move existing agents on 6 to it.
create or replace function public.create_default_voice_agent(_org uuid, _created_by uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.voice_agents (organization_id, name, purpose, language, status, sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number, created_by)
  select _org, 'Sarvam Conversation Agent', 'support', 'en-IN', 'active', 'Conversatio-db355446-5fb3', 7, '614a33c8-31-e56314c0-c598', '+918064269483', _created_by
  where not exists (select 1 from public.voice_agents where organization_id = _org and sarvam_agent_id = 'Conversatio-db355446-5fb3');
$$;
revoke execute on function public.create_default_voice_agent(uuid, uuid) from public, anon, authenticated;

update public.voice_agents set sarvam_app_version = 7, updated_at = now()
where sarvam_agent_id = 'Conversatio-db355446-5fb3' and sarvam_app_version < 7;
