# #5: API keys and a public REST API

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/5 |
| **Assignee** | Charan Varigonda (`CHARANVARIGONDA`) |
| **Branch** | `feature/5-api-keys` (you may split it into `feature/5-api-keys-ui` and `feature/5-rest-api`) |
| **PR into** | `dev` |
| **Order** | Charan's 1st issue: **others are waiting on it** |
| **Depends on** | nothing. Later, use `can()` from #16 for who may manage keys |
| **Blocks** | #6 MCP server (Tejaswini), #7 API docs (Shashank) |
| **Size** | ~6–8 days |

## 1. Summary

Customers can create **API keys** in Settings and use them to read and write their CRM data from their own systems over a **REST API** at `/api/v1/*`: contacts, leads, deals, calls, and placing an AI call. Keys are scoped (each grants only certain actions), revocable, hashed in the database, and **strictly limited to their own workspace**.

## 2. What already exists

- Server routes live in `src/routes/api/public/*.ts`. Copy their structure (`createFileRoute(...)({ server: { handlers: { GET, POST } } })`).
- The service-role client is `supabaseAdmin` from `@/lib/supabase-admin.server`. It **bypasses RLS**, so you must filter by `organization_id` yourself.
- `startSarvamCall` in `src/lib/sarvam.functions.ts` places a call (consent checks, do-not-call refusal, variable mapping).
- Tables: `contacts`, `leads`, `deals`, `calls` (with `answers`, `summary`, `transcript`, `transcript_turns`).
- Role helpers in SQL: `public.has_org_role(org, array['owner','admin']::public.org_role[])`.

## 3. Scope

**In scope:** `api_keys` table, the key-management UI, a shared auth helper, REST endpoints, JSON errors, pagination, rate limit, `last_used_at`, tests.

**Out of scope:** outgoing webhooks, OAuth apps, per-key IP allow-lists (you can note them as follow-ups).

## 4. What to build, point by point

### 4.1 Database
1. Migration `00NN_api_keys.sql` (see §5): the table, indexes, RLS for owners/admins only.

