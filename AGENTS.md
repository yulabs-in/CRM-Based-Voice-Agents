# Yulabs CRM — notes for coding agents

This repo is **standalone** (no longer managed by Lovable). The database is the Supabase project `nzjbalwmyuaujacmvxvx` (yulabs-crm).

## Database
- Schema changes go in a new numbered file under `db/migrations/` and are applied to Supabase (MCP `apply_migration` or the Supabase CLI). `drizzle/` holds the original Lovable migrations for history only — don't add to it.
- After a schema change, update `src/integrations/supabase/types.ts` (Supabase MCP `generate_typescript_types`).
- Every tenant table carries `organization_id`; RLS uses the `is_org_member` / `can_write_org` / `has_org_role` security-definer helpers — never rely on client filtering. New tenant tables copy the RLS loop in `db/migrations/0003_projects_imports_campaigns.sql`.
- Private storage buckets `call-recordings` and `imports` use `{organization_id}/...` paths with org-scoped policies.

## App structure
- Current org lives in OrgProvider (`src/lib/org.tsx`); signed-in pages live under `src/routes/_authenticated/_app/`.
- Generic CRUD list pages use `src/components/app/EntityPage.tsx`; call lists use `CallsPage.tsx` (row click → `CallDetailSheet`).
- Projects = contact lists inside a workspace (`projects`, `contacts.project_id`, `contacts.custom_fields`). CSV/XLSX parsing + column mapping is `src/lib/import.ts` (pure, tested) and `ImportDialog.tsx`.
- Charts/aggregations: `src/lib/call-insights.ts` (pure, tested) + `src/components/app/charts.tsx`.
- tsconfig relaxes noPropertyAccessFromIndexSignature, noUncheckedIndexedAccess, exactOptionalPropertyTypes to keep config-driven pages readable.
- Install with `npm install` (`.npmrc` sets legacy-peer-deps; npm's resolver crashes without it).

## Sarvam
- All Sarvam calls are server-side: `src/lib/sarvam.server.ts` (API client, transcripts, recordings), `sarvam.functions.ts` (single calls, connection check), `campaigns.functions.ts` (project campaigns via the Sarvam Campaigns API + streamed cohorts of ≤1000, `user_identifier` = `campaign_targets.id`).
- Webhooks: `/api/public/sarvam-call-webhook` (instant calls, per-call token in metadata) and `/api/public/sarvam-campaign-webhook?c=&t=` (per-campaign token in URL; inline Sarvam webhooks are unsigned). Tokens are stored hashed.
- Callback URLs use `PUBLIC_APP_URL` (must be public https, not localhost). Secrets: `SARVAM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` / host secrets — never in the repo.
- Customer answers = Sarvam agent variables (`final_agent_variables` / `output_agent_variables`) stored in `calls.answers` and `campaign_targets.answers`; outcome/sentiment are derived by `summarizeAnswers` (no external AI).
- Calls require explicit consent confirmation; only one active call per number at a time.
- Default Sarvam IDs (org, workspace, agent, connection, caller) live in `src/lib/sarvam-defaults.ts` and `db/migrations/0006_default_sarvam_setup.sql`; every new workspace gets them plus a "Sarvam Conversation Agent", and server code falls back to them when a field is empty.
