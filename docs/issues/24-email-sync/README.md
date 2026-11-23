# #24: Email sync on the contact timeline

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/24 |
| **Assignee** | Tejaswini (`Tejaswini2706`) |
| **Branch** | `feature/24-email-sync` (split if large: `feature/24-gmail-connect`, `feature/24-email-timeline`) |
| **PR into** | `dev` |
| **Order** | Tejaswini's 7th issue |
| **Depends on** | OAuth app credentials (Google Cloud and/or Microsoft Entra) from the lead |
| **Blocks** | nothing |
| **Size** | ~7–8 days |

## 1. Summary

See **emails next to calls and tasks** on each contact. Each user connects their Gmail or Outlook. Emails to and from known contacts sync into the CRM and show on the timeline, and users can send templated emails from the contact page, which are logged too. Only emails with known contacts are stored, and disconnecting removes the tokens.

## 2. What already exists

- The `messages` table (`channel`, `contact_id`, `recipient`, `subject`, `body`, `direction`, `status`, `created_by`).
- Contact timeline: `activity-timeline.tsx` / the contact page.
- The email page `email.tsx` (placeholder), the Integrations page.
- The cron route pattern (`/api/public/cron-sync`, migration `0017`) for periodic sync.

## 3. Scope

**In scope:** OAuth connect/disconnect per user (Gmail first; Outlook if time allows), encrypted token storage, periodic sync of messages with known contacts, timeline display, send with templates, logging.

**Out of scope:** a full mail client, attachments storage (store names only), shared team inboxes.

## 4. What to build, point by point

### 4.1 OAuth connect
1. Google: an OAuth client (web) with the scopes `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.send` (plus `openid email`). Redirect URIs: `http://localhost:8080/api/oauth/google/callback` and `https://dev--yulabs-crm-1122.netlify.app/api/oauth/google/callback` (and prod later). **The lead creates the client**; you get the id and secret in `.env.local`.
2. Routes: `GET /api/oauth/google/start` (signed-in user → builds the auth URL with a `state` = signed random value stored in a cookie, `access_type=offline`, `prompt=consent`) and `GET /api/oauth/google/callback` (verify `state`, exchange the code, store the tokens, redirect to Settings → Email with a success toast).
3. Outlook (optional): the same with Microsoft identity (`Mail.Read`, `Mail.Send`, `offline_access`).

### 4.2 Token storage
4. Table `email_accounts` (§5). Encrypt tokens with AES-256-GCM in `src/lib/crypto.server.ts`, using the key `EMAIL_TOKEN_KEY` (32 bytes base64, server env). Store `iv` and `ciphertext`. **No select policy for `authenticated`** on the token columns; the client reads account status through a server function that returns only `{ provider, email, connected_at, last_synced_at }`.
5. Refresh the access token automatically when it expires. If refresh fails → mark it `needs_reconnect` and show a banner to that user.

### 4.3 Sync
6. `syncEmailAccount(accountId)` in `src/lib/email-sync.server.ts`:
   - first run: the last 30 days. Later: incremental (Gmail `historyId`; store it on the account)
   - for each message: extract from/to/cc addresses → match against the org's `contacts.email` (lowercased). **No match → skip (don't store it).**
   - match → upsert `messages` by `(organization_id, external_id)`: `channel = 'email'`, `direction` (inbound if from the contact), `subject`, a plain-text `body` (strip HTML, cap ~20 KB), `contact_id`, the sent time, and `thread_id`
7. Schedule: every 5 minutes via the existing cron mechanism (add a step in `cron-sync`, or a separate scheduled route). Also a "Sync now" button.
8. Respect provider rate limits; process accounts in small batches.

### 4.4 Timeline and sending
9. The timeline shows emails with a mail icon, direction, subject, a 2-line snippet, time, and expand to read the full plain text.
10. A **Send email** dialog on the contact page: from (the user's connected account), to (the contact's email), template ▾, subject, body (variables `{{first_name}}`, `{{company_name}}`), Send.
11. Templates: a simple `email_templates` table (name, subject, body) with a management UI on the Email page.
12. Send via the Gmail API (`users.messages.send` with an RFC 2822 message, base64url), then log it to `messages` (`direction = 'outbound'`, `status = 'sent'`, `external_id`).