### 4.2 Key generation (server function)
2. `createApiKey({ organizationId, name, scopes })` as a server function (`createServerFn`):
   - check the caller is an owner/admin of the org (or `can(role,'api_keys.manage')` once #16 lands)
   - generate `yk_live_` + 32 random bytes as base62 (`crypto.getRandomValues`)
   - store `key_prefix` = the first 12 chars (e.g. `yk_live_Ab3x`) and `key_hash` = SHA-256 hex of the full key
   - return the **full key once**, and never store or log it
3. `revokeApiKey({ id })`: sets `revoked_at = now()`, owners/admins only.
4. `listApiKeys({ organizationId })`: never returns `key_hash`.

### 4.3 Settings → "API & MCP" page
5. New section or route `src/routes/_authenticated/_app/settings.api.tsx` (or a tab in `settings.tsx`; agree with the lead).
6. **Create key** dialog: name (required), scope checkboxes with a one-line explanation each, and a "Read-only" preset.
7. After creating: a dialog shows the full key in a monospace box with a **Copy** button and the warning "You won't see this key again."
8. Table: name, prefix (`yk_live_Ab3x…`), scopes as chips, created by, created, last used ("Never" / relative time), status (Active/Revoked), and a **Revoke** button with a confirm dialog.
9. Empty state: "No API keys yet. Create one to connect your website, sheets or AI assistant." plus a link to the docs (#7).

### 4.4 Auth helper (`src/lib/api-auth.server.ts`), shared with #6
10. `authenticateApiKey(request: Request, required: Scope): Promise<{ organizationId: string; keyId: string; scopes: Scope[] }>`
    - read `Authorization: Bearer <key>`; if it's missing or malformed → `ApiError(401, "unauthorized")`
    - hash it, then select from `api_keys` where `key_hash = ?` and `revoked_at is null`; if nothing → 401
    - if `required` isn't in `scopes` → `ApiError(403, "forbidden", "This key lacks the calls:write scope")`
    - rate limit (see 4.6) → `ApiError(429, "rate_limited")`
    - update `last_used_at` at most once per minute per key (fire-and-forget)
11. `apiError(e)` → `Response` with JSON `{ "error": { "code", "message" } }` and the right status.
12. `json(data, init?)` helper. Always set `Content-Type: application/json` and `Cache-Control: no-store`.

### 4.5 Endpoints (`src/routes/api/v1/…`)

| Method & path | Scope | Notes |
|---|---|---|
| `GET /api/v1/contacts` | `contacts:read` | `?q=` searches name/phone/email; `?project_id=`; pagination |
| `POST /api/v1/contacts` | `contacts:write` | body `{ first_name, last_name?, phone, email?, city?, project_id?, custom_fields? }`; normalise the phone; if the phone already exists in the org, update it instead of creating a duplicate (return 200 vs 201) |
| `GET /api/v1/contacts/:id` | `contacts:read` | 404 if it's not in the org |
| `PATCH /api/v1/contacts/:id` | `contacts:write` | partial update, whitelisted fields only |
| `GET /api/v1/leads` | `leads:read` | `?status=` filter |
| `GET /api/v1/deals` | `deals:read` | `?stage=` filter |
| `GET /api/v1/calls` | `calls:read` | `?status=&agent_id=&campaign_id=&since=` |
| `GET /api/v1/calls/:id` | `calls:read` | status, duration, answers, summary, transcript, recording URL (signed, short-lived) |
| `POST /api/v1/calls` | `calls:write` | body `{ phone, agent_id, contact_id?, variables?, consent_confirmed: true }`; reuse the core of `startSarvamCall`; refuse do-not-contact numbers (use `isBlocked()` from #13 when it lands); returns `{ id, status }` |

13. Move the shared query code into `src/lib/api/contacts.server.ts`, `calls.server.ts`, etc., so #6 can call the **same functions**.
14. Every query: `supabaseAdmin.from(t).select(cols).eq("organization_id", orgId)`. Never select `*`; whitelist the columns you return.
15. Validate bodies and query strings with zod. Bad input → 400 `invalid_request`, with the field in the message.

### 4.6 Pagination and rate limit
16. `?limit=` (default 50, max 200), `?cursor=` = an opaque base64 of `created_at|id`. Order by `created_at desc, id desc`. Response: `{ data: [...], next_cursor: string | null }`.
17. Rate limit: 60 requests/minute per key, using a fixed window in an in-memory `Map`. Add a comment that this is per server instance (good enough for now). Set the `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers.

## 5. Data model

```sql
-- 00NN_api_keys.sql: per-workspace API keys (only the SHA-256 of the key is stored)
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_org_idx on public.api_keys (organization_id);
alter table public.api_keys enable row level security;
create policy "admins read keys" on public.api_keys for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
create policy "admins create keys" on public.api_keys for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
create policy "admins revoke keys" on public.api_keys for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
grant select, insert, update on public.api_keys to authenticated;
grant all on public.api_keys to service_role;
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_api_keys.sql` | **new** |
| `src/lib/api-auth.server.ts` | **new**: auth, errors, rate limit |
| `src/lib/api-keys.functions.ts` | **new**: create/list/revoke server functions |
| `src/lib/api/*.server.ts` | **new**: shared queries (contacts, leads, deals, calls) |
| `src/routes/api/v1/contacts.ts`, `contacts.$id.ts`, `leads.ts`, `deals.ts`, `calls.ts`, `calls.$id.ts` | **new** |
| `src/routes/_authenticated/_app/settings*.tsx` | API & MCP section |
| `src/integrations/supabase/types.ts` | `api_keys` types |
| `src/test/api-auth.test.ts`, `src/test/api-contacts.test.ts` | **new** |

## 7. Rules, edge cases, security

- **The raw key is never stored, logged or returned twice.** Make sure you don't `console.log` the request headers.
- Use a constant-time comparison where you compare hashes in JS.
- **Cross-org isolation is the #1 risk:** every query filters by the key's `organization_id`, including lookups by id.
- Recording URLs: return a **signed URL** valid for ~10 minutes, never a permanent public URL.
- `POST /calls` needs `consent_confirmed: true`, otherwise 400. A blocked number → 409 `do_not_contact`.
- A revoked key stops working immediately (no caching of key lookups longer than a few seconds).

## 8. Testing

**Unit tests:**
- hashing is deterministic; `authenticateApiKey` returns 401 (missing header / unknown key / revoked key), 403 (missing scope), and success
- pagination cursor encode/decode round-trips; `limit` is clamped to 1–200
- zod validation errors become a 400 with a helpful message
- **cross-org:** with a mocked `supabaseAdmin`, `getContact(orgA, idFromOrgB)` returns null → 404

**Manual (dev server running; use the port Vite prints):**

```bash
KEY=yk_live_xxxxxxxx
BASE=http://localhost:8080
curl -s $BASE/api/v1/contacts -H "Authorization: Bearer $KEY" | jq
curl -s -X POST $BASE/api/v1/contacts -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"first_name":"Test","phone":"+919000000001"}' | jq
curl -s "$BASE/api/v1/calls?limit=5" -H "Authorization: Bearer $KEY" | jq
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/v1/contacts                       # 401
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/v1/contacts -H "Authorization: Bearer yk_live_wrong"   # 401
```

Then revoke the key (→ 401), use a read-only key for the POST (→ 403), and make 61 quick calls (→ 429).

## 9. Acceptance criteria

- [ ] An owner/admin can create, view (prefix only) and revoke keys; the full key is shown once
- [ ] A key from the UI works with `curl` on every endpoint in §4.5
- [ ] Revoked key → 401; missing scope → 403; bad input → 400; over the limit → 429
- [ ] A key from org A can never read or change org B's data (test included)
- [ ] `authenticateApiKey` and the shared query functions are reusable by #6
- [ ] All checks pass

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/5-api-keys
git add db/migrations/00NN_api_keys.sql src/lib/api-auth.server.ts
git commit -m "API keys: table, hashing and auth helper"
git push -u origin feature/5-api-keys
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#5 API keys and public REST API" --body "Closes #5 ..."
```

## 11. In the pull request

- `Closes #5`; "Migration `00NN_api_keys.sql` needs applying"
- The endpoint table with request/response examples (Shashank copies these into the #7 docs)
- The `authenticateApiKey` signature for Tejaswini (#6)
- curl output for 200 / 401 / 403 / 429

## 12. Settle with the lead before starting

- Is `/settings/api` its own route or a tab?
- Rate limit numbers; whether `deals:read` is a separate scope (as above) or part of `leads:read`.
