# #23: Usage and cost dashboard

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/23 |
| **Assignee** | Charan Varigonda (`CHARANVARIGONDA`) |
| **Branch** | `feature/23-usage-dashboard` |
| **PR into** | `dev` |
| **Order** | Charan's 6th issue |
| **Depends on** | nothing. Use `can(role,'billing.view')` from #16 for who sees costs |
| **Blocks** | nothing |
| **Size** | ~4–5 days |

## 1. Summary

Know **how many minutes** each agent and campaign uses and **what it costs**: a usage page with daily minutes, breakdowns per agent and campaign, connected vs not-connected attempts, and average length. On top of that, configurable rates, a monthly budget with an 80% warning and an optional hard stop on new campaigns, and a CSV export for accounting.

## 2. What already exists

- `calls`: `agent_id`, `campaign_id`, `status`, `duration_seconds`, `started_at`, `created_at`, `retry_attempt`.
- `voice_agents`, `call_campaigns` (names); campaign launch code (in `sarvam.functions.ts` / the campaign builder flow).
- Analytics pages with Recharts (`call-analytics.tsx`, …).

## 3. Scope

**In scope:** a usage RPC, the usage page (charts and tables), the settings for rates and budget, the budget banner, a hard stop on launching new campaigns, CSV export.

**Out of scope:** actual billing or invoices, syncing real costs from Sarvam (note it as a follow-up).

## 4. What to build, point by point

### 4.1 SQL
1. RPC `usage_summary(org, from_ts, to_ts)` returning rows per `day` (IST date), `agent_id`, `campaign_id`: `attempts`, `connected` (`status = 'completed'`), `seconds` (sum of `duration_seconds`), `billable_minutes`.
2. **Billable minutes rule:** per call, `ceil(duration_seconds / 60.0)` (per-minute rounding up is common for telephony; agree with the lead, and make it a setting `rounding: 'per_call_minute' | 'exact'`).
3. Group the days in **Asia/Kolkata**: `(started_at at time zone 'Asia/Kolkata')::date`.
4. `security invoker` plus an explicit org filter.

### 4.2 Settings (rates and budget)
5. Table `usage_settings` (§5): `cost_per_minute` (₹), `cost_per_attempt` (₹, optional), `currency` (INR), `monthly_budget`, `hard_stop` (bool), `rounding`.
6. Settings UI (owners/admins): rates, budget, the hard-stop toggle with an explanation ("When the month's estimated spend reaches the budget, new campaigns can't be launched. Running campaigns and test calls are not affected.").

### 4.3 Usage page (`usage.tsx`)
7. Month picker (default: current month) or a custom range.
8. KPI cards: total minutes, estimated spend (₹), attempts, connected %, average call length (connected only, mm:ss), and budget used % (a progress bar).
9. Charts: minutes per day (bar, stacked by agent), spend cumulative vs budget (line, with the budget as a dashed line).
10. Tables: per agent and per campaign (attempts, connected, minutes, avg length, estimated cost), sortable.
11. **Export CSV**: one row per day × agent × campaign: `date, agent, campaign, attempts, connected, minutes, estimated_cost_inr`. Name it `usage-YYYY-MM.csv`.
12. Hide cost values for roles without `billing.view` (show minutes only).

### 4.4 Budget warning and hard stop
13. `getBudgetStatus(orgId)`: spend this month vs budget → `{ spent, budget, percent, level: "ok" | "warning" | "exceeded" }`.
14. Banner in `AppShell` (for owners/admins/managers) at ≥ 80%: "You've used 82% of this month's calling budget (₹8,200 of ₹10,000)." Dismissible for the day.
15. **Hard stop:** in the campaign launch server function, if `hard_stop` is on and `level === "exceeded"`, refuse with "Monthly calling budget reached. Raise the budget in Settings → Usage to launch new campaigns." The UI disables Launch with the same message.

## 5. Data model

```sql
-- 00NN_usage_settings.sql: per-workspace calling rates and monthly budget
create table if not exists public.usage_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  cost_per_minute numeric(10,2) not null default 0,
  cost_per_attempt numeric(10,2) not null default 0,
  currency text not null default 'INR',
  monthly_budget numeric(12,2),
  hard_stop boolean not null default false,
  rounding text not null default 'per_call_minute' check (rounding in ('per_call_minute','exact')),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now()
);
-- RLS: members read; owners/admins write.
-- create or replace function public.usage_summary(org uuid, from_ts timestamptz, to_ts timestamptz) returns table(...) ...
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_usage_settings.sql` | **new** |
| `src/lib/usage.ts` | **new**: `billableMinutes`, `estimateCost`, `budgetLevel`, `toCsv` |
| `src/lib/usage.functions.ts` | **new**: summary, settings, budget status |
| `src/routes/_authenticated/_app/usage.tsx` | **new** |
| `src/routes/_authenticated/_app/settings.tsx` | rates and budget section |
| `src/components/app/AppShell.tsx` | budget banner |
| campaign launch server function | hard-stop check |
| `src/test/usage.test.ts` | **new** |

## 7. Rules and edge cases

- Money in `numeric`, displayed with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.
- Months in IST (a call at 00:30 IST on the 1st belongs to the new month).
- No budget set → no warning or hard stop.
- The hard stop only blocks **new campaign launches**, not test calls or running campaigns.
- CSV: escape commas and quotes; UTF-8 with a BOM so Excel opens ₹ correctly.

## 8. Testing

**Unit tests:** `billableMinutes` (0 s → 0, 1 s → 1, 60 s → 1, 61 s → 2; exact mode); `estimateCost` with minute and attempt rates; `budgetLevel` at 79/80/100%; `toCsv` escaping; IST month boundaries.

**Manual check against SQL** (the acceptance criterion):

```sql
select sum(duration_seconds) / 60.0 as exact_minutes,
       sum(ceil(duration_seconds / 60.0)) as billable_minutes
from calls
where organization_id = '<org>'
  and started_at >= '2026-11-01 00:00+05:30' and started_at < '2026-12-01 00:00+05:30';
```

The dashboard totals must match. Then set a tiny budget → the banner appears at 80% → turn on the hard stop → launching a campaign is refused with the message → a test call still works.

```bash
npx vitest run src/test/usage.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] The dashboard totals match a manual sum of `calls.duration_seconds` for a chosen month
- [ ] Per-agent and per-campaign breakdowns, connected vs not, average length
- [ ] Rates and budget are configurable; the warning shows at 80%; the optional hard stop blocks new campaigns
- [ ] CSV export opens correctly in Excel

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/23-usage-dashboard
git add db/migrations/00NN_usage_settings.sql src/lib/usage.ts src/test/usage.test.ts
git commit -m "Usage: billable minutes, cost estimate and budget helpers"
git push -u origin feature/23-usage-dashboard
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#23 Usage and cost dashboard" --body "Closes #23 ..."
```

## 11. In the pull request

- `Closes #23`; the migration to apply; the SQL vs dashboard comparison; screenshots including the banner

## 12. Settle with the lead before starting

- The rounding rule and the real rates (per minute / per attempt).
- Who can see costs.
