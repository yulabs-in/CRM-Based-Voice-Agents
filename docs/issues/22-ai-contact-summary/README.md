# #22: AI contact summary and next best action

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/22 |
| **Assignee** | Kammar Shashank (`KAMMAR-SHASHANK`) |
| **Branch** | `feature/22-ai-contact-summary` |
| **PR into** | `dev` |
| **Order** | Shashank's 6th issue |
| **Depends on** | nothing (needs an LLM API key from the lead) |
| **Blocks** | nothing |
| **Size** | ~4–5 days |

## 1. Summary

Open a contact and **immediately understand where things stand and what to do next**. An AI-generated card shows a 3-line summary of the relationship, the sentiment trend, and **one** recommended next action with a reason. It's built only from data the CRM already has, cached, and refreshed when a new call comes in.

## 2. What already exists

- Per contact: `calls` (summary, answers, sentiment, outcome, dates), `deals` (stage, value), `tasks`, `meetings`.
- `applyCallOutcomeToCrm` in `src/lib/crm-sync.server.ts` runs after every completed call: the hook for refreshing.
- Contact page/drawer (`contacts.tsx` / `EntityPage`), Leads rows (`leads.tsx`).

## 3. Scope

**In scope:** the server function that builds the prompt and calls the LLM, structured JSON output, the `contact_insights` cache, refresh on a new call, the contact card, the lead-row hover card, a manual refresh button, the "AI-generated" label.

**Out of scope:** chat with the contact's history, automatic actions (the AI only *recommends*).

## 4. What to build, point by point

### 4.1 Provider
1. Agree on the LLM provider and model with the lead (e.g. Claude Haiku for speed and cost). The key goes in `.env.local` / Netlify env (e.g. `ANTHROPIC_API_KEY`), server-side only.
2. A thin client `src/lib/llm.server.ts`: `generateJson<T>(system, user, schema): Promise<T>` with a timeout (15 s), one retry, and zod validation of the output.

### 4.2 Building the input (`src/lib/insights.server.ts`)
3. `collectContactContext(orgId, contactId)`: the last 10 calls (date, agent, outcome/disposition, sentiment, summary, objections, follow-up time), open deals (stage, value, updated), open tasks (title, due), upcoming meetings, and the contact's status/tags (e.g. do-not-call).
4. Keep it compact: trim summaries to ~400 chars and drop transcripts. Include **no data the CRM doesn't hold**, and don't add the email or full phone (not needed).
5. Prompt (system): *"You are a CRM assistant. Use ONLY the facts provided. If information is missing, say so. Never invent dates, amounts or promises. If the contact asked not to be contacted, the next action must respect that. Reply in JSON matching the schema."*
6. Output schema (zod):
   `{ summary: string (≤ 3 short sentences), sentiment: "improving" | "steady" | "declining" | "unknown", next_action: { action: string (≤ 12 words), reason: string (≤ 30 words), due: "today" | "this_week" | "later" | null }, confidence: "high" | "medium" | "low" }`
7. **Guardrails in code** (don't rely only on the prompt): if the contact is do-not-call → force `next_action = { action: "Do not contact", reason: "Contact opted out" }`. With no calls → no LLM call at all; show "Not enough history yet".

### 4.3 Cache and refresh
8. Table `contact_insights` (§5): one row per contact, with `source_hash` (a hash of the input context) and `generated_at`.
9. `getContactInsight(contactId)` (server function): if a cached row exists and its `source_hash` matches the current context → return it; otherwise generate, upsert and return.
10. Refresh on a new call: at the end of `applyCallOutcomeToCrm`, call `refreshContactInsight(contactId)` **without awaiting** in the request path (fire-and-forget with catch), so call processing isn't slowed down or broken by LLM errors.
11. Rate-limit generation per org (e.g. 60/hour) to control cost.

### 4.4 UI
12. A contact page card "AI summary": the summary, a sentiment chip (with an arrow icon), the next action in bold with its reason, "Updated 3 min ago", a **Refresh** button, and an **"AI-generated: check before acting"** label.
13. Leads page: a hover card (or popover on mobile) on the contact name with a compact version.
14. Loading skeleton; on error: "Couldn't generate a summary" + Retry (never block the page).

## 5. Data model

```sql
-- 00NN_contact_insights.sql: cached AI summary per contact
create table if not exists public.contact_insights (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  summary text not null, sentiment text not null,
  next_action jsonb not null, confidence text,
  source_hash text not null, source_call_ids uuid[] not null default '{}',
  model text, generated_at timestamptz not null default now()
);
alter table public.contact_insights enable row level security;
create policy "tenant read" on public.contact_insights for select to authenticated using (public.is_org_member(organization_id));
grant select on public.contact_insights to authenticated;
grant all on public.contact_insights to service_role;   -- written by the server only
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_contact_insights.sql` | **new** |
| `src/lib/llm.server.ts` | **new** |
| `src/lib/insights.server.ts` | **new**: context, prompt, guardrails, cache |
| `src/lib/insights.functions.ts` | **new**: `getContactInsight`, `refreshContactInsight` |
| `src/lib/crm-sync.server.ts` | fire-and-forget refresh |
| `src/components/app/ContactInsightCard.tsx` | **new** |
| contact page, `leads.tsx` | show the card / hover |
| `src/test/insights.test.ts` | **new** |

## 7. Rules, edge cases, security

- **Never invent facts.** The prompt plus guardrails, and confidence shown as "low" when the data is thin.
- The API key stays server-side; never log prompts containing personal data in production.
- LLM down or slow → the CRM keeps working; the card shows an error with Retry.
- Opted-out contacts → "Do not contact" is always the next action.
- Cost control: cache by `source_hash`, and rate-limit per org.

## 8. Testing

**Unit tests (mock the LLM):**
- `collectContactContext` trims and orders data, and excludes transcripts
- the prompt builder includes the facts and the rules
- the output parser rejects invalid JSON or schema (and the retry works)
- the do-not-call guardrail overrides the LLM's suggestion
- no calls → no LLM call
- the same context → cache hit (no LLM call); a new call → a new hash → regenerated

**Manual:**
1. A contact with 3+ calls → the card summary matches the call history (read the calls and compare).
2. Simulate a new completed call → the card updates within a minute (reload or wait for refetch).
3. A do-not-call contact → "Do not contact".
4. Set a wrong API key → the page still works; the card shows an error.

```bash
npx vitest run src/test/insights.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] For a contact with several calls, the card's summary matches the call history
- [ ] It refreshes within a minute of a new call
- [ ] It's clearly labelled AI-generated and never invents facts (guardrails tested)
- [ ] Cached; LLM failures never break the page or the call sync

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/22-ai-contact-summary
git add db/migrations/00NN_contact_insights.sql src/lib/insights.server.ts src/lib/llm.server.ts
git commit -m "Insights: contact context, prompt and cached summary"
git push -u origin feature/22-ai-contact-summary
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#22 AI contact summary and next best action" --body "Closes #22 ..."
```

## 11. In the pull request

- `Closes #22`; the migration to apply; the env var name for the LLM key (no value)
- 2–3 example cards next to the real call history they came from

## 12. Settle with the lead before starting

- The LLM provider/model, the key, and a monthly budget.
- Whether the hover card on Leads is needed in v1.
