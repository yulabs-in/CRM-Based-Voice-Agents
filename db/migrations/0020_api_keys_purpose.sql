-- 0020_api_keys_purpose.sql: separate REST API keys from MCP keys
alter table public.api_keys
  add column if not exists purpose text not null default 'api'
  check (purpose in ('api', 'mcp'));

create index if not exists api_keys_org_purpose_idx
  on public.api_keys (organization_id, purpose);