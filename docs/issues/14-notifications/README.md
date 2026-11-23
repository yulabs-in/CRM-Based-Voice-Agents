# #14: Notifications for new interested leads and escalations

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/14 |
| **Assignee** | Charan Varigonda (`CHARANVARIGONDA`) |
| **Branch** | `feature/14-notifications` |
| **PR into** | `dev` |
| **Order** | Charan's 2nd issue |
| **Depends on** | nothing |
| **Blocks** | nothing |
| **Size** | ~4 days (+1 for the optional email digest) |

## 1. Summary

The team hears about hot leads and escalations **straight away**. A bell in the top bar shows an unread count that updates **live** (no reload). It lists notifications for new interested leads, booked consultations, escalations (high priority) and do-not-contact requests.

## 2. What already exists

- `applyCallOutcomeToCrm` in `src/lib/crm-sync.server.ts` knows when a lead is created or moves to interested, when an escalation task is made, and when a contact is blocked.
- Realtime is already used for live call updates (migration `0014_call_outcomes_to_crm_and_realtime.sql` shows how tables are added to `supabase_realtime`).
- Top bar and account menu: `src/components/app/AppShell.tsx`.

## 3. Scope

**In scope:** the `notifications` table, a `notify()` helper, recipients logic, events from the sync, the bell UI with live updates, mark read / mark all read.

**Optional:** a morning email digest.

**Out of scope:** push notifications to phones, per-user notification preferences beyond "mute".

## 4. What to build, point by point

### 4.1 Database
1. Migration `00NN_notifications.sql` (§5): table, indexes, RLS (users see and update only their own), added to the `supabase_realtime` publication.

### 4.2 Server helper (`src/lib/notify.server.ts`)
2. `notify({ orgId, type, title, body?, link?, priority?, recipients })`: bulk insert, one row per recipient.
3. `recipientsFor(orgId, event, { dealOwnerId, assigneeId })`:
   - `lead.interested`, `consultation.booked` → the deal owner if set, otherwise all `owner`, `admin` and `sales_manager` members
   - `call.escalated` → owners, admins and sales managers (always), plus the deal owner. `priority = 'high'`
   - `contact.do_not_contact` → owners and admins
4. Never throw out of `notify()`. A notification failure must not break the CRM sync (`try/catch` and log).

### 4.3 Hook into the sync (small diff)
5. In `crm-sync.server.ts`, after the existing steps, call `notify` for:
   - a new lead created, or a lead moved to an interested/qualified status → "New interested lead: <name>" (body: product interest and a summary snippet; link `/leads?contact=<id>`)
   - consultation booked → "Consultation booked: <name>, <time>"
   - escalation task created → "Escalation: <name>, <reason>" (high)
   - do-not-contact → "<name> asked not to be contacted"
6. **Idempotent:** add `dedupe_key` (e.g. `lead.interested:<call_id>`) with a unique index on `(user_id, dedupe_key)`, and insert with `on conflict do nothing`. Webhook retries and the cron sync must not double-notify.

### 4.4 Bell UI (`src/components/app/NotificationBell.tsx`)
7. A bell icon button in the top bar (`aria-label="Notifications"`) with a red badge showing the unread count (9+ cap).
8. Popover: the latest 20 notifications. Unread ones are bold with a dot; high-priority ones have a red accent. Show relative time ("2 min ago"), title and body (2 lines).
9. Clicking an item marks it read and navigates to its `link`.
10. A "Mark all read" button, and a "View all" link to `/notifications` (a simple full list page with paging).
11. **Live:** subscribe with `supabase.channel('notifications').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.<uid>' }, ...)`. On insert, prepend it, bump the count, and show a toast for `priority = 'high'` only.
12. Unsubscribe on unmount and on org switch.

### 4.5 Optional: morning digest
13. At 8:30 IST, an email to each user: yesterday's interested leads and pending follow-ups. Use the existing cron route pattern (`/api/public/cron-sync`) or a separate scheduled route, and an email provider agreed with the lead.

## 5. Data model

```sql
-- 00NN_notifications.sql: per-user in-app notifications, delivered live via Supabase Realtime
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null, title text not null, body text, link text,
  priority text not null default 'normal' check (priority in ('normal','high')),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create unique index if not exists notifications_dedupe_key on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
alter table public.notifications enable row level security;
create policy "own read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "own mark read" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter publication supabase_realtime add table public.notifications;
```

Inserts come only from the server (service role); there is no insert policy for `authenticated`.

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_notifications.sql` | **new** |
| `src/lib/notify.server.ts` | **new** |
| `src/lib/crm-sync.server.ts` | calls to `notify` (small) |
| `src/components/app/NotificationBell.tsx` | **new** |
| `src/components/app/AppShell.tsx` | mount the bell |
| `src/routes/_authenticated/_app/notifications.tsx` | **new**: full list |
| `src/test/notify.test.ts` | **new** |

## 7. Rules, edge cases, security

- Users only ever see their own notifications (RLS). **Test this.**
- No duplicates on retries (`dedupe_key`).
- Notification failures never break call processing.
- Don't put full transcripts or sensitive answers in `body`; keep it to a short summary.
- Members removed from the org stop receiving new notifications (recipients are computed from current memberships).

## 8. Testing

**Unit tests:** `recipientsFor` for each event, with and without a deal owner; the dedupe key format; `notify` swallows errors (mock it to throw, and assert the sync continues).

**Manual:**
1. Open the app as user A (normal window) and user B (private window, same org, admin).
2. Simulate an interested webhook for a contact whose deal owner is A → A's bell updates **within seconds without a reload**; B gets nothing (A is the owner).
3. Simulate an escalation → both get a high-priority notification and a toast.
4. Replay the same webhook → no duplicate.
5. Mark read / mark all read → the count updates; reload → still read.
6. In B's console: `await supabase.from('notifications').select('*').eq('user_id','<A_ID>')` → returns nothing.

```bash
npx vitest run src/test/notify.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] An interested test call shows a notification within seconds, without a reload
- [ ] Escalations are high priority and reach managers
- [ ] Mark read / mark all read work; the unread count is correct
- [ ] No duplicates on webhook retry; users can't read others' notifications

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/14-notifications
git add db/migrations/00NN_notifications.sql src/lib/notify.server.ts
git commit -m "Notifications: table, recipients and notify helper"
git push -u origin feature/14-notifications
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#14 Notifications" --body "Closes #14 ..."
```

## 11. In the pull request

- `Closes #14`; the migration to apply
- A GIF of the bell updating live in two windows

## 12. Settle with the lead before starting

- The recipient rules per event.
- Whether the email digest is in scope now, and which email provider to use.
