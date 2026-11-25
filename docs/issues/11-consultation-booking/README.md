# #11: Consultation booking with calendar invites

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/11 |
| **Assignee** | Charan Varigonda (`CHARANVARIGONDA`) |
| **Branch** | `feature/11-consultation-booking` |
| **PR into** | `dev` |
| **Order** | Charan's 3rd issue |
| **Depends on** | nothing |
| **Blocks** | nothing |
| **Size** | ~5–6 days (+2 for optional Google Calendar) |

## 1. Summary

When a caller books a consultation on an AI call ("tomorrow at 11", "day after tomorrow morning"), the CRM should automatically create a **meeting** at the right time in **IST**, linked to the contact and deal, assigned to an advisor. It shows on the Meetings page and the contact timeline. Optionally, it also creates a Google Calendar event and invites the advisor.

## 2. What already exists

- `meetings` table: `title`, `starts_at`, `duration_minutes`, `location`, `contact_id`, `notes`, `status` (no `deal_id`, owner or call link yet).
- Call answers in `calls.answers` (jsonb), e.g. `disposition: "consultation_booked"`, `follow_up_time: "tomorrow 11 AM"`, `consultation_mode: "phone"`.
- `applyCallOutcomeToCrm` in `src/lib/crm-sync.server.ts` runs after every completed call (webhook and cron sync).
- Pages: `meetings.tsx`, `activity-timeline.tsx`.

## 3. Scope

**In scope:** the time parser with lots of tests, meeting creation from the sync, owner assignment, a settings option, idempotency, display on Meetings and the timeline.

**Optional:** Google Calendar (OAuth per user).

**Out of scope:** rescheduling by SMS/WhatsApp, customer-facing calendar invites.

## 4. What to build, point by point

### 4.1 Database
1. Migration `00NN_meetings_from_calls.sql`: add `meetings.deal_id`, `meetings.owner_id`, `meetings.call_id` (unique when not null; this makes it idempotent), `meetings.source` (`manual`/`call`), `meetings.external_event_id`. Add `organizations.meeting_assignment` jsonb (or a small `booking_settings` table).

### 4.2 Time parser (`src/lib/parse-followup-time.ts`), pure, heavily tested
2. `parseFollowUpTime(text: string, reference: Date, tz = "Asia/Kolkata"): { start: Date; confidence: "exact" | "approximate" } | null`
3. Understand:
   - relative days: today, tonight, tomorrow, day after tomorrow, "in 2 days", next week
   - weekdays: Monday … Sunday, "next Monday", "this Friday" (the next occurrence, never in the past)
   - dates: "25th", "25 Dec", "25/12", "December 25"
   - times: "11", "11 AM", "11:30 am", "3 pm", "15:00", "half past 3", "3 o'clock"
   - parts of day: morning 10:00, afternoon 14:00, evening 18:00, night 20:00 (`approximate`)
   - Hinglish: "kal" (tomorrow), "parso" (day after), "subah" (morning), "shaam" (evening), "dopahar" (afternoon), "raat" (night)
4. A bare hour without am/pm: 1–7 → PM, 8–11 → AM, 12 → noon (business hours).
5. A result in the past (e.g. "11 AM" said at 2 PM) → move to the next day.
6. Unsure → return `null`. **Never guess wildly.** A null means "create a task to confirm the time" instead of a meeting.
7. Compute in IST and return a UTC `Date` (no library is needed; IST is UTC+5:30 with no DST, but write it as a helper `fromIst(y,m,d,h,min)`).

### 4.3 Create the meeting (sync)
8. In `crm-sync.server.ts`, add a call to a **new** function `maybeBookConsultation(call, contact, dealId, verdict)` in `src/lib/booking.server.ts`. Keep the change in the sync file to ~3 lines.
9. Trigger when the disposition is `consultation_booked`, **or** `callback` with a `follow_up_time` answer.
10. Parse `answers.follow_up_time` (or `callback_time`) relative to `call.ended_at`:
    - parsed → insert a `meetings` row: title "Consultation: <name>", `starts_at`, 30 min, `location` from `consultation_mode`, notes = call summary plus the raw time text, `call_id`, `deal_id`, `owner_id`, `source = 'call'`
    - not parsed → create a task "Confirm consultation time with <name> (said: '<text>')" due in 2 hours
11. **Idempotent:** `on conflict (call_id) do nothing`. Webhook retries and the cron sync must not create duplicates.

