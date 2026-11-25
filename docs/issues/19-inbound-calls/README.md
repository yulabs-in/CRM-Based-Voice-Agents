# #19: Inbound calls: the agent answers your business number

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/19 |
| **Assignee** | Kammar Shashank (`KAMMAR-SHASHANK`) |
| **Branch** | `feature/19-inbound-calls` |
| **PR into** | `dev` |
| **Order** | Shashank's 5th issue |
| **Depends on** | #13 (DNC: no outbound follow-ups for opted-out callers) |
| **Blocks** | nothing |
| **Size** | ~5–6 days |

## 1. Summary

When a customer **calls the business number**, a voice agent answers. The call lands in the CRM exactly like an outbound one: a call row (`direction = inbound`), contact found or created by phone, answers/transcript/recording saved, and leads, deals and tasks updated by the same CRM sync.

## 2. What already exists

- `calls.direction` already exists (default `'outbound'`).
- The outbound result webhook `src/routes/api/public/sarvam-call-webhook.ts`: verifies the token, extracts answers (`extractAnswers`), saves the transcript and recording, then `applyCallOutcomeToCrm(call)`.
- `crm-sync.server.ts`: `applyCallOutcomeToCrm`.
- Live Calls / Call History pages: `live-calls.tsx`, `call-history.tsx`.
- Sarvam: inbound deployments link an agent + telephony connection + number (see the Sarvam docs: telephony, deployments).

## 3. Scope

**In scope:** managing the inbound deployment from Voice Agents (which agent answers, business hours), an inbound webhook route, contact match/create, the same sync, the "Inbound" badge and a direction filter, the DNC follow-up rule.

**Out of scope:** call transfer to a human, IVR menus, voicemail transcription (unless Sarvam provides it for free).

## 4. What to build, point by point

### 4.1 Inbound settings (Voice Agents page)
1. An "Inbound" section: business number (from the telephony connection), the agent that answers ▾, business hours (days, start/end, timezone Asia/Kolkata), and an out-of-hours behaviour (another agent ▾, or "Sarvam default message").
2. Saving calls Sarvam (server function) to create or update the inbound deployment for that number. Store the deployment id.
3. A status chip: "Live: calls to +91 … are answered by <agent>".

### 4.2 Inbound webhook (`src/routes/api/public/sarvam-inbound-webhook.ts`)
4. Verify the request: a secret token in the URL path or header, compared by SHA-256 (like `cron-sync.ts`). Reject anything else with 401.
5. Map the payload: caller number (`from`), our number (`to`), Sarvam call id, status, duration, `final_agent_variables`, transcript, recording URL.
6. Find the organization by the called number (the deployment → org mapping saved in 4.1).
7. **Idempotent:** upsert the call by `external_id` (the Sarvam call id). Repeated events update the same row.
8. Find the contact by **normalised phone** in that org; if there's none, create one (`first_name` from the spoken name answer if any, otherwise "Inbound caller", source tag `inbound`).
9. Insert or update `calls` with `direction = 'inbound'`, `agent_id`, `contact_id`, status, timings, answers, transcript, recording (reuse the helpers from the outbound webhook; move them into `src/lib/call-ingest.server.ts` so both routes share them).
10. When completed, run `applyCallOutcomeToCrm(call)` (same lead/deal/task logic).
11. If the inbound call is still live (in progress), make sure Live Calls shows it (Realtime already covers `calls`).

### 4.3 DNC rule
12. If the caller's number is blocked (`isBlocked()` from #13), still record the call, but **don't create outbound follow-up tasks or calls**: pass a flag `suppressFollowUps: true` to the sync, which skips follow-up task creation and campaign enrolment.

### 4.4 UI
13. Call History and Live Calls: an **Inbound** badge (icon `PhoneIncoming`) vs Outbound, and a direction filter (All / Outbound / Inbound).
14. Contact timeline: "Called in" wording for inbound calls.

## 5. Data model