### 4.5 Disconnect
13. "Disconnect" → revoke the token at the provider (best effort) → **delete** the token row (or null the tokens). Synced messages stay unless the user ticks "Also delete synced emails".

## 5. Data model

```sql
-- 00NN_email_sync.sql: per-user connected mailboxes (encrypted tokens), email templates, message dedupe
create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  email text not null,
  token_iv text, token_ciphertext text,           -- encrypted {access_token, refresh_token, expiry}
  sync_cursor text, status text not null default 'connected',
  connected_at timestamptz not null default now(), last_synced_at timestamptz,
  unique (organization_id, user_id, provider)
);
alter table public.email_accounts enable row level security;   -- no policies for authenticated: server only

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, subject text not null, body text not null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
-- RLS tenant policies for email_templates

alter table public.messages add column if not exists external_id text,
  add column if not exists thread_id text, add column if not exists sent_at timestamptz;
create unique index if not exists messages_external_id_key on public.messages (organization_id, external_id) where external_id is not null;
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_email_sync.sql` | **new** |
| `src/lib/crypto.server.ts` | **new**: AES-GCM encrypt/decrypt |
| `src/lib/email/google.server.ts` (+ `microsoft.server.ts`) | **new**: OAuth, list, get, send |
| `src/lib/email-sync.server.ts` | **new** |
| `src/routes/api/oauth/google/start.ts`, `callback.ts` | **new** |
| `src/lib/email.functions.ts` | **new**: status, disconnect, send, templates |
| `email.tsx`, `integrations.tsx`, contact page / timeline | UI |
| `src/routes/api/public/cron-sync.ts` | add the email sync step (or a new scheduled route) |
| `src/test/email-sync.test.ts`, `src/test/crypto.test.ts` | **new** |

## 7. Rules, edge cases, security

- **Tokens are encrypted, server-only, never sent to the browser or logged.**
- **Only emails with known contacts are stored.** Everything else is skipped without being saved.
- Verify the OAuth `state` (CSRF protection).
- Dedupe by provider message id (no duplicates on re-sync).
- HTML emails → sanitised plain text. Never render raw HTML from emails.
- Disconnect removes the tokens; a failed refresh → the user is asked to reconnect.

## 8. Testing

**Unit tests:** encrypt/decrypt round trip, and a tampered ciphertext fails; address matching (case, display names `"Ravi" <ravi@x.com>`, multiple recipients); unknown sender → skipped; dedupe by external id; HTML → text; RFC 2822 builder for sending.

**Manual (use a test Gmail account only):**
1. Connect Gmail in Settings → Email → status Connected.
2. From the test account, email a contact whose address is in the CRM; also email a stranger.
3. "Sync now" (or wait 5 min) → only the contact's email appears on their timeline.
4. Reply from the contact's side → it appears as inbound.
5. Send from the CRM with a template → it's delivered (check the inbox) and logged on the timeline.
6. Disconnect → the token row is gone (check in the Supabase table editor: no ciphertext).

```bash
npx vitest run src/test/email-sync.test.ts src/test/crypto.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] An email exchanged with a contact appears on their timeline within a few minutes
- [ ] An email sent from the CRM is delivered and logged
- [ ] Only emails with known contacts are stored; tokens are encrypted and server-only
- [ ] Disconnecting removes the stored tokens

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/24-email-sync
git add db/migrations/00NN_email_sync.sql src/lib/crypto.server.ts src/lib/email
git commit -m "Email: Google OAuth connect with encrypted tokens"
git push -u origin feature/24-email-sync
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#24 Email sync on the contact timeline" --body "Closes #24 ..."
```

## 11. In the pull request

- `Closes #24`; the migration to apply; the env var names (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_TOKEN_KEY`; no values)
- Screenshots of the timeline with emails; the redirect URIs the lead must register

## 12. Settle with the lead before starting

- Gmail only, or Outlook too in v1.
- Who creates the OAuth apps (Google verification can take time for sensitive scopes, so start early).
