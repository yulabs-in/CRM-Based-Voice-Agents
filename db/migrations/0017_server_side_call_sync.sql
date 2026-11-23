-- Server-side call sync: every minute, Supabase calls the deployed app's /api/public/cron-sync, which pulls
-- call results from Sarvam, applies outcomes to leads/deals and saves recordings — even when nobody has the
-- app open. (The Sarvam webhook is still the instant path; this is the safety net.)
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Shared token: generated here, kept in Supabase Vault for the cron job; the app only stores its SHA-256.
create table if not exists public.cron_state (
  id int primary key default 1 check (id = 1),
  token_hash text not null,
  last_run_at timestamptz
);
alter table public.cron_state enable row level security; -- no policies: only the service role reads it

do $$
declare token text;
begin
  if not exists (select 1 from vault.secrets where name = 'crm_cron_token') then
    token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(token, 'crm_cron_token', 'Token the pg_cron job sends to /api/public/cron-sync');
    insert into public.cron_state (id, token_hash) values (1, encode(extensions.digest(token, 'sha256'), 'hex'))
    on conflict (id) do update set token_hash = excluded.token_hash;
  end if;
end $$;

-- Replace any earlier schedule with the same name, then run every minute (Netlify free tier friendly).
select cron.unschedule(jobid) from cron.job where jobname = 'crm-sarvam-sync';
select cron.schedule(
  'crm-sarvam-sync',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://yulabs-crm-1122.netlify.app/api/public/cron-sync',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'crm_cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $job$
);
