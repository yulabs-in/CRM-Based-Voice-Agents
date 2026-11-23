# Yulabs CRM: intern issues, full context

This file explains **every open intern issue** (#4 to #25) in [yulabs-in/CRM-Based-Voice-Agents](https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues): why it exists, what is already in the code, what to build, which files to touch, how to test it, and when it counts as done.

Read it together with:

- [`CONTRIBUTING.md`](../../CONTRIBUTING.md): branches, reviews and releases
- [`docs/team/`](../team/): one step-by-step guide (and PDF) per team member: setup, development, testing, pushing to `dev`
- [`docs/intern-tasks.md`](../intern-tasks.md): the original task briefs

> **Where to push:** every issue gets its own branch `feature/<issue>-<short-name>`, pushed to `origin`, with a pull request **into `dev`**. Never push or open PRs into `main`. Only the owner releases `dev` → `main`.
>
> Note: the "Getting started" box inside each GitHub issue still says "PR into `main`". That is out of date. Use `dev`.

---

## 1. Team and assignments

| Member | GitHub | Issues |
|---|---|---|
| Kammar Shashank | `KAMMAR-SHASHANK` | #4, #7, #10, #13, #16, #19, #22, #25 |
| Tejaswini | `Tejaswini2706` | #6, #9, #12, #15, #18, #21, #24 |
| Charan Varigonda | `CHARANVARIGONDA` | #5, #8, #11, #14, #17, #20, #23 |

### Suggested order of work

| Order | Kammar Shashank | Tejaswini | Charan Varigonda |
|---|---|---|---|
| 1 | #4 Profile page | #18 Dev database and seed data | #5 API keys and public REST API |
| 2 | #10 Per-agent outcome rules | #9 Multi-agent setup | #14 Notifications |
| 3 | #16 Roles and feature access | #6 MCP server (after #5) | #11 Consultation booking |
| 4 | #13 Do-not-contact registry | #12 WhatsApp follow-up | #17 End-to-end tests (after #18) |
| 5 | #19 Inbound calls | #15 Agent analytics and A/B | #20 Lead-capture widget |
| 6 | #22 AI contact summary | #21 Transcript search and player | #23 Usage and cost dashboard |
| 7 | #25 Dark mode and PWA | #24 Email sync | #8 UI/UX polish pass (last) |
| 8 | #7 API and MCP docs (after #5, #6) | | |

Work on **one issue at a time**: one branch, one PR, merged, then the next. Small PRs get reviewed and merged faster.

### Dependencies (who waits for whom)

```
#5  API keys + REST (Charan) ─┬─▶ #6  MCP server (Tejaswini) ─┐
                              │                               ├─▶ #7 API & MCP docs (Shashank)
                              └───────────────────────────────┘
#18 Dev DB + seed (Tejaswini) ───▶ #17 E2E tests (Charan) uses the seed workspace
#10 Outcome rules (Shashank) ────▶ #14 Notifications, #11 Booking (Charan) both hook into crm-sync.server.ts
#13 DNC registry (Shashank) ─────▶ #19 Inbound, #20 Widget, #5 POST /calls must check the registry
#16 Roles (Shashank) ────────────▶ #5 API-key screen, #9 agent management must use the permission map
#9  Multi-agent (Tejaswini) ─────▶ #10 per-agent rules, #15 per-version analytics
#8  UI polish (Charan) touches many pages, so do it last and rebase often
```

If you are blocked, start with a stub (for example a fake key check or a hard-coded rule) behind a clear `TODO(#5)` comment, and swap it out when the other PR lands. Talk in the issue thread, so the other person sees it.

### Files several people will edit (coordinate)

| File | Touched by | Rule |
|---|---|---|
| `src/lib/crm-sync.server.ts` | #10, #11, #13, #14, #19, #22 | Add small, separate functions and call them, don't rewrite the file. Rebase before opening a PR. |
| `src/components/app/AppShell.tsx` | #4 (avatar), #14 (bell), #16 (hide nav), #25 (theme toggle), #8 | Keep each change local to its own component, for example `NotificationBell.tsx`. |
| `src/routes/_authenticated/_app/voice-agents.tsx` | #9, #10, #19 | #9 first. The others add tabs or sections. |
| `src/routes/_authenticated/_app/settings.tsx` | #5, #10, #16, #20, #23 | Each feature gets its own settings sub-section or route. |
| `db/migrations/` | almost everyone | See the numbering rule below. |
| `src/integrations/supabase/types.ts` | anyone adding tables | Regenerate or hand-add only your tables. Conflicts here are normal, so resolve by keeping both. |

---

## 2. Shared conventions

**Branch names:** `feature/<issue>-<short-name>`, e.g. `feature/5-api-keys`. Fixes to an existing PR go on the same branch.

**Commits:** small and clear, present tense: `Add api_keys table and RLS`, `Profile: upload avatar`. Put `Refs #5` in the body if you like. The PR closes the issue, not the commits.

**Pull requests:** base `dev`. Title `#5 API keys and public REST API`. Body: `Closes #5`, what changed, how you tested, and screenshots or GIFs for UI.

**Migrations:**
- One SQL file per PR in `db/migrations/`, named `NNNN_short_name.sql`. Today's highest is `0017`, so the next is `0018`.
- Pick the number **when you open the PR**: highest number on `origin/dev` + 1. If someone merges the same number before you, rename yours to the next free one.
- Every new table has `organization_id uuid not null references organizations(id)`, RLS enabled, and policies that use the same membership check the existing tables use (look at `0001`/`0014` for examples).
- Additive only (new tables/columns, nullable or with defaults). No `drop`, no renames.
- **Do not apply migrations to Supabase yourself.** Dev and production share one database until #18 is done. The owner applies them.

**Secrets:** keys live in `.env.local` (git-ignored) only. Never in `.env`, code, screenshots, issues or PRs. The Sarvam key and Supabase service-role key are server-only (`*.server.ts`, server functions, `src/routes/api/*`).

**Checks before every PR:**

```bash
npx vitest run          # unit tests pass
npx tsc --noEmit        # no NEW type errors (10 known ones exist today)
npm run build           # production build succeeds
npm run lint            # no new lint errors in files you touched
```

Then click through your feature at desktop width and at 375 px (phone).

**Look and feel:** reuse `src/components/ui/*` (shadcn), `PageHeader`, `EntityPage`, `StatusBadge`, and the utilities `shadow-soft`, `shadow-float`, `bg-gradient-primary`, `dot-canvas`, `animate-rise`. `src/routes/auth.tsx` is the visual reference.

**Code map:**

| Area | Where |
|---|---|
| Pages (signed in) | `src/routes/_authenticated/_app/*.tsx` |
| Public server routes / webhooks | `src/routes/api/public/*.ts` |
| Sarvam calls (server) | `src/lib/sarvam.server.ts`, `src/lib/sarvam.functions.ts` (`startSarvamCall`) |
| Call result → leads/deals/tasks | `src/lib/crm-sync.server.ts` (`applyCallOutcomeToCrm`) |
| Disposition rules | `src/lib/crm-outcome.ts` (`classifyCallOutcome`), tests in `src/test/crm-outcome.test.ts` |
| Workflows / automations | `src/components/app/WorkflowBuilder.tsx`, `src/lib/automation.server.ts` |
| Current workspace & role | `useOrg()` in `src/lib/org.tsx` |
| App shell / nav / account menu | `src/components/app/AppShell.tsx` |
| Supabase types | `src/integrations/supabase/types.ts`, `src/lib/db-types.ts` |
| Unit tests | `src/test/*.test.ts` (Vitest + jsdom) |

---

## 3. Issues in detail

<!-- Each "## #N" section below is copied into the member guides by scripts/build-team-docs.mjs. Keep the heading format. -->

## #4: Profile page

**Assignee:** Kammar Shashank · **Branch:** `feature/4-profile-page` · **Depends on:** nothing · **Blocks:** nothing

**Why:** users can't see or change their own details today. The account menu only shows an email initial.

**Already done:** migration `0016_profile_details_and_avatars.sql` (applied) adds `profiles.job_title`, `profiles.phone`, `profiles.preferred_language`, and a public `avatars` storage bucket where a user can only write inside `avatars/<their user id>/`.

**Build:**
1. Route `src/routes/_authenticated/_app/profile.tsx` → `/profile`.
2. Header card: avatar (upload / replace / remove; PNG, JPG or WebP; max 2 MB; initials when there is none), full name, email, role in the current workspace (`useOrg()`), member since (`profiles.created_at` or the auth user's `created_at`).
3. Edit form (react-hook-form + zod, like the other forms): full name, job title, phone (validate with `normalizePhoneNumber`), preferred language → update `profiles` (RLS already allows self-update).
4. Security card: change password with a confirm field and the strength meter from `auth.tsx` (`supabase.auth.updateUser({ password })`). Add a "Sign out of other devices" button (`supabase.auth.signOut({ scope: "others" })`).
5. Workspaces card: every membership with org name and role.
6. `AppShell.tsx`: add **Profile** to the account menu, and show the avatar instead of the email initial. Update it straight after upload (invalidate the profile query, no page reload).

**Avatar upload detail:** path `avatars/<user.id>/avatar-<timestamp>.<ext>`. Delete the old file after a successful upload. Store the public URL in `profiles.avatar_url` (check the column exists in `types.ts`; if it doesn't, add it in a small migration). Reject files over 2 MB or of the wrong type **before** uploading.

**Test:**
- Upload, replace and remove an avatar. The header updates immediately.
- Upload a 3 MB file or a `.gif`: you get a friendly error and nothing is uploaded.
- Edit details, reload, and check they persisted.
- Change password, sign out, then sign in with the new password.
- Security: signed in as user B, call `supabase.storage.from('avatars').upload('<userA-id>/x.png', file)` in the browser console. It must fail.
- Check at 375 px width.

**Done when:** a user can upload a photo, edit details and change their password; the header shows the new avatar without a reload; another user cannot overwrite someone else's avatar.

## #5: API keys and a public REST API

**Assignee:** Charan Varigonda · **Branch:** `feature/5-api-keys` · **Depends on:** nothing (use #16's permission map once it lands) · **Blocks:** #6 MCP server, #7 docs

**Why:** customers want to connect their own systems (website forms, sheets, dashboards) to the CRM.

**Build:**
1. Migration `api_keys`: `id`, `organization_id`, `name`, `key_prefix` (first 8 chars, shown in the UI), `key_hash` (SHA-256 hex, **never store the raw key**), `scopes text[]`, `created_by`, `last_used_at`, `revoked_at`, `created_at`. RLS: only owners and admins of the org can select, insert or update.
2. Scopes: `contacts:read`, `contacts:write`, `leads:read`, `deals:read`, `calls:read`, `calls:write`.
3. Key format: `yk_live_` + 32 random bytes base62 or hex (`crypto.getRandomValues`). Show it **once** with a copy button. After that, only the prefix is visible.
4. Settings → **API & MCP** page: create (name + scope checkboxes), list (name, prefix, scopes, created by, last used), revoke (with a confirm dialog).
5. Shared server helper `src/lib/api-auth.server.ts`: `authenticateApiKey(request, requiredScope)` → reads `Authorization: Bearer yk_live_…` → SHA-256 → finds an un-revoked key → checks the scope → returns `{ organizationId, keyId }`, or throws a 401/403 JSON error. #6 reuses this.
6. Routes under `src/routes/api/v1/` (copy the structure of `src/routes/api/public/*.ts`):
   - `GET /api/v1/contacts` (search `?q=`), `POST /api/v1/contacts`, `GET /api/v1/contacts/:id`, `PATCH /api/v1/contacts/:id`
   - `GET /api/v1/leads`, `GET /api/v1/deals`
   - `GET /api/v1/calls`, `GET /api/v1/calls/:id` (status, duration, answers, summary, transcript)
   - `POST /api/v1/calls`: places an AI call by reusing the logic in `startSarvamCall`. Requires `calls:write` and `consent_confirmed: true`, and refuses do-not-contact numbers.
7. Every query uses the service client **and** `.eq('organization_id', orgId)`. That filter is what keeps orgs apart.
8. Errors are always `{ "error": { "code": "unauthorized" | "forbidden" | "not_found" | "invalid_request" | "rate_limited", "message": "…" } }`. Pagination is `?limit=` (default 50, max 200) plus `?cursor=` (the last `created_at`/`id`). Responses include `next_cursor`.
9. Rate limit: for example 60 requests per minute per key (an in-memory map is fine to start; note the limitation). Update `last_used_at` on every request, at most once a minute.

**Test:**
- Unit tests (`src/test/api-auth.test.ts`): hashing, a valid key, a revoked key → 401, a missing scope → 403.
- With the dev server running:
  ```bash
  curl -s http://localhost:<port>/api/v1/contacts -H "Authorization: Bearer yk_live_xxx"
  curl -s -X POST http://localhost:<port>/api/v1/contacts -H "Authorization: Bearer yk_live_xxx" -H "Content-Type: application/json" -d '{"name":"Test User","phone":"+919999999999"}'
  ```
- Revoke the key and repeat: you get 401. Use a key without `contacts:write` for the POST: you get 403.
- **Cross-org test:** a key from org A asks for a contact id from org B and must get 404. Write this as a test.

**Done when:** a key created in the UI works with `curl`, a revoked key gets 401, a key without the scope gets 403, and a key from org A can never read org B's data.

## #6: MCP server for the CRM

**Assignee:** Tejaswini · **Branch:** `feature/6-mcp-server` · **Depends on:** #5 (start with a stub key check) · **Blocks:** #7

**Why:** AI assistants (Claude, Cursor and others) can then search contacts, read calls and place calls for a customer through the Model Context Protocol.

**Build:**
1. Endpoint `/api/mcp` (route file in `src/routes/api/`) using `@modelcontextprotocol/sdk` with the **Streamable HTTP** transport.
2. Auth: the same API keys as #5 (`authenticateApiKey`). Each tool checks its own scope.
3. Tools are thin wrappers that call the same functions as the REST routes. Move the shared query logic into `src/lib/api/*.server.ts` and don't copy it:
   - `search_contacts`, `get_contact`, `create_contact`, `list_leads`, `list_deals`, `get_call` (summary, answers, transcript), `list_recent_calls`, `place_call`
4. Zod input schemas with clear descriptions. The AI reads these descriptions to decide what to call, so write them for a human.
5. `place_call` requires `consent_confirmed: true` and refuses do-not-contact numbers, just like the test-call form.

**Test:**
- Unit test each tool handler with a fake org.
- Claude Code: `claude mcp add --transport http yulabs http://localhost:<port>/api/mcp --header "Authorization: Bearer yk_live_xxx"`, then ask "show me today's interested leads" and "summarise the last call with +91…".
- Claude Desktop / Cursor: add the same URL and header in their MCP config. Put the snippets in the PR for #7 to reuse.
- Check that a key from org A sees only org A's data, and that a key without `calls:write` can't use `place_call`.

**Done when:** the server can be added to Claude Desktop / Claude Code with a key, and those two questions return correct, organization-scoped answers.

## #7: API and MCP documentation (with use cases)

**Assignee:** Kammar Shashank · **Branch:** `feature/7-api-docs` · **Depends on:** #5 and #6 (set up the page structure early, fill in the content as they land)

**Why:** a customer's developer should be able to integrate without asking us anything.

**Build:**
1. Route: `/docs` (public) or `/settings/developers` (signed in). Agree with the team lead in the issue before starting.
2. Sections: Quick start (create a key → first `curl`), Authentication & scopes, every endpoint (method, path, scope, parameters, example request, example response, errors) with copy-able `curl` **and** JavaScript `fetch` examples, Pagination, Rate limits, Errors, MCP setup (Claude Desktop, Claude Code, Cursor config snippets).
3. Use cases, step by step:
   1. Push website enquiries into Contacts automatically.
   2. Trigger an AI call when a new lead arrives, then read the result.
   3. Pull interested leads into a Google Sheet every morning (Apps Script example).
   4. Ask an AI assistant over MCP: "Which callers want a consultation this week?"
   5. Sync deals to an external dashboard.
4. A copy button on every code block, a sidebar table of contents, and a page that works at phone width.

**Test:** run every example yourself against your local server and fix anything that doesn't work exactly as written. Then ask a teammate who has never used the API to complete use cases 1 and 2 using only the page, and note where they got stuck.

**Done when:** a teammate who has never seen the API completes use cases 1 and 2 using only the docs.

## #8: UI/UX polish pass

**Assignee:** Charan Varigonda · **Branch:** `feature/8-ui-polish` (or split: `feature/8-ui-polish-tables`, `feature/8-ui-polish-empty-states`, …) · **Depends on:** nothing, but **do it last**, because it touches many files others are editing

**Why:** the app should feel consistent and easy to use on every screen.

**Build:**
1. **Audit first.** Walk every sidebar page at desktop width and at 375 px. Post a checklist comment on issue #8 (page → problems). Fix from that list.
2. Empty states with a clear next action on every list page. Loading skeletons instead of blank areas. Friendly error messages (`friendlyError` in `auth.tsx`).
3. Tables: horizontal scroll on mobile, sticky header, readable column widths, row hover.
4. Accessibility: visible focus rings, labels on every input and icon-only button (`aria-label`), AA colour contrast, keyboard navigation and focus trap in dialogs.
5. Consistency: `PageHeader` on every page, one primary button per page, toasts only for things the user can't otherwise see.
6. Bring the auth page's visual language (cards, spacing, gradients) to the landing page and onboarding.

**How to keep it mergeable:** open several small PRs (one per area), rebase on `dev` daily, and don't reformat whole files. Only change what you are fixing.

**Test:** before/after screenshots per page in each PR. Chrome DevTools → device toolbar at 375 px. Keyboard only (Tab / Shift+Tab / Enter / Esc) through sign in → place a test call → open the call → see the lead. Lighthouse accessibility score before and after.

**Done when:** every page has before/after screenshots, there are no layout breaks at 375 px, and keyboard-only navigation works through the main flows.

## #9: Multi-agent setup: create and manage voice agents from the CRM

**Assignee:** Tejaswini · **Branch:** `feature/9-multi-agent` · **Depends on:** nothing · **Blocks:** #10, #15 (they build on agent/version data)

**Why:** adding an agent today means working in the Sarvam dashboard and then editing rows by hand.

**Today:** two agents exist (`YULabs Insurance`, `Stock Market Advisory`). Each is a `voice_agents` row pointing at a Sarvam agent (`sarvam_agent_id`, `sarvam_app_version`). Variables map to contact fields, lead-file columns (`custom.x`) or fixed values (`=text`, e.g. company name or SEBI number). See `src/lib/campaign-vars.ts`.

**Build:**
1. Agent cards on `voice-agents.tsx`: status, version, caller number, languages, and the last 7 days of calls, connect rate and interested %.
2. "New agent" wizard: start from a template (clone an existing Sarvam agent), then set name, greeting, no-name greeting, script and languages.
3. Variables editor: add or remove variables; pick the source (contact field, lead column, or fixed value with a text box); mark which ones are customer answers (post-call outputs).
4. Company facts panel for fixed values (company name, registration numbers, services, fees, website, hours).
5. Publish flow: save draft → test in a text chat (Sarvam `send_chat`) → commit a version → switch the CRM to it. Add version history and roll back.
6. Every Sarvam call goes through server functions (`*.server.ts` / `createServerFn`). The Sarvam key never reaches the browser.

**Test:**
- Unit tests for the variable-mapping logic (extend `src/test/campaign-vars.test.ts`).
- Create an agent from a template, chat with it, publish it, and place a test call to **your own** number.
- Roll back to the previous version, then confirm the CRM row points at the old version and a test call uses it.
- In DevTools → Network, confirm no request from the browser contains the Sarvam key.

**Done when:** a new agent can be created, tested in chat, published and used for a test call entirely from the CRM, and rolling back a version works.

## #10: Per-agent outcome rules and lead fields

**Assignee:** Kammar Shashank · **Branch:** `feature/10-agent-outcome-rules` · **Depends on:** nothing (nicer after #9)

**Why:** each agent should decide how its call outcomes move leads and deals, instead of one shared set of rules in code.

**Today:** `classifyCallOutcome` in `src/lib/crm-outcome.ts` maps dispositions (`interested`, `consultation_booked`, `not_interested`, `do_not_contact`, `escalated`…) to lead status and deal stage for every agent. Tests are in `src/test/crm-outcome.test.ts` and `src/test/crm-rules.test.ts`.

**Build:**
1. Migration `agent_outcome_rules` (`organization_id`, `agent_id`, `disposition`, `lead_status`, `deal_stage`, `probability`, `create_lead`, `create_task`, `block_contact`), unique on `(agent_id, disposition)`, with RLS.
2. Settings UI per agent: one row per disposition with dropdowns. A "Reset to defaults" button seeds from today's rules.
3. `crm-sync.server.ts`: look up the agent's rule for the disposition. If there is none, fall back to `classifyCallOutcome`. Keep the lookup in a pure function so it is easy to test.
4. Per-agent lead columns: choose which agent outputs show on the Leads page (insurance type for insurance; market interest and trading style for stock market).

**Test:**
- New unit tests: a rule present → it is used; no rule → fallback; a rule for agent A doesn't affect agent B.
- All existing tests still pass: `npx vitest run`.
- Manually: change "interested → deal stage" for one agent, simulate a webhook for each agent, and check that only that agent's deal moved differently.

**Done when:** changing a rule for one agent changes only that agent's leads and deals, existing tests pass, and there are new tests for rule lookup.

## #11: Consultation booking with calendar invites

**Assignee:** Charan Varigonda · **Branch:** `feature/11-consultation-booking` · **Depends on:** nothing

**Why:** a consultation booked on a call should land on the team's calendar automatically.

**Build:**
1. Time parser `src/lib/parse-followup-time.ts`: turns "tomorrow 11 AM", "day after tomorrow morning", "Monday evening", "25th at 3" into a datetime in **Asia/Kolkata**, relative to the call end time. Define defaults: morning = 10:00, afternoon = 14:00, evening = 18:00. Return `null` when unsure, and never guess wildly.
2. When the agent returns `consultation_booked` (or `callback` with `follow_up_time`), create a `meetings` row (the table exists) linked to the contact and deal from `crm-sync.server.ts`. Show it on the Meetings page and the contact timeline.
3. Owner assignment: the deal owner, otherwise round-robin among users with a chosen role (setting).
4. Optional: Google Calendar (OAuth per user, tokens server-side) to create the event and invite the advisor.

**Test:**
- Many parser unit tests (`src/test/parse-followup-time.test.ts`). Freeze "now" with `vi.setSystemTime`, and cover IST midnight edge cases and English/Hinglish phrasing.
- Simulate a `consultation_booked` webhook and check the meeting appears with the right time and owner.
- Running the same webhook twice must not create two meetings (idempotent by call id).

**Done when:** a consultation booked on a call shows up as a meeting with the right time and owner within a minute of the call ending.

## #12: WhatsApp follow-up after calls (approved templates)

**Assignee:** Tejaswini · **Branch:** `feature/12-whatsapp-followup` · **Depends on:** nothing

**Why:** send the brochure, company profile or quote options on WhatsApp after an interested call, as promised on the call.

**Build:**
1. Integration settings for a WhatsApp Business provider (Meta Cloud API, Gupshup, Twilio, … agree with the lead). Credentials are stored server-side only.
2. Template library per agent (approved templates only), with variables from the call (name, product, follow-up time).
3. Automation action "Send WhatsApp template" in `src/components/app/WorkflowBuilder.tsx` + `src/lib/automation.server.ts` (tests in `src/test/automation.test.ts`).
4. Send only when the caller gave consent (`consent_to_share = yes` for the stock agent), and never to do-not-contact numbers. Log every message on the contact timeline (`messages` table).
5. Idempotency: one call → at most one message per template.

**Test:**
- Unit tests: consent yes → send; consent missing/no → no send; replaying the same call → no second send.
- Use the provider's **test/sandbox number** and your own phone only.

**Done when:** an interested test call triggers exactly one WhatsApp message, and a call without consent triggers none.

## #13: Do-not-contact registry and compliance log

**Assignee:** Kammar Shashank · **Branch:** `feature/13-dnc-registry` · **Depends on:** nothing · **Used by:** #5, #19, #20

**Why:** never call someone who opted out, and be able to prove it.

**Today:** when a caller says "do not contact", "do not call" or "opt out", the CRM marks the contact `inactive` and tags it `do-not-call`. Campaigns skip inactive contacts and one-off calls to that number are refused.

**Build:**
1. Migration `dnc_numbers` (`organization_id`, `phone_e164`, `reason`, `source` (call / manual / import), `call_id`, `created_by`, `created_at`, `removed_at`, `removed_by`, `removed_reason`), unique on active `(organization_id, phone_e164)`, with RLS.
2. Migration `compliance_log` (`organization_id`, `phone_e164`, `contact_id`, `event` (consent_given / opt_out / reactivated / blocked_attempt), `actor`, `call_id`, `details jsonb`, `created_at`).
3. One helper `isBlocked(orgId, phone)` in `src/lib/dnc.server.ts`, used by campaigns, one-off calls, `POST /api/v1/calls` (#5), inbound follow-ups (#19) and the widget (#20).
4. Do-not-contact page: list, search, add a number by hand, and reactivate with a required reason. CSV export of the log.
5. Optional: import a national DND list (CSV).

**Test:**
- Unit tests for `isBlocked` and phone normalisation (`+91 98…`, `098…` and `98…` are all the same number).
- Import a contact whose number is blocked, run a campaign, and check that contact is skipped with a "blocked" status.
- Check the log shows when, how and by whom the number was blocked.

**Done when:** an imported contact with a blocked number is skipped by a campaign, and the log shows when and how the number was blocked.

## #14: Notifications for new interested leads and escalations

**Assignee:** Charan Varigonda · **Branch:** `feature/14-notifications` · **Depends on:** nothing

**Why:** the team should hear about hot leads and escalations straight away.

**Build:**
1. Migration `notifications` (`id`, `organization_id`, `user_id`, `type`, `title`, `body`, `link`, `priority`, `read_at`, `created_at`). RLS: users see only their own. Add the table to the `supabase_realtime` publication.
2. Create notifications from `crm-sync.server.ts` (via a small `notify()` helper): new interested lead, consultation booked, escalation (high priority), do-not-contact request. Decide who receives each: the deal owner, otherwise admins and managers.
3. `NotificationBell.tsx` in `AppShell.tsx`: unread count badge, dropdown list, mark read, mark all read, click → `link`. Live through Supabase Realtime (`postgres_changes` on `notifications` filtered by `user_id`).
4. Optional: a morning email digest (yesterday's interested leads and pending follow-ups).

**Test:**
- Unit test for "who gets notified" per event type.
- Open the app in two browser windows as two users, simulate an interested webhook, and check the right user's bell updates **without a reload**.
- User B must not be able to read user A's notifications (try it from the browser console).

**Done when:** finishing an interested test call shows a notification within seconds, without a reload.

## #15: Agent analytics and A/B testing of scripts

**Assignee:** Tejaswini · **Branch:** `feature/15-agent-analytics` · **Depends on:** #9 (version data) helps

**Why:** know which agent and which script version converts best.

**Build:**
1. Per-agent and per-version dashboard (Recharts): calls, connect rate, average duration, interested %, consultations booked, opt-out rate, top objections (from the `objections` answer).
2. Funnel: dialled → connected → interested → deal → won, filterable by agent, campaign and date.
3. A/B test: split a campaign between two agent versions (store the version on every `calls` row) and show the result with sample sizes. Show "not enough data" below a minimum (for example 30 connected calls per arm). No winner on tiny samples.
4. Do the heavy aggregation in SQL (a view or RPC), not in the browser.

**Test:** pick a week, count by hand with SQL on `calls` (`select count(*) … where created_at between …`), and compare with the dashboard. Run a 50/50 split test campaign on test numbers and check each call records its version.

**Done when:** the dashboard matches a manual count from the `calls` table for a chosen week, and a 50/50 campaign split records which version each call used.

## #16: Roles and feature access for users

**Assignee:** Kammar Shashank · **Branch:** `feature/16-roles-access` · **Depends on:** nothing · **Used by:** #5, #9, #23

**Why:** admins should decide which users can use which features.

**Today:** roles live in `memberships.role` (`owner`, `admin`, `sales_manager`, `sales_rep`, `voice_manager`, `support_agent`, `read_only`), with checks scattered across server functions.

**Build:**
1. One permission map `src/lib/permissions.ts`: role → features (`calls.place`, `campaigns.run`, `agents.manage`, `recordings.view`, `data.export`, `api_keys.manage`, `settings.manage`, …) plus `can(role, feature, overrides?)`. Use it on both client and server.
2. Team page: change a member's role, with optional per-user overrides (migration: `membership_permission_overrides`).
3. Hide nav items and buttons a user can't use, **and** enforce the same check in server functions and in RLS where possible. Hiding alone is not security.
4. Audit entries when roles or overrides change (who, whom, from → to, when).

**Test:**
- Unit tests for `can()` across every role.
- Sign in as a sales rep: the agent-management and API-key screens are hidden, and calling their server functions directly (copy the request from DevTools and replay it) returns 403.
- An admin grants the rep `agents.manage`, and the rep can now use it.

**Done when:** a sales rep can't open the agent-management or API-key screens (both UI and server refuse), and an admin can grant access.

## #17: End-to-end tests for the call to lead flow

**Assignee:** Charan Varigonda · **Branch:** `feature/17-e2e-tests` · **Depends on:** #18 seed data (start with your own fixtures if #18 isn't merged yet)

**Why:** catch regressions in the most important flow automatically.

**Build:**
1. Add Playwright: `npm i -D @playwright/test`, `npx playwright install chromium`. Config in `playwright.config.ts` with `webServer` starting `npm run dev`. Tests go in `e2e/`.
2. Seeded test workspace and user (from #18). **Mock Sarvam**: the outbound call request is intercepted or stubbed, and the test then POSTs a simulated payload to `/api/public/sarvam-call-webhook`.
3. Flow per case: sign in → place a test call → send the webhook → check the call shows Completed, the lead appears under Leads → Interested, the deal is in the right pipeline stage and the follow-up task exists.
4. Cases: interested; consultation booked (stock agent); not interested (no new lead); do-not-contact (contact blocked and the next call refused); webhook missing (the sync path).
5. CI: add a job to `.github/workflows/ci.yml` that runs `npx playwright test` on every PR, uploading the HTML report as an artifact when it fails. Test credentials come from GitHub Actions secrets, never from the repo.

**Test:** break a mapping on purpose (for example interested → wrong stage in `crm-outcome.ts`) and confirm the suite fails, then revert.

**Done when:** the suite runs green in CI and fails if a disposition mapping is broken.

## #18: Separate dev database and seed data

**Assignee:** Tejaswini · **Branch:** `feature/18-dev-database` · **Depends on:** nothing · **Unblocks:** #17, and lets everyone test migrations safely

**Why:** the `dev` branch and the dev preview still share the production database.

**Today:** `main` deploys production and `dev` deploys https://dev--yulabs-crm-1122.netlify.app, but both use the same Supabase project (`yulabs-crm`).

**Build:**
1. A second Supabase project (or a Supabase branch) for development. The owner creates it and gives you access. Apply every file in `db/migrations/` in order, and write down the exact steps in `db/README.md`.
2. Seed script (`db/seed.sql` or `scripts/seed.mjs`): a demo workspace with a few contacts, both voice agents, calls with transcripts and answers, and leads and deals in each pipeline stage. **No real phone numbers** (use `+91 90000 0000x`-style fakes).
3. One command: `npm run db:seed` (or similar) against an empty project gives a working demo.
4. Netlify: the `dev` branch deploy uses the dev database through branch-specific environment variables. Production keeps the current one. (The owner sets the variables; you document which ones.)
5. A "migrate safely" checklist in `CONTRIBUTING.md`: apply on dev first, check the preview, then apply to production during the release.

**Test:** run the seed on a fresh empty project from scratch, following only your README. Open the dev preview and check it shows only seed data.

**Done when:** the dev preview shows only seed data, and running the seed on an empty project gives a working demo in one command.

## #19: Inbound calls: the agent answers your business number

**Assignee:** Kammar Shashank · **Branch:** `feature/19-inbound-calls` · **Depends on:** #13 (respect DNC for follow-ups)

**Why:** when a customer calls the business number, a voice agent should answer and the call should land in the CRM like an outbound one.

**Build:**
1. Manage Sarvam inbound deployments (agent + connection + number) from the Voice Agents page: pick which agent answers, and set business hours.
2. Inbound webhook route `src/routes/api/public/sarvam-inbound-webhook.ts` (model it on `sarvam-call-webhook.ts`): create the `calls` row with `direction = 'inbound'`, find or create the contact by normalised phone, then run the same `applyCallOutcomeToCrm`.
3. Live Calls and Call History: an "Inbound" badge and a direction filter.
4. An inbound caller who opted out may still call in, but no outbound follow-up is scheduled for them.

**Test:**
- Unit test: an inbound payload creates the right `calls` row; an existing contact is matched by phone.
- With a tunnel (`cloudflared tunnel --url http://localhost:<port>`, set as `PUBLIC_APP_URL`), call the test number from your phone and watch the call, contact and lead appear.

**Done when:** calling the test number reaches the chosen agent, and the call, contact and (if interested) lead appear in the CRM within seconds.

## #20: Website lead-capture widget with instant AI callback

**Assignee:** Charan Varigonda · **Branch:** `feature/20-lead-widget` · **Depends on:** #13 helper (`isBlocked`). Uses its own widget key, **not** the #5 API key

**Why:** any website can embed a form that drops enquiries straight into the CRM, with an optional AI call within a minute.

**Build:**
1. `public/widget.js`: `<script src="https://…/widget.js" data-key="wk_…"></script>` renders a small form (name, phone, interest, consent checkbox required for the callback). Keep it dependency-free and style-isolated (Shadow DOM).
2. Migration `widget_settings` (`organization_id`, `widget_key`, `allowed_domains text[]`, `project_id`, `agent_id`, `instant_callback bool`, `colour`).
3. Public endpoint `src/routes/api/public/widget-submit.ts`: validates the widget key and `Origin` against the allowed domains, applies rate limits (per IP and per key) and spam protection (a honeypot field, plus rejecting submissions faster than ~3 s after render), and validates the phone with `normalizePhoneNumber`. Add CORS headers for allowed origins only.
4. Create or update the contact in the chosen project. If instant callback is on, consent is ticked and the number isn't blocked, place a call with the chosen agent.
5. Settings page: widget key (regenerate), allowed domains, agent, project, colour, a live preview, and copy-paste embed code.

**Test:**
- Unit tests: honeypot filled → rejected; too fast → rejected; bad phone → 400; disallowed origin → 403.
- Make a plain `test.html` page that embeds the widget (serve it with `npx serve` on another port and add that origin to the allowed domains), submit it, and check the contact appears. With callback on, your phone rings.

**Done when:** submitting the widget on a test page creates the contact, and with callback enabled, the phone rings within a minute.

## #21: Transcript search and a synced recording player

**Assignee:** Tejaswini · **Branch:** `feature/21-transcript-search` · **Depends on:** nothing

**Why:** find any moment in any call, and hear it.

**Build:**
1. Migration: a generated `tsvector` column on `calls` (transcript + summary) with a GIN index, plus an RPC `search_calls(q, filters)` that returns matches with `ts_headline` snippets.
2. Transcripts page: search box, filters for agent, outcome, date and language, and highlighted matches.
3. Call detail: a recording player with a waveform (for example `wavesurfer.js`). Clicking a transcript line seeks the audio there, and the current line highlights while it plays. Use Sarvam timestamps if available, otherwise estimate from turn order and length.
4. Highlight objections and agreed next steps in the transcript (from the call answers).

**Test:** search "renewal" and compare the matches with a manual `ilike` query. Click lines and check the audio jumps to the right place. Make sure orgs can't search each other's calls (the RPC must respect RLS / org id).

**Done when:** searching "renewal" lists matching calls with the phrase highlighted, and clicking a line plays from that point.

## #22: AI contact summary and next best action

**Assignee:** Kammar Shashank · **Branch:** `feature/22-ai-contact-summary` · **Depends on:** nothing

**Why:** open a contact and immediately understand where things stand and what to do next.

**Build:**
1. Server function `getContactInsight(contactId)`: collects recent calls (summaries, answers, objections), deals and tasks, and sends them to an LLM (agree on the provider and key with the lead; the key stays server-side). It returns JSON: a 3-line summary, sentiment trend, and one recommended next action with a reason.
2. Migration `contact_insights` (`organization_id`, `contact_id`, `summary`, `sentiment`, `next_action`, `reason`, `source_call_ids`, `generated_at`) as a cache. Refresh when `applyCallOutcomeToCrm` applies a new call.
3. A card on the contact page, and a hover card on the lead row. Label it clearly as "AI-generated".
4. The prompt must say: only use the given data, and if unsure, say so. Send no personal data beyond what the CRM already holds.

**Test:** unit-test the prompt builder and the output parser with fixtures (mock the LLM). For a contact with several calls, compare the card with the call history by hand. Simulate a new call and check the card refreshes within a minute.

**Done when:** for a contact with several calls, the card's summary matches the call history and refreshes within a minute of a new call.

## #23: Usage and cost dashboard

**Assignee:** Charan Varigonda · **Branch:** `feature/23-usage-dashboard` · **Depends on:** nothing (use #16's permission map for who can see costs)

**Why:** know how many minutes each agent and campaign uses, and what it costs.

**Build:**
1. Usage page: call minutes per day, per agent and per campaign; connected vs not-connected attempts; average call length. Aggregate in SQL (a view or RPC).
2. Settings: cost per minute and per attempt (migration `usage_settings`), and a monthly budget with a warning banner at 80% and an optional hard stop that blocks **new** campaigns from launching.
3. CSV export for accounting (date, agent, campaign, attempts, connected, minutes, estimated cost).

**Test:** pick a month, run `select sum(duration_seconds)/60.0 from calls where …` by hand, and compare with the dashboard. Set a tiny budget and check the 80% warning appears and the hard stop blocks launching a campaign.

**Done when:** the dashboard totals match a manual sum of `calls.duration_seconds` for a chosen month, and the budget warning appears when crossed.

## #24: Email sync on the contact timeline

**Assignee:** Tejaswini · **Branch:** `feature/24-email-sync` · **Depends on:** nothing

**Why:** see emails next to calls and tasks on each contact.

**Build:**
1. Connect a Gmail or Outlook account per user (OAuth). Tokens are stored server-side, **encrypted**, and never sent to the browser.
2. Sync messages to and from contacts' email addresses into the `messages` table (it exists). Show them on the contact timeline with calls and tasks.
3. Send an email from the contact page using templates, and log it on the timeline.
4. Store only emails with known contacts. Disconnecting deletes the stored tokens.

**Test:** use a test Gmail account. Exchange an email with a test contact and check it appears within a few minutes. Send from the CRM and check it is delivered and logged. Disconnect and confirm the tokens are gone from the database.

**Done when:** an email exchanged with a contact appears on their timeline within a few minutes, and one sent from the CRM is delivered and logged.

## #25: Dark mode and installable mobile app (PWA)

**Assignee:** Kammar Shashank · **Branch:** `feature/25-dark-mode-pwa` · **Depends on:** nothing (coordinate with #8 on colours)

**Why:** comfortable at night, and usable as an app on a phone.

**Build:**
1. Dark values for every design token in `src/styles.css` (`.dark { … }`). A toggle in the account menu (system / light / dark), saved per user (`profiles` column or localStorage plus profile). No flash of the wrong theme on load.
2. Check charts (Recharts colours), badges, gradients and the auth page in both themes (AA contrast).
3. PWA: `public/manifest.webmanifest`, icons (192/512 plus maskable), an offline-friendly shell (service worker caching static assets only, **never** API responses with customer data), and an "Install app" prompt. Live Calls and Leads must be usable at phone width.

**Test:** go through every page in dark mode and take screenshots. Run Lighthouse → PWA/installable. Install it on an Android phone (Chrome → Install) and an iPhone (Safari → Share → Add to Home Screen), and check it opens to the dashboard.

**Done when:** every page looks right in dark mode, and the app installs on Android and iOS home screens and opens to the dashboard.
