# #13: Do-not-contact registry and compliance log

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/13 |
| **Assignee** | Kammar Shashank (`KAMMAR-SHASHANK`) |
| **Branch** | `feature/13-dnc-registry` |
| **PR into** | `dev` |
| **Order** | Shashank's 4th issue |
| **Depends on** | nothing |
| **Used by** | #5 `POST /api/v1/calls` and #20 widget (Charan), #12 WhatsApp (Tejaswini), #19 inbound (you) |
| **Size** | ~5 days |

## 1. Summary

Never call someone who opted out, and be able to **prove** it. Blocking moves from the contact record to the **phone number**, so a number stays blocked even when it's re-imported as a new contact. Every consent, opt-out, block and reactivation is written to a compliance log that can be exported.

## 2. What already exists

- When a caller says "do not contact / do not call / opt out", `applyCallOutcomeToCrm` sets the contact to `status = 'inactive'` and adds the tag `do-not-call` (`isDoNotContact()` in `src/lib/crm-outcome.ts`).
- Campaigns skip inactive contacts. `startSarvamCall` refuses numbers belonging to inactive contacts (a `phoneKey()` comparison in `src/lib/sarvam.functions.ts`).
- `normalizePhoneNumber` exists for E.164.

## 3. Scope

**In scope:** `dnc_numbers` and `compliance_log` tables, one `isBlocked()` helper used everywhere, recording blocks from calls, the Do-not-contact page (list/search/add/reactivate), CSV export, a backfill of existing blocked contacts.

**Optional:** importing a national DND list.

## 4. What to build, point by point

### 4.1 Database
1. Migration `00NN_dnc_registry.sql` (§5): `dnc_numbers` and `compliance_log`, RLS, and a **backfill** that inserts the phone of every existing contact with `status = 'inactive'` and tag `do-not-call`.

### 4.2 Helper (`src/lib/dnc.server.ts`)
2. `toE164(phone)`: wraps `normalizePhoneNumber`. `+91 98480 12345`, `09848012345`, `9848012345` and `+919848012345` all become `+919848012345`.
3. `isBlocked(orgId, phone): Promise<boolean>`: an active row (`removed_at is null`) exists.
4. `blockNumber({ orgId, phone, reason, source, callId?, actor? })`: upsert into `dnc_numbers` and write a `compliance_log` row (`event = 'opt_out'` from a call, or `'blocked'` manual/import).
5. `unblockNumber({ orgId, phone, reason, actor })`: requires a reason (min 10 chars); sets `removed_at/by/reason` and logs `reactivated`. Also set matching contacts back to `active` and remove the tag.
6. `logBlockedAttempt({ orgId, phone, where })`: logs `blocked_attempt` whenever a call was refused.

### 4.3 Use the registry everywhere
7. `crm-sync.server.ts`: when `isDoNotContact(...)`, also call `blockNumber(... source: 'call', callId)`. Keep the existing contact update.
8. `startSarvamCall` (one-off calls): replace or extend the inactive-contact check with `isBlocked()`. Refuse with the existing message, and call `logBlockedAttempt`.
9. Campaign launch / target building: exclude blocked numbers, and mark those targets `skipped` with reason `do_not_contact`.
10. Consent: when an answer says consent was given (`consent_to_share = yes`), log `consent_given` with the call id.
11. Export `isBlocked` for Charan (#5, #20) and Tejaswini (#12). Mention it in the PR.

### 4.4 Do-not-contact page
12. Route `src/routes/_authenticated/_app/do-not-contact.tsx`, linked in the sidebar under Calls or Settings.
13. Table: number (masked except the last 4 digits for non-admins), contact name (if any), reason, source (Call/Manual/Import), blocked at, blocked by / call link. Search by number or name, and filter by source.
14. **Add number** dialog: phone (validated) and reason.
15. **Reactivate** dialog: a required reason, and a warning "Only reactivate if the person has asked to be contacted."
16. **Compliance log** tab: events with time, actor, number, call link and details; filter by event and date; **Export CSV**.
17. Optional: **Import DND list** (CSV with one number per line). Stream in batches of 500 with a progress bar.

## 5. Data model

```sql
-- 00NN_dnc_registry.sql: phone-level do-not-contact registry and compliance audit log
create table if not exists public.dnc_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_e164 text not null,
  reason text, source text not null default 'manual' check (source in ('call','manual','import')),
  call_id uuid references public.calls(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  removed_at timestamptz, removed_by uuid, removed_reason text
);
create unique index if not exists dnc_numbers_active_key on public.dnc_numbers (organization_id, phone_e164) where removed_at is null;

create table if not exists public.compliance_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone_e164 text, contact_id uuid references public.contacts(id) on delete set null,
  event text not null check (event in ('consent_given','opt_out','blocked','reactivated','blocked_attempt')),
  actor uuid, call_id uuid references public.calls(id) on delete set null,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists compliance_log_org_time_idx on public.compliance_log (organization_id, created_at desc);
-- RLS: members read both; inserts into compliance_log only via the service role (no insert policy for authenticated,
-- so the log can't be forged from the browser); dnc_numbers writes for can_write_org.

-- Backfill from existing blocked contacts (adapt the phone normalisation to what the contacts table stores)
insert into public.dnc_numbers (organization_id, phone_e164, reason, source)
select distinct organization_id, phone, 'Backfilled from do-not-call contacts', 'call'
from public.contacts where status = 'inactive' and 'do-not-call' = any(tags) and phone is not null
on conflict do nothing;
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_dnc_registry.sql` | **new** |
| `src/lib/dnc.server.ts` | **new**: helpers |
| `src/lib/dnc.functions.ts` | **new**: list/add/reactivate/export server functions |
| `src/lib/crm-sync.server.ts`, `src/lib/sarvam.functions.ts`, campaign launch code | use the registry |
| `src/routes/_authenticated/_app/do-not-contact.tsx` | **new** |
| `src/components/app/AppShell.tsx` | nav link |
| `src/test/dnc.test.ts` | **new** |

## 7. Rules, edge cases, security

- The compliance log is **append-only**: no update or delete from the app.
- Reactivation always needs a reason and is always logged.
- An inbound caller (#19) on the DNC list may still call in, but **no outbound follow-ups** are scheduled.
- Normalise every number before comparing, so different spellings of the same number never get past the block.
- Only members of the org can see its registry.

## 8. Testing

**Unit tests:** `toE164` for every format above; `isBlocked` true/false and after a removal; `unblockNumber` without a reason throws; the campaign target filter excludes blocked numbers.

**Manual test script:**
1. Add `+91 90000 00001` manually → listed; the log shows `blocked`.
2. Import a CSV project containing `09000000001` as a new contact → run a campaign → that target is **skipped** (reason `do_not_contact`).
3. Test call to that number → refused; the log shows `blocked_attempt`.
4. Simulate a webhook where a caller says "do not call me" → the number is in the registry with a link to the call.
5. Reactivate it with a reason → the contact is active again; the log shows `reactivated` with your name.
6. Export CSV → it opens in Excel with every event.

```bash
npx vitest run src/test/dnc.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] An imported contact with a blocked number is skipped by a campaign
- [ ] One-off calls (and the API in #5) refuse blocked numbers
- [ ] The log shows when, how and by whom a number was blocked or reactivated; CSV export works
- [ ] Existing do-not-call contacts are backfilled
- [ ] The `isBlocked()` helper is documented for other issues

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/13-dnc-registry
git add db/migrations/00NN_dnc_registry.sql src/lib/dnc.server.ts src/test/dnc.test.ts
git commit -m "DNC: phone-level registry, compliance log and isBlocked helper"
git push -u origin feature/13-dnc-registry
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#13 Do-not-contact registry and compliance log" --body "Closes #13 ..."
```

## 11. In the pull request

- `Closes #13`; the migration to apply (with the backfill)
- The `isBlocked` / `blockNumber` signatures for teammates
- Screenshots of the registry and the log

## 12. Settle with the lead before starting

- Whether the national DND import is needed now.
- Who may reactivate numbers (admins only?).
