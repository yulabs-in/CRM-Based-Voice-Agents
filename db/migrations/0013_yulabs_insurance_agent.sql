-- Point the app at the new Sarvam agent "YULabs Insurance — India" (YULabs-Insu-13e07aa4-48c0, committed v1).
-- It was built from public.yulabs_insurance_script() with {var} → {{var}}, every agent variable defaulting to
-- empty (no stale "Yashwanth"), and the output variables listed at the end of the script.
-- The old agent Conversatio-db355446-5fb3 is left untouched on Sarvam.
update public.voice_agents
set sarvam_agent_id = 'YULabs-Insu-13e07aa4-48c0',
    sarvam_app_version = 1,
    updated_at = now()
where sarvam_agent_id = 'Conversatio-db355446-5fb3'
   or name in ('Sarvam Conversation Agent', 'Tarkk.ai');

create or replace function public.create_default_voice_agent(_org uuid, _created_by uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.voice_agents (organization_id, name, purpose, language, status, sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number, greeting, greeting_no_name, instructions, agent_variables, created_by)
  select _org, 'Sarvam Conversation Agent', 'sales', 'en-IN', 'active', 'YULabs-Insu-13e07aa4-48c0', 1, '614a33c8-31-e56314c0-c598', '+918064269483',
         'Hello, am I speaking with {customer_name}?',
         'Hello sir, I''m calling from YULabs Insurance. Are you interested in a better health, life or vehicle insurance plan?',
         public.yulabs_insurance_script(), public.yulabs_insurance_variables(), _created_by
  where not exists (
    select 1 from public.voice_agents
    where organization_id = _org
      and sarvam_agent_id in ('YULabs-Insu-13e07aa4-48c0', 'Conversatio-db355446-5fb3')
  );
$$;
revoke execute on function public.create_default_voice_agent(uuid, uuid) from public, anon, authenticated;
