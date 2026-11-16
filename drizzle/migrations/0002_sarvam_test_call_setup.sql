ALTER TABLE public.organizations
  ADD COLUMN sarvam_organization_id text,
  ADD COLUMN sarvam_workspace_id text;

ALTER TABLE public.voice_agents
  ADD COLUMN sarvam_app_version integer NOT NULL DEFAULT 1,
  ADD COLUMN sarvam_connection_id text,
  ADD COLUMN sarvam_agent_phone_number text;

ALTER TABLE public.calls
  ADD COLUMN sarvam_interaction_id text,
  ADD COLUMN sarvam_failure_reason text,
  ADD COLUMN sarvam_status text,
  ADD COLUMN webhook_token_hash text;
