# #15: Agent analytics and A/B testing of scripts

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/15 |
| **Assignee** | Tejaswini (`Tejaswini2706`) |
| **Branch** | `feature/15-agent-analytics` |
| **PR into** | `dev` |
| **Order** | Tejaswini's 5th issue |
| **Depends on** | #9 (`calls.agent_version`, version history) |
| **Blocks** | nothing |
| **Size** | ~5–6 days |

## 1. Summary

Know which agent and which **script version** converts best. That means a dashboard per agent and per version (calls, connect rate, duration, interested %, consultations, opt-outs, top objections), a funnel from dialled to won, and the ability to **split a campaign 50/50** between two versions and compare the results honestly, with sample sizes.

## 2. What already exists

- `calls` with `agent_id`, `campaign_id`, `status`, `duration_seconds`, `answers` (jsonb), `created_at`; `agent_version` from #9.
- `leads`, `deals` (`stage`, `status` won/lost) linked to contacts.
- Analytics pages: `call-analytics.tsx`, `campaign-analytics.tsx`, `sales-analytics.tsx` (Recharts).
- `classifyCallOutcome` for turning a disposition into interested/negative/neutral.

## 3. Scope

**In scope:** SQL aggregation (a view or RPC), the agent/version dashboard, the funnel with filters, A/B split on campaigns, the results view with a minimum sample size.

**Out of scope:** automatic winner promotion, multi-armed bandits.

## 4. What to build, point by point

### 4.1 SQL (fast and correct)
1. An RPC `agent_metrics(org uuid, from_ts timestamptz, to_ts timestamptz, agent uuid default null, campaign uuid default null)` returning, per `agent_id, agent_version`: `dialled`, `connected` (`status = 'completed'`), `avg_duration` (connected only), `interested`, `consultations`, `opt_outs`.
2. Derive interested/consultation/opt-out from `lower(answers->>'disposition')` with the same keywords as `crm-outcome.ts`. Document the mapping in a SQL comment and keep it in sync (or add a generated `calls.outcome_kind` column filled by the sync; agree with the lead).
3. An RPC `top_objections(org, from, to, agent)`: `answers->>'objections'` grouped and counted (split comma lists).
4. An RPC `agent_funnel(org, from, to, agent, campaign)`: dialled → connected → interested → deal created → won.
5. Every RPC is `security invoker` (so RLS applies) **or** checks `is_org_member(org)` at the start.

### 4.2 Dashboard page (`agent-analytics.tsx`)
6. Filters: date range (Last 7/30/90 days, custom), agent, campaign. Keep them in the URL search params.
7. KPI cards: calls, connect rate, avg duration (mm:ss), interested %, consultations, opt-out rate.
8. A table per agent → expand to its versions, with the same metrics.
9. Charts: calls and interested % over time (line), top objections (horizontal bar), funnel (stepped bars with % conversion between steps).
10. Empty state: "No calls in this range."

### 4.3 A/B split on campaigns
11. In the campaign builder (`CampaignBuilder.tsx`): an "A/B test" toggle → pick version A and version B (from #9's `voice_agent_versions`) and a split (50/50 by default).
12. Assign each target a variant **deterministically** (a hash of the target id mod 100 < split → A). Store it on `campaign_targets.variant` and `calls.agent_version`.
13. When placing the call, pass the variant's `sarvam_app_version`.
14. Results panel on the campaign page: per variant, connected calls, interested %, consultations %, with the sample size.
15. **No winner on small samples:** fewer than 30 connected calls per arm → "Not enough data yet (n=12 / 30)". Otherwise show the difference and a simple two-proportion z-test p-value. Label "Likely better" only if p < 0.05.

## 5. Data model

```sql
-- 00NN_agent_analytics.sql: A/B variant on campaign targets + metrics RPCs
alter table public.campaign_targets add column if not exists variant text check (variant in ('A','B'));
alter table public.call_campaigns add column if not exists ab_test jsonb; -- {"a_version":"7","b_version":"8","split":50}
-- create or replace function public.agent_metrics(...) returns table(...) language sql stable security invoker as $$ ... $$;
-- create or replace function public.agent_funnel(...) ...; create or replace function public.top_objections(...) ...;
-- grant execute on function ... to authenticated;
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_agent_analytics.sql` | **new** |
| `src/lib/ab-test.ts` | **new**: `assignVariant`, `twoProportionZTest`, `enoughData` |
| `src/lib/analytics.functions.ts` | **new**: call the RPCs |
| `src/routes/_authenticated/_app/agent-analytics.tsx` | **new** |
| `src/components/app/CampaignBuilder.tsx`, campaign launch code | A/B option, variant assignment |
| `src/routes/_authenticated/_app/call-campaigns.$campaignId.tsx` | results panel |
| `src/test/ab-test.test.ts` | **new** |

## 7. Rules and edge cases

- Rates divide by the right denominator (interested % = interested / connected, not / dialled). State it in a tooltip.
- Retries: count unique targets for "dialled" in the funnel, not every attempt (agree, and document it).
- Time ranges in IST.
- A campaign without A/B → no variant; the results panel is hidden.
- Never show "winner" below the minimum sample.

## 8. Testing

**Unit tests:** `assignVariant` is deterministic and roughly 50/50 over 10,000 ids (±2%); `twoProportionZTest` against known values; `enoughData(29) = false`, `enoughData(30) = true`.

**Manual check against SQL** (the acceptance criterion): pick a week and run

```sql
select agent_id, count(*) dialled,
       count(*) filter (where status='completed') connected,
       count(*) filter (where status='completed' and lower(answers->>'disposition') like '%interested%'
                        and lower(answers->>'disposition') not like '%not interested%') interested
from calls where organization_id = '<org>' and created_at >= '2026-11-16' and created_at < '2026-11-23'
group by agent_id;
```

The dashboard must match. Then create a small A/B campaign on **test numbers** → each call row has `agent_version` A or B, split about evenly.

```bash
npx vitest run src/test/ab-test.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] The dashboard matches a manual SQL count for a chosen week
- [ ] Per-version metrics, funnel and top objections are shown, with filters
- [ ] A 50/50 split campaign records which version each call used
- [ ] Results show sample sizes; no winner below the minimum

## 10. Git workflow for this issue

```bash
git checkout dev && git pull            # #9 merged first
git checkout -b feature/15-agent-analytics
git add db/migrations/00NN_agent_analytics.sql src/lib/ab-test.ts src/test/ab-test.test.ts
git commit -m "Analytics: metrics RPCs and A/B helpers"
git push -u origin feature/15-agent-analytics
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#15 Agent analytics and A/B testing" --body "Closes #15 ..."
```

## 11. In the pull request

- `Closes #15`; the migration to apply
- The SQL vs dashboard comparison for one week (numbers side by side); screenshots

## 12. Settle with the lead before starting

- The exact definition of interested / consultation / opt-out (keyword list).
- The minimum sample size, and whether to show p-values or just "not enough data / likely better".
