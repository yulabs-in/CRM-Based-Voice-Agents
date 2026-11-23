-- Second voice agent: "Stock Market Advisory — India" (Sarvam agent Stock-Marke-53bad6ec-5d28, committed v1).
-- Built on Sarvam from the insurance agent's voice/telephony setup with a SEBI-safe stock-market script.
-- Company facts are fixed per agent ("=value" sources, sent on every call). They start EMPTY on purpose:
-- the agent never claims a SEBI registration, services or fees it was not given. Fill them in on the
-- Voice Agents page (agent_variables) once the verified details are available.
insert into public.voice_agents (
  organization_id, name, purpose, language, status,
  sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number,
  greeting, greeting_no_name, instructions, agent_variables, created_by
)
select o.id, 'Stock Market Advisory', 'sales', 'en-IN', 'active',
       'Stock-Marke-53bad6ec-5d28', 1, '614a33c8-31-e56314c0-c598', '+918064269483',
       'Hello! Am I speaking with {customer_name}?',
       'Hello! I''m an AI voice assistant calling about stock market research services you had shown interest in. Is this a good time to talk?',
       'Script lives on the Sarvam agent Stock-Marke-53bad6ec-5d28 (v1). Discovers needs (market, experience, style, challenge), explains approved services only, handles objections, books a consultation with an authorised professional. Never guarantees returns, gives stock tips or personalised advice, asks for OTPs/credentials, or claims a SEBI registration unless company facts are filled. English, Hindi, Telugu. Outputs: disposition (interested, consultation_booked, follow_up_required, callback, not_interested, do_not_contact, escalated, wrong_person, busy, no_answer), summary, preferred_language, experience_level, market_interest, trading_style, main_challenge, service_interest, consultation_mode, follow_up_time, next_action, objections, consent_to_share, escalation_reason.',
       jsonb_build_object(
         'customer_name', 'full_name',
         'lead_interest', 'custom.market_interest',
         'company_name', '=',
         'sebi_category', '=',
         'sebi_registration_number', '=',
         'approved_services', '=',
         'fee_details', '=',
         'company_website', '=',
         'business_hours', '='
       ),
       null
from public.organizations o
where not exists (
  select 1 from public.voice_agents v where v.organization_id = o.id and v.sarvam_agent_id = 'Stock-Marke-53bad6ec-5d28'
);