### 4.4 Owner assignment
12. Owner = the deal's owner if set; otherwise round-robin among members with the configured role (e.g. `sales_rep`), picking the user with the fewest meetings in the next 7 days (ties broken by name). Store the setting in `organizations.meeting_assignment`.
13. Settings UI: "Consultations are assigned to: Deal owner, else round-robin among [role ▾]".

### 4.5 Display
14. Meetings page: show call-booked meetings with a "From AI call" badge and a link to the call.
15. Contact timeline: a meeting entry with time and owner.

### 4.6 Optional: Google Calendar
16. Per-user OAuth (Google Calendar scope `calendar.events`). Tokens are stored server-side, encrypted.
17. On meeting creation, if the owner connected Google: create an event (IST), invite the owner, and save `external_event_id`.

## 5. Data model

```sql
-- 00NN_meetings_from_calls.sql: link meetings to calls/deals/owners so AI-booked consultations can be created
alter table public.meetings
  add column if not exists deal_id uuid references public.deals(id) on delete set null,
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists call_id uuid references public.calls(id) on delete set null,
  add column if not exists source text not null default 'manual',
  add column if not exists external_event_id text;
create unique index if not exists meetings_call_id_key on public.meetings (call_id) where call_id is not null;
alter table public.organizations add column if not exists meeting_assignment jsonb not null default '{"mode":"deal_owner_then_round_robin","role":"sales_rep"}';
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_meetings_from_calls.sql` | **new** |
| `src/lib/parse-followup-time.ts` | **new**: parser |
| `src/lib/booking.server.ts` | **new**: `maybeBookConsultation`, `pickOwner` |
| `src/lib/crm-sync.server.ts` | one call to `maybeBookConsultation` |
| `src/routes/_authenticated/_app/meetings.tsx`, `activity-timeline.tsx` | badge and link |
| `src/routes/_authenticated/_app/settings.tsx` | assignment setting |
| `src/test/parse-followup-time.test.ts`, `src/test/booking.test.ts` | **new** |

## 7. Rules and edge cases

- Times are always shown in IST in the UI and stored in UTC.
- A time on a Sunday or outside 9:00–20:00 → keep it, but add a note "Outside business hours" (don't move it silently).
- The same call processed twice → one meeting.
- A contact without a deal → `deal_id = null` is fine.
- No eligible owner → `owner_id = null`, plus a task for admins "Assign consultation".

## 8. Testing

**Parser unit tests** (aim for 30+ cases). Freeze time:

```ts
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-11-23T08:30:00Z")); // 14:00 IST, Monday
expect(parseFollowUpTime("tomorrow 11 AM", new Date())?.start.toISOString()).toBe("2026-11-24T05:30:00.000Z");
```

Cover: tomorrow 11 AM; day after tomorrow morning; Monday evening (next Monday); "11" at 14:00 → tomorrow 11:00; "kal subah"; "parso shaam 6 baje"; "25th at 3"; 23:50 IST "tomorrow" (date boundary); garbage text → null.

**Booking tests:** `pickOwner` round-robin fairness; a second call with the same `call_id` → no new meeting; an unparseable time → task, no meeting.

**Manual:** simulate a completed webhook with `disposition: consultation_booked`, `follow_up_time: "tomorrow 11 AM"` → the meeting appears on the Meetings page with the right IST time and owner. Replay the same webhook → still one meeting.

```bash
npx vitest run src/test/parse-followup-time.test.ts src/test/booking.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] A booked consultation becomes a meeting with the right time (IST) and owner within a minute of the call ending
- [ ] An unparseable time creates a "confirm time" task instead
- [ ] No duplicates on webhook retries or cron sync
- [ ] Shown on the Meetings page and the contact timeline with a link to the call
- [ ] 30+ parser tests; all checks pass

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/11-consultation-booking
git add src/lib/parse-followup-time.ts src/test/parse-followup-time.test.ts
git commit -m "Booking: IST follow-up time parser with tests"
git push -u origin feature/11-consultation-booking
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#11 Consultation booking" --body "Closes #11 ..."
```

## 11. In the pull request

- `Closes #11`; the migration to apply; the parser test table (input → expected)
- A screenshot of a call-booked meeting

## 12. Settle with the lead before starting

- The default consultation length, and business hours.
- Whether Google Calendar is in this PR or a follow-up.