```sql
-- 00NN_inbound_calls.sql: inbound deployments (which agent answers which number) and a secret for the inbound webhook
create table if not exists public.inbound_deployments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_number text not null unique,               -- E.164 business number
  agent_id uuid references public.voice_agents(id) on delete set null,
  after_hours_agent_id uuid references public.voice_agents(id) on delete set null,
  business_hours jsonb not null default '{"days":["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],"start":"09:00","end":"19:00","tz":"Asia/Kolkata"}',
  sarvam_deployment_id text,
  webhook_token_hash text,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists calls_external_id_key on public.calls (organization_id, external_id) where external_id is not null;
-- RLS: members read; owners/admins/voice_managers write (has_org_role)
```

Check that no existing duplicate `external_id` values block the unique index. Run a `select external_id, count(*) … having count(*) > 1` first and mention the result in the PR.

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_inbound_calls.sql` | **new** |
| `src/lib/call-ingest.server.ts` | **new**: shared mapping/saving helpers (moved from the outbound webhook) |
| `src/routes/api/public/sarvam-inbound-webhook.ts` | **new** |
| `src/routes/api/public/sarvam-call-webhook.ts` | use the shared helpers (no behaviour change) |
| `src/lib/inbound.functions.ts` | **new**: save the deployment via Sarvam |
| `src/lib/crm-sync.server.ts` | `suppressFollowUps` option |
| `voice-agents.tsx`, `call-history.tsx`, `live-calls.tsx` | UI |
| `src/test/inbound.test.ts` | **new** |

## 7. Rules, edge cases, security

- The webhook must be authenticated (token) and idempotent (upsert by `external_id`).
- Withheld or unknown caller id → create the call without a contact; don't crash.
- Out of business hours → the after-hours agent or the default message (configured in Sarvam).
- Refactoring the outbound webhook must not change its behaviour. The existing tests must still pass (`src/test/sarvam-call.test.ts`).
- Blocked callers: the call is logged, follow-ups are suppressed.

## 8. Testing

**Unit tests:** payload → call row mapping; contact match with different phone formats; a new contact for an unknown number; a repeated event updates rather than duplicates; `suppressFollowUps` skips task creation.

**Manual:**
1. Start a tunnel: `cloudflared tunnel --url http://localhost:8080` → set `PUBLIC_APP_URL` → restart `npm run dev`.
2. Configure inbound for the test number with the insurance agent.
3. Call the test number **from your own phone**, and say you're interested.
4. Within seconds: Live Calls shows it with the Inbound badge → after hanging up, Call History has it with the transcript; the contact exists (or was created); the lead appears under Interested.
5. Block your number (#13), call again → the call is recorded, and no follow-up task is created.
6. Simulate the webhook with curl and a saved payload, twice → one call row.

```bash
npx vitest run src/test/inbound.test.ts src/test/sarvam-call.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] Calling the test number reaches the chosen agent
- [ ] The call, contact and (if interested) lead appear in the CRM within seconds
- [ ] Inbound calls are badged and filterable; the webhook is authenticated and idempotent
- [ ] Opted-out callers get no outbound follow-ups
- [ ] The outbound webhook still behaves the same (tests pass)

## 10. Git workflow for this issue

```bash
git checkout dev && git pull            # #13 merged first
git checkout -b feature/19-inbound-calls
git add src/lib/call-ingest.server.ts src/routes/api/public/sarvam-inbound-webhook.ts
git commit -m "Inbound: webhook with contact match and CRM sync"
git push -u origin feature/19-inbound-calls
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#19 Inbound calls" --body "Closes #19 ..."
```

## 11. In the pull request

- `Closes #19`; the migration to apply (and the duplicate `external_id` check result)
- A recording or screenshots of an inbound test call appearing live

## 12. Settle with the lead before starting

- Which test number and connection to use, and Sarvam's inbound payload format.
- Business hours and the after-hours behaviour.
