# #10: Per-agent outcome rules and lead fields

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/10 |
| **Assignee** | Kammar Shashank (`KAMMAR-SHASHANK`) |
| **Branch** | `feature/10-agent-outcome-rules` |
| **PR into** | `dev` |
| **Order** | Shashank's 2nd issue |
| **Depends on** | nothing (nicer after #9) |
| **Blocks** | nothing, but #11/#14 (Charan) also edit `crm-sync.server.ts`, so keep your change small |
| **Size** | ~4–5 days |

## 1. Summary

Each voice agent decides how its call outcomes move leads and deals. For example, "interested" on the stock agent might mean deal stage *proposal* at 40%, while on the insurance agent it means *qualification* at 25%. Today one set of rules in code applies to every agent. Also, each agent chooses which of its answers show as columns on the Leads page.

## 2. What already exists

- `classifyCallOutcome(input)` in `src/lib/crm-outcome.ts` returns a `CallVerdict` `{ kind, label, leadStatus, dealStage, probability, score }` from the call's disposition. `nextLeadStatus` / `nextDealStage` never move a record backwards.
- `isDoNotContact(label)`: blocks future calls.
- `applyCallOutcomeToCrm` in `src/lib/crm-sync.server.ts` creates or updates the lead, deal and follow-up task, and handles do-not-contact and escalations.
- Tests: `src/test/crm-outcome.test.ts`, `src/test/crm-rules.test.ts`.
- Leads page: `src/routes/_authenticated/_app/leads.tsx` with `DETAIL_KEYS`, a hard-coded list of answer keys shown as details.

## 3. Scope

**In scope:** the `agent_outcome_rules` table, a settings UI per agent, a rule lookup with fallback in the sync, per-agent lead columns, tests.

**Out of scope:** new dispositions in the Sarvam agents themselves, notifications (#14), meetings (#11).

## 4. What to build, point by point

### 4.1 Database
1. Migration `00NN_agent_outcome_rules.sql` (§5): the rules table, unique `(agent_id, disposition)`, RLS.
2. Add `voice_agents.lead_columns text[]` (the answer keys shown on Leads for this agent).

### 4.2 Pure rule logic (`src/lib/outcome-rules.ts`)
3. Type `OutcomeRule = { disposition; lead_status; deal_stage; probability; create_lead; create_task; block_contact }`.
4. `DEFAULT_DISPOSITIONS`: the list the UI shows (`interested`, `consultation_booked`, `callback`, `quote_requested`, `not_interested`, `do_not_contact`, `wrong_number`, `escalated`, `no_answer`).
5. `defaultRuleFor(disposition)`: builds the rule today's `classifyCallOutcome` would produce (call it with a fake completed call), so "Reset to defaults" equals current behaviour.
6. `resolveVerdict(call, rules: OutcomeRule[] | null): CallVerdict | null`:
   - run `classifyCallOutcome(call)` (keeps `null` for non-connected calls)
   - normalise the disposition (lowercase, `_`/`-` → space); if a rule matches, override `leadStatus`, `dealStage`, `probability` and add the flags `createLead`, `createTask`, `blockContact`
   - no rule → return the default verdict unchanged
7. **Keep it pure**: no database access, so it's easy to test.

### 4.3 Sync (`crm-sync.server.ts`), a small change
8. Load the agent's rules once per call (`select * from agent_outcome_rules where agent_id = call.agent_id`).
9. Replace the direct `classifyCallOutcome` call with `resolveVerdict(call, rules)`.
10. Respect the flags: `create_lead = false` → don't create a lead; `create_task = false` → no follow-up task; `block_contact = true` → run the existing do-not-contact block.
11. Keep `nextLeadStatus` / `nextDealStage` (never move backwards) exactly as they are.

### 4.4 Settings UI
12. On the Voice Agents page, an **Outcome rules** tab or dialog per agent.
13. One row per disposition: lead status ▾, deal stage ▾ (or "No deal"), probability (0–100), and toggles Create lead / Create task / Block contact.
14. Unsaved rows show the defaults greyed out with a "Default" badge. Editing a row makes it a custom rule.
15. **Save** and **Reset to defaults** (deletes the agent's custom rules, with a confirm dialog).
16. Only owners/admins/voice managers can edit (use `can()` once #16 lands).

### 4.5 Per-agent lead columns
17. On the same screen: "Show on Leads page", a multi-select of the agent's answer keys (from `answer_variables` in #9, or the distinct keys seen in its calls' `answers`).
18. `leads.tsx`: show the selected keys of the lead's agent as details/columns instead of the hard-coded `DETAIL_KEYS`, falling back to `DETAIL_KEYS` when none are set.

## 5. Data model

```sql
-- 00NN_agent_outcome_rules.sql: per-agent mapping from call disposition to lead/deal changes
create table if not exists public.agent_outcome_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.voice_agents(id) on delete cascade,
  disposition text not null,
  lead_status text,
  deal_stage text,
  probability int check (probability between 0 and 100),
  create_lead boolean not null default true,
  create_task boolean not null default true,
  block_contact boolean not null default false,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (agent_id, disposition)
);
alter table public.agent_outcome_rules enable row level security;
create policy "tenant read" on public.agent_outcome_rules for select to authenticated using (public.is_org_member(organization_id));
create policy "admins write" on public.agent_outcome_rules for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','voice_manager']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','voice_manager']::public.org_role[]));
grant select, insert, update, delete on public.agent_outcome_rules to authenticated;
grant all on public.agent_outcome_rules to service_role;

alter table public.voice_agents add column if not exists lead_columns text[] not null default '{}';
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_agent_outcome_rules.sql` | **new** |
| `src/lib/outcome-rules.ts` | **new**: pure logic |
| `src/lib/crm-sync.server.ts` | use `resolveVerdict` and the flags (small diff) |
| `src/components/app/agents/OutcomeRules.tsx` | **new**: settings UI |
| `src/routes/_authenticated/_app/voice-agents.tsx` | open the rules UI |
| `src/routes/_authenticated/_app/leads.tsx` | per-agent columns |
| `src/test/outcome-rules.test.ts` | **new** |

## 7. Rules and edge cases

- With **no custom rules**, behaviour must be **identical** to today (all existing tests pass unchanged).
- A disposition with no rule → default. An unknown disposition → default classification.
- Never move a lead or deal backwards (keep `nextLeadStatus`/`nextDealStage`).
- `block_contact` only ever adds a block. Unblocking is done on the DNC page (#13).
- Calls without `agent_id` (old data) → defaults.

## 8. Testing

**Unit tests** (`src/test/outcome-rules.test.ts`):
- no rules → `resolveVerdict` equals `classifyCallOutcome` for every disposition in `DEFAULT_DISPOSITIONS`
- a rule overrides stage and probability for its agent
- agent A's rule doesn't affect agent B (pass B's empty rules)
- `create_lead=false` and `block_contact=true` flags come through
- a non-connected call → `null`, even with rules

**Manual:**
1. For the stock agent, set "interested → proposal, 40%".
2. Simulate a completed webhook with `disposition: interested` for the stock agent and for the insurance agent (see the webhook test steps in your guide, §5.4).
3. Stock deal → proposal 40%; insurance deal → qualification (default).
4. Reset to defaults → behaviour is back to normal.
5. Choose lead columns for the stock agent → the Leads page shows them for stock leads only.

```bash
npx vitest run src/test/outcome-rules.test.ts src/test/crm-outcome.test.ts src/test/crm-rules.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] Rules can be edited per agent and reset to defaults
- [ ] Changing a rule for one agent changes only that agent's leads and deals
- [ ] With no rules, behaviour is unchanged (existing tests pass)
- [ ] New tests for rule lookup and fallback
- [ ] The Leads page shows each agent's chosen answer columns

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/10-agent-outcome-rules
git add src/lib/outcome-rules.ts src/test/outcome-rules.test.ts
git commit -m "Outcome rules: pure resolver with defaults and tests"
git push -u origin feature/10-agent-outcome-rules
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#10 Per-agent outcome rules and lead fields" --body "Closes #10 ..."
```

## 11. In the pull request

- `Closes #10`; the migration to apply
- A table: disposition → default vs the example custom rule; screenshots of the UI

## 12. Settle with the lead before starting

- The final list of dispositions to show.
- Whether `voice_manager` may edit rules, or only owners/admins.
