# #9: Multi-agent setup: create and manage voice agents from the CRM

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/9 |
| **Assignee** | Tejaswini (`Tejaswini2706`) |
| **Branch** | `feature/9-multi-agent` (split if large: `feature/9-agent-cards`, `feature/9-agent-wizard`, `feature/9-agent-publish`) |
| **PR into** | `dev` |
| **Order** | Tejaswini's 2nd issue |
| **Depends on** | nothing. Use `can(role,'agents.manage')` from #16 once it lands |
| **Blocks** | #10 per-agent rules (Shashank), #15 per-version analytics (you) |
| **Size** | ~8–10 days |

## 1. Summary

Today adding a voice agent means working in the Sarvam dashboard and then editing database rows by hand. After this issue, an admin can **create, configure, test, publish and roll back** voice agents (insurance, stock market advisory, and more) entirely from the CRM's Voice Agents page.

## 2. What already exists

- `voice_agents` table: `name`, `language`, `voice`, `purpose`, `greeting`, `greeting_no_name`, `instructions` (script), `sarvam_agent_id`, `sarvam_app_version`, `sarvam_connection_id`, `sarvam_agent_phone_number`, `agent_variables` (jsonb), `status`.
- Two agents seeded by migrations: `YULabs Insurance` (`0013`) and `Stock Market Advisory` (`0015`).
- Variable sources (`src/lib/campaign-vars.ts`): a contact field (`full_name`, `first_name`, …), a lead-file column (`custom.<col>`), or a **fixed value** (`=text`).
- Sarvam server code: `src/lib/sarvam.server.ts`, `src/lib/sarvam.functions.ts`. The key lives only on the server (`SARVAM_API_KEY`).
- Page: `src/routes/_authenticated/_app/voice-agents.tsx` (cards, test-call form).
- Sarvam docs: https://docs.sarvam.ai/voice-agents (agents, versions/apps, `send_chat`, telephony connections).

## 3. Scope

**In scope:** agent cards with 7-day stats, a new-agent wizard from a template, a variables editor, a company facts panel, draft → chat test → publish → switch, version history and rollback.

**Out of scope:** per-agent outcome rules (#10), inbound deployments (#19), buying phone numbers.

## 4. What to build, point by point

### 4.1 Agent cards
1. One card per agent: name, status badge (Active/Draft/Paused), live version (`sarvam_app_version`), caller number, languages.
2. 7-day stats from `calls`: calls, connect rate (`status = 'completed'` / all), interested % (from `answers.disposition` via `classifyCallOutcome`). Compute them in **one** SQL view or RPC (`agent_stats_7d`), not one query per card.
3. Card actions: **Test call** (existing), **Edit**, **Versions**, **Duplicate**, **Pause/Activate**.

### 4.2 "New agent" wizard (dialog or full page, 4 steps)
4. **Template:** pick an existing agent to clone (the Sarvam agent config is copied via the API) or "Blank".
5. **Basics:** name, purpose (one line), languages (multi-select: `hi-IN`, `en-IN`, `te-IN`, …), voice.
6. **Conversation:** greeting (with `{{customer_name}}`), greeting when the name is unknown (`greeting_no_name`), and the script/instructions in a large textarea with a character count.
7. **Telephony:** connection id and caller number (dropdown from existing agents' values, or typed in).
8. Saving creates the Sarvam agent or version as a **draft** and the `voice_agents` row with `status = 'draft'`.

### 4.3 Variables editor
9. A table of variables: name (snake_case, validated), **source** (Contact field ▾ | Lead column ▾ | Fixed value [text box]), and a checkbox **"Customer answer (post-call output)"**.
10. Contact field options from `campaign-vars.ts`. Lead columns from the custom fields seen in the org's projects (distinct keys of `contacts.custom_fields`).
11. Fixed values are stored as `=text` (keep the existing format, so campaigns and test calls keep working).
12. Answer variables are what Sarvam returns in `final_agent_variables`. Keep a list per agent (e.g. `interested`, `disposition`, `callback_time`, `objections`) so the webhook and #10 know which keys are answers.

### 4.4 Company facts panel
13. A form for facts used as fixed values: company name, registration numbers (IRDAI/SEBI), services, fees, website, hours, address. Store them in `voice_agents.agent_variables` as `=` values, or in a separate `company_facts` jsonb (agree with the lead).
14. One click: "Use in variables" adds or links the fact to a variable.

### 4.5 Publish flow and versions
15. **Save draft** → **Test in chat**: a chat panel that calls Sarvam `send_chat` through a server function and shows the conversation. A "Reset chat" button.
16. **Publish**: commit a new Sarvam version → record it in `voice_agent_versions` (§5) → set `voice_agents.sarvam_app_version` to it → `status = 'active'`.
17. **Version history** drawer: version number, published by, published at, a note, and a diff of greeting/script against the previous version (simple line diff).
18. **Roll back**: confirm dialog → set `sarvam_app_version` back to the chosen version (and re-activate it in Sarvam if needed) → log it.
19. Record the version on each call: `calls.agent_version` (new column), so #15 can compare versions.

### 4.6 Server functions (the Sarvam key never reaches the browser)
20. `listAgents`, `createAgentDraft`, `updateAgentDraft`, `chatWithDraft`, `publishAgent`, `rollbackAgent`, `duplicateAgent`, all in `src/lib/agents.functions.ts`, calling `src/lib/sarvam.server.ts` helpers.
21. Permission check in each: admin/owner/voice_manager (switch to `can()` after #16).

## 5. Data model

```sql
-- 00NN_agent_versions.sql: version history for voice agents, and which version each call used
create table if not exists public.voice_agent_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.voice_agents(id) on delete cascade,
  sarvam_app_version text not null,
  greeting text, greeting_no_name text, instructions text,
  agent_variables jsonb not null default '{}',
  answer_variables text[] not null default '{}',
  note text,
  published_by uuid default auth.uid(),
  published_at timestamptz not null default now()
);
create index if not exists voice_agent_versions_agent_idx on public.voice_agent_versions (agent_id, published_at desc);
alter table public.voice_agent_versions enable row level security;
create policy "tenant read" on public.voice_agent_versions for select to authenticated using (public.is_org_member(organization_id));
create policy "tenant write" on public.voice_agent_versions for insert to authenticated with check (public.can_write_org(organization_id));
grant select, insert on public.voice_agent_versions to authenticated;
grant all on public.voice_agent_versions to service_role;

alter table public.voice_agents add column if not exists answer_variables text[] not null default '{}';
alter table public.calls add column if not exists agent_version text;
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_agent_versions.sql` | **new** |
| `src/lib/agents.functions.ts` | **new**: server functions |
| `src/lib/sarvam.server.ts` | add create/clone/version/send_chat helpers |
| `src/routes/_authenticated/_app/voice-agents.tsx` | cards, actions |
| `src/components/app/agents/AgentWizard.tsx`, `VariablesEditor.tsx`, `CompanyFacts.tsx`, `ChatTester.tsx`, `VersionHistory.tsx` | **new** |
| `src/lib/sarvam.functions.ts` / webhook | save `agent_version` on calls |
| `src/test/campaign-vars.test.ts`, `src/test/agents.test.ts` | extend / **new** |

## 7. Rules, edge cases, security

- **No Sarvam key or raw Sarvam response with secrets in the browser.** Check DevTools → Network.
- Variable names: `^[a-z][a-z0-9_]{1,40}$`, unique per agent.
- Don't break existing campaigns. Old `agent_variables` must keep working unchanged.
- Publishing while a campaign is running: warn "Running campaigns will use the new version for new calls."
- Rollback to a version that no longer exists in Sarvam → a clear error, nothing changed.

## 8. Testing

**Unit tests:** variable name validation; `resolveVariables` with contact, custom and fixed sources (extend `campaign-vars.test.ts`); version diff helper; the permission check.

**Manual test script:**
1. Create "Test Agent" from the insurance template → it appears as Draft.
2. Add a fixed variable `company_name = =YULabs` and an answer variable `interested`.
3. Chat with it in the tester → the greeting uses the name, and it answers from the script.
4. Publish → the version shows in history; status Active.
5. Test call to **your own number** → the call row has `agent_version` set.
6. Edit the script, publish v2, then roll back to v1 → the CRM points at v1, and the next test call uses v1.
7. Signed in as a sales rep → no Edit/Publish buttons, and calling the server function directly is refused.

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] Agent cards show version, number, languages and 7-day stats
- [ ] A new agent can be created from a template, tested in chat, published, and used for a test call, all from the CRM
- [ ] The variables editor supports contact field, lead column and fixed value, and marks answer variables
- [ ] Version history and rollback work; calls record their version
- [ ] The Sarvam key never reaches the browser; only permitted roles can manage agents

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/9-multi-agent
git add db/migrations/00NN_agent_versions.sql src/lib/agents.functions.ts
git commit -m "Agents: version table and server functions"
git push -u origin feature/9-multi-agent
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#9 Multi-agent setup" --body "Closes #9 ..."
```

## 11. In the pull request

- `Closes #9`; the migration to apply
- A screen recording of create → chat → publish → test call → rollback
- A note for Shashank (#10) on where `answer_variables` live

## 12. Settle with the lead before starting

- Which Sarvam API endpoints to use for cloning and versioning (check the docs together).
- Where company facts live (in `agent_variables` or a separate column).
