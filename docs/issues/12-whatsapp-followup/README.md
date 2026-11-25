# #12: WhatsApp follow-up after calls (approved templates)

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/12 |
| **Assignee** | Tejaswini (`Tejaswini2706`) |
| **Branch** | `feature/12-whatsapp-followup` |
| **PR into** | `dev` |
| **Order** | Tejaswini's 4th issue |
| **Depends on** | nothing (uses `isBlocked()` from #13 if merged) |
| **Blocks** | nothing |
| **Size** | ~5–6 days |

## 1. Summary

After an interested call, send the brochure, company profile or quote options on **WhatsApp**, as the agent promised on the call. Messages use **pre-approved templates** only, are sent only with the caller's **consent**, go out **at most once** per call, and are logged on the contact's timeline.

## 2. What already exists

- Workflow builder: `src/components/app/WorkflowBuilder.tsx`, executed by `src/lib/automation.server.ts` (trigger `call.completed`, conditions, actions). Tests: `src/test/automation.test.ts`.
- `messages` table (`channel`, `contact_id`, `recipient`, `subject`, `body`, `direction`, `status`) for logging.
- Integrations page: `src/routes/_authenticated/_app/integrations.tsx`; WhatsApp page `whatsapp.tsx` (placeholder).
- Stock agent answer `consent_to_share` (yes/no).

## 3. Scope

**In scope:** provider settings (server-side credentials), a template library per agent, a "Send WhatsApp template" automation action, consent and DNC checks, idempotency, timeline logging, delivery status if the provider sends it.

**Out of scope:** two-way chat inbox, free-form messages, bulk broadcasts.

## 4. What to build, point by point

### 4.1 Provider
1. Agree on the provider with the lead (Meta WhatsApp Cloud API recommended; alternatives Gupshup, Twilio). Write a small interface so the provider can be swapped:
   `interface WhatsAppProvider { sendTemplate(to: string, template: string, language: string, params: string[]): Promise<{ id: string }> }`
2. Implement it in `src/lib/whatsapp/meta.server.ts` (`POST https://graph.facebook.com/v20.0/<phone_number_id>/messages` with `type: "template"`).
3. Credentials (access token, phone number id, business account id) are saved per workspace from the Integrations page **through a server function**, stored server-side only (a table with RLS that never selects the token back to the client, or encrypted). The UI shows "Connected ✓ (…last 4 chars)".

### 4.2 Templates
4. Table `whatsapp_templates`: `agent_id` (nullable = all agents), `name` (the provider's approved template name), `language` (`en`, `hi`), `body_preview`, `params` (an ordered list of sources: `contact.first_name`, `answers.product`, `answers.follow_up_time`, `=fixed text`), `active`.
5. A templates screen (WhatsApp page): list, add, edit, deactivate, and a preview with sample data.
6. Optional: a "Sync from provider" button that fetches approved template names.

### 4.3 Automation action
7. Add the action type `send_whatsapp_template` to the workflow builder: pick a template, and see its params.
8. In `automation.server.ts`, the executor:
   - resolves the params from the contact and call answers
   - **consent check:** send only if `answers.consent_to_share` is yes (`yes/true/haan/ha`), or the workflow explicitly has the condition "consent given". With no consent → skip and log the reason
   - **DNC check:** skip blocked or inactive contacts (`isBlocked()` from #13, or `contacts.status = 'inactive'`)
   - **idempotency:** a unique key `(call_id, template_id)` in `whatsapp_sends`, so a second run is skipped
   - sends via the provider, then inserts a `messages` row (`channel = 'whatsapp'`, `direction = 'outbound'`, `status = 'sent'`, `body` = rendered preview)
9. Errors: store `status = 'failed'` with the provider's error message. Don't retry endlessly (at most 2 retries).

### 4.4 Timeline and status
10. The contact timeline shows WhatsApp messages with an icon, template name and status.
11. Optional: a provider status webhook (`/api/public/whatsapp-status`) that updates `delivered`/`read`. Verify the signature.

## 5. Data model

```sql
-- 00NN_whatsapp_followup.sql: approved WhatsApp templates and a send log that guarantees one message per call+template
create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references public.voice_agents(id) on delete set null,
  name text not null, language text not null default 'en',
  body_preview text, params jsonb not null default '[]', active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.whatsapp_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid references public.calls(id) on delete set null,
  template_id uuid references public.whatsapp_templates(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  provider_message_id text, status text not null default 'queued', error text,
  created_at timestamptz not null default now(),
  unique (call_id, template_id)
);
-- enable RLS + tenant policies on both (copy the pattern from 0001_voice_automation_comms.sql)
```

The credentials table: `whatsapp_connections` (organization_id unique, phone_number_id, business_account_id, access_token_encrypted). RLS with **no select policy** for `authenticated`; only server functions using the service role read it.

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_whatsapp_followup.sql` | **new** |
| `src/lib/whatsapp/provider.ts`, `meta.server.ts`, `render.ts` | **new** |
| `src/lib/whatsapp.functions.ts` | **new**: save credentials, templates CRUD |
| `src/lib/automation.server.ts` | new action executor |
| `src/components/app/WorkflowBuilder.tsx` | new action UI |
| `src/routes/_authenticated/_app/whatsapp.tsx`, `integrations.tsx` | templates, connection |
| `src/test/whatsapp.test.ts`, `src/test/automation.test.ts` | **new** / extend |

## 7. Rules, edge cases, security

- **Approved templates only.** No free text to customers.
- **Consent required**, and DNC respected. If in doubt, don't send.
- **Exactly one** message per call+template (the unique constraint does the work, not just an if-check).
- The access token never reaches the browser and is never logged.
- Phone numbers in E.164 (`normalizePhoneNumber`); skip numbers that aren't valid mobiles.
- **Test only with the provider's sandbox/test number and your own phone.**

## 8. Testing

**Unit tests:**
- `render.ts` fills params from contact, answers and fixed values; a missing value → `""` plus a warning
- consent parsing: yes/true/haan → send; no/missing → skip
- executor: an interested call with consent → one provider call and one `messages` row; the same call again → no provider call; no consent → none; DNC → none (mock the provider)

**Manual:**
1. Connect the provider's test number in Integrations.
2. Add a template (an approved test template) for the stock agent.
3. Create a workflow: on `call.completed` where `disposition = interested` → send the template.
4. Simulate a webhook with `consent_to_share: yes` → your phone gets **one** message; the timeline shows it.
5. Replay the webhook → no second message.
6. Simulate one with `consent_to_share: no` → no message; the log shows "skipped: no consent".

```bash
npx vitest run src/test/whatsapp.test.ts src/test/automation.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] Provider credentials are saved server-side only
- [ ] Templates can be managed per agent with param mapping
- [ ] An interested test call with consent triggers exactly one WhatsApp message
- [ ] A call without consent (or to a DNC number) triggers none
- [ ] Every message is logged on the contact timeline

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/12-whatsapp-followup
git add db/migrations/00NN_whatsapp_followup.sql src/lib/whatsapp
git commit -m "WhatsApp: provider interface and template sends"
git push -u origin feature/12-whatsapp-followup
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#12 WhatsApp follow-up after calls" --body "Closes #12 ..."
```

## 11. In the pull request

- `Closes #12`; the migration to apply; which provider was chosen and why
- A screenshot of the received test message (with your number hidden)

## 12. Settle with the lead before starting

- Which provider, and who creates the business account and test number.
- Which templates the business needs (brochure, company profile, quote options).
