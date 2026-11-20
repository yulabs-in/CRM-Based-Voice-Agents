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
ALTER TABLE public.calls
  ADD COLUMN is_test_call boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX calls_one_time_test_number_idx
  ON public.calls (organization_id, phone)
  WHERE is_test_call = true;

-- private bucket used by the call webhook (missing from the Lovable migrations)
INSERT INTO storage.buckets (id, name, public) VALUES ('call-recordings', 'call-recordings', false) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Workspace members can read their call recordings"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND CASE
    WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.is_org_member(split_part(name, '/', 1)::uuid)
    ELSE false
  END
);DROP INDEX IF EXISTS public.calls_one_test_call_per_number;
CREATE UNIQUE INDEX calls_one_test_call_per_number ON public.calls (organization_id, phone) WHERE is_test_call = true AND status <> 'failed';DROP INDEX IF EXISTS public.calls_one_test_call_per_number;