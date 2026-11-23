# Intern tasks — Yulabs CRM

Five features, one per intern (or pair). Each brief stands on its own. Read **Getting started** first.

## Getting started (everyone)

- **Stack:** TanStack Start (React + server functions), Vite, Tailwind v4, shadcn/ui, Supabase (Postgres, Auth, Storage, Realtime). Deployed on Netlify.
- **Run locally:** `npm install`, then `npm run dev` → http://localhost:5173. Ask the team lead for `.env.local` (server keys). **Never commit keys** — secrets go in `.env.local` only, never in `.env`.
- **Database:** project `yulabs-crm`. Schema changes are SQL files in `db/migrations/` (next free number on `origin/dev`, `0018_…` today). Every table is scoped by `organization_id` with row-level security — keep it that way.
- **Look and feel:** reuse what exists — `src/components/ui/*` (shadcn), `PageHeader`, `EntityPage`, `StatusBadge`, utilities `shadow-soft`, `shadow-float`, `bg-gradient-primary`, `dot-canvas`, `animate-rise`. The redesigned `src/routes/auth.tsx` is the reference for the visual style.
- **Checks before a PR:** `npx vitest run` passes, `npx tsc --noEmit` adds no new errors (10 exist today), and you've clicked through your feature on desktop and mobile width.
- **Workflow:** one branch per task (`feature/<issue>-<name>`), a PR into **`dev`** (never `main`) with screenshots, and a short note on what you tested. Step-by-step guides per member: [`docs/team/`](team/README.md); full context for every issue: [`docs/issues/README.md`](issues/README.md).

---

## 1. Profile page

**Goal:** a neat page where each person manages their own account.

**Already done for you:** migration `0016_profile_details_and_avatars.sql` (applied) adds `profiles.job_title`, `profiles.phone`, `profiles.preferred_language`, and a public `avatars` storage bucket where a user can only write inside `avatars/<their user id>/`.

**Build:**
- Route `src/routes/_authenticated/_app/profile.tsx` (`/profile`).
- Header card: avatar (upload / replace / remove; PNG, JPG or WebP, max 2 MB; initials when none), name, email, role in the current workspace (`useOrg()` in `src/lib/org.tsx`), member since.
- Edit form: full name, job title, phone, preferred language → `profiles` (RLS already allows self-update).
- Security: change password (`supabase.auth.updateUser({ password })`, with confirm field and the strength meter from `auth.tsx`), "Sign out of other devices" (`supabase.auth.signOut({ scope: "others" })`).
- Workspaces: list the user's memberships and role.
- Add **Profile** to the account menu in `src/components/app/AppShell.tsx`, and show the avatar there instead of the email initial.

**Done when:** a user can upload a photo, edit details and change their password; the header shows the new avatar without a reload; another user cannot overwrite someone else's avatar (test it).

---

## 2. API keys and a public REST API

**Goal:** let customers connect their own systems to the CRM.

**Build:**
- Table `api_keys` (migration): `id`, `organization_id`, `name`, `key_prefix` (first 8 chars, shown in UI), `key_hash` (SHA-256 — **never store the raw key**), `scopes text[]` (e.g. `contacts:read`, `contacts:write`, `leads:read`, `calls:read`, `calls:write`), `created_by`, `last_used_at`, `revoked_at`, `created_at`. RLS: only owners/admins of the org.
- Settings page **API & MCP**: create a key (show the full key **once** with a copy button), list keys (name, prefix, scopes, last used), revoke.
- REST routes under `src/routes/api/v1/` (see `src/routes/api/public/*.ts` for how server routes are written):
  - `GET/POST /api/v1/contacts`, `GET/PATCH /api/v1/contacts/:id`
  - `GET /api/v1/leads`, `GET /api/v1/deals`
  - `GET /api/v1/calls`, `GET /api/v1/calls/:id` (status, duration, answers, summary, transcript)
  - `POST /api/v1/calls` — place an AI call (reuse the logic in `startSarvamCall`, `src/lib/sarvam.functions.ts`; require `calls:write`)
- Auth: `Authorization: Bearer yk_live_…` → hash → look up an active key → scope check → query **only that organization's** rows with the service client.
- Consistent JSON errors (`{ "error": { "code", "message" } }`), pagination (`?limit=&cursor=`), basic rate limiting per key, update `last_used_at`.

**Done when:** a key created in the UI works with `curl`, a revoked key gets 401, a key without a scope gets 403, and a key from org A can never read org B's data (write a test for this).

---

## 3. MCP server for the CRM

**Goal:** let AI assistants (Claude, Cursor, etc.) work with the CRM through the Model Context Protocol.

**Depends on:** task 2 (API keys). Coordinate with that intern; you can start with a stub key check.

**Build:**
- An MCP endpoint at `/api/mcp` (Streamable HTTP transport, `@modelcontextprotocol/sdk`), authenticated with the same API keys and scopes.
- Tools (thin wrappers over the REST logic, not a second copy of it): `search_contacts`, `get_contact`, `create_contact`, `list_leads`, `list_deals`, `get_call` (summary, answers, transcript), `place_call`, `list_recent_calls`.
- Clear tool descriptions and input schemas (zod) — they are what the AI reads.
- `place_call` must require explicit consent (`consent_confirmed: true`) just like the app's test-call form.

**Done when:** you can add the server to Claude Desktop / Claude Code with a key, ask "show me today's interested leads" and "summarise the last call with +91…", and get correct, organization-scoped answers.

---

## 4. API and MCP documentation (with use cases)

**Goal:** a docs page a customer's developer can follow without asking us anything.

**Depends on:** tasks 2 and 3 (write against their real endpoints; start with the structure early).

**Build:**
- Route `/docs` (public) or `/settings/developers` (signed in) — agree with the team lead.
- Sections: Quick start (create a key → first `curl`), Authentication & scopes, every endpoint (request, response, errors) with copy-able `curl` and JavaScript examples, Webhooks/rate limits, MCP setup (Claude Desktop, Claude Code, Cursor config snippets).
- **Use cases** (step-by-step):
  1. Push website enquiries into Contacts automatically.
  2. Trigger an AI call when a new lead arrives, then read the result.
  3. Pull interested leads into a Google Sheet every morning.
  4. Ask an AI assistant over MCP: "Which callers want a consultation this week?"
  5. Sync deals to an external dashboard.

**Done when:** a teammate who has never seen the API completes use cases 1 and 2 using only the docs.

---

## 5. UI/UX polish pass

**Goal:** make the app feel consistent and easy to use on every screen.

**Do:**
- Walk every page in the sidebar on desktop and a 375 px phone width; list issues (spacing, alignment, overflow, truncated tables, inconsistent buttons) before fixing.
- Empty states with a clear next action on every list page; loading skeletons instead of blank areas; friendly error messages (see `friendlyError` in `auth.tsx`).
- Tables: horizontal scroll on mobile, sticky header, readable column widths, row hover.
- Accessibility: visible focus rings, labels on every input and icon button, colour contrast AA, keyboard navigation in dialogs.
- Consistent page headers (`PageHeader`), button hierarchy (one primary action per page), and toasts only for things the user can't otherwise see.
- Apply the auth page's visual language (cards, spacing, gradients) to the landing page and onboarding.

**Done when:** before/after screenshots for each page in the PR, no layout breaks at 375 px, and keyboard-only navigation works through the main flows (sign in → place a test call → open the call → see the lead).

---

### Who to ask
Voice agents and call sync: see `src/lib/sarvam.server.ts`, `src/lib/crm-sync.server.ts`. CRM outcome rules: `src/lib/crm-outcome.ts` (with tests in `src/test/crm-outcome.test.ts`). Database questions: `db/migrations/`.
