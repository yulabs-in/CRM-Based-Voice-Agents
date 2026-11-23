# #18: Separate dev database and seed data

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/18 |
| **Assignee** | Tejaswini (`Tejaswini2706`) |
| **Branch** | `feature/18-dev-database` |
| **PR into** | `dev` |
| **Order** | Tejaswini's **1st** issue: it unblocks everyone |
| **Depends on** | the owner creating a second Supabase project (or branch) and giving you access |
| **Unblocks** | #17 E2E tests (Charan), and safe migration testing for the whole team |
| **Size** | ~4–5 days |

## 1. Summary

Today the `dev` branch preview (https://dev--yulabs-crm-1122.netlify.app) and production use the **same** Supabase database, so testing on dev can touch real customer data. After this issue, dev has its **own database**, filled with **seed data** (a realistic demo workspace with fake numbers) by **one command**, and there's a written, safe migration process.

## 2. What already exists

- Production Supabase project `yulabs-crm`; migrations in `db/migrations/0000_…` to `0017_…` (apply them in order).
- Netlify site with branch deploys: `main` → production, `dev` → the dev preview (`.github/workflows/deploy.yml`).
- Environment variables: `.env` (public: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_*`), and server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `SARVAM_API_KEY`, `PUBLIC_APP_URL`).
- `drizzle/` and `drizzle.config.ts` exist; check whether they're still used before relying on them.

## 3. Scope

**In scope:** the dev project set up with all migrations, a documented apply process, a seed script, an npm script, the Netlify branch env vars (documented; the owner applies them), a "migrate safely" checklist.

**Out of scope:** automatic migrations in CI, data copies from production (never copy real customer data).

## 4. What to build, point by point

### 4.1 Dev project
1. Ask the owner to create a Supabase project `yulabs-crm-dev` (same region as production) **or** a Supabase branch, and to add you as a developer.
2. Apply **every** migration in order. Two ways (document both in `db/README.md`):
   - **SQL editor:** open each file `0000` → `0017` in order, run it, and check for errors.
   - **Script:** `scripts/db-apply.mjs` that reads `db/migrations/*.sql` sorted by name and runs each against `DATABASE_URL` (the dev Postgres connection string) using `postgres` or `pg`, recording applied files in a `_migrations` table so reruns skip them. **Refuse to run if `DATABASE_URL` contains the production project ref.**
3. Things that need special handling, documented step by step: `0017` (pg_cron/pg_net, Vault token, and the cron job's target URL must be the **dev preview** URL); storage buckets (`avatars`, recordings); Auth settings (site URL, redirect URLs for the dev preview and localhost); the Realtime publication.

### 4.2 Seed data
4. `db/seed.sql` (plain SQL, idempotent) **or** `scripts/seed.mjs` (Node with the service role; better for creating an auth user). Recommended: Node.
5. What to create:
   - a demo user (`demo@yulabs.test` with a password from the env `SEED_DEMO_PASSWORD`) as owner of the workspace **"Demo Insurance & Advisory"**
   - 2–3 more users with other roles (sales_rep, voice_manager)
   - both voice agents (insurance and stock market advisory), with variables like the production migrations
   - 2 projects (CSV-style imports) with ~30 contacts. **Fake numbers only:** `+91 90000 000NN`, names from a fixed list, `example.com` emails
   - ~40 calls over the last 14 days with mixed statuses (completed, no_answer, failed), realistic `answers` (interested, not_interested, consultation_booked, callback with follow_up_time, do_not_contact, escalated), transcripts (3–8 turns), summaries, durations
   - leads and deals in **every** pipeline stage; tasks (open/done); a couple of meetings
   - one finished campaign with targets
6. Make it **idempotent**: rerunning doesn't duplicate (fixed UUIDs, or delete the demo org first with a `--reset` flag).
7. `package.json` scripts: `"db:apply": "node scripts/db-apply.mjs"`, `"db:seed": "node scripts/seed.mjs"`, `"db:reset-demo": "node scripts/seed.mjs --reset"`.
8. Env for the scripts: a `.env.dev.local` (git-ignored) with `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` for the **dev** project. Add an `.env.dev.example` with the names only.

### 4.3 Netlify (the owner applies it; you document it)
9. In Netlify → Site configuration → Environment variables, set **branch-specific values** for `dev`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_PROJECT_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_APP_URL=https://dev--yulabs-crm-1122.netlify.app`. Production keeps the current values.
10. Because the build reads `VITE_*` at build time, check the deploy workflow builds the `dev` branch with the dev values (GitHub Actions `environment: dev` secrets, or the Netlify env). Document exactly where each value comes from.

### 4.4 Process docs
11. `db/README.md`: how migrations work, how to apply them to dev, how to seed, how to reset, and the troubleshooting you hit.
12. A **"Migrate safely"** checklist added to `CONTRIBUTING.md`:
    1. write an additive migration in a PR
    2. the owner applies it to **dev** → check the dev preview
    3. merge to `dev`
    4. at release, apply it to **production** right before merging `dev` → `main`
    5. never edit an applied migration; write a new one

## 5. Data model

No schema changes. Optionally a `_migrations(filename text primary key, applied_at timestamptz)` table created by `db-apply.mjs` in the dev project.

## 6. Files

| File | Change |
|---|---|
| `scripts/db-apply.mjs` | **new** |
| `scripts/seed.mjs` (+ `scripts/seed-data/*.json`) | **new** |
| `db/README.md` | **new** |
| `.env.dev.example` | **new** (names only) |
| `package.json` | `db:*` scripts (+ `postgres` devDependency if used) |
| `CONTRIBUTING.md` | migrate-safely checklist; remove "dev and production share a database" once it's live |
| `.github/workflows/deploy.yml` | only if the dev build needs different env wiring (agree with the owner) |

## 7. Rules, edge cases, security

- **Never copy production data** into dev. Seed data is fake only.
- **Both scripts refuse the production project** (check the URL/ref against a constant).
- No secrets in the repo: `.env.dev.local` stays git-ignored (check with `git check-ignore`).
- The seed must not send anything (no Sarvam calls, no emails).
- The cron job in dev points at the dev preview, never at production.

## 8. Testing

1. **Fresh run:** create an empty project (or reset the branch) → `npm run db:apply` → `npm run db:seed` → sign in to a local app pointed at dev as the demo user → every page has data.
2. Rerun `npm run db:seed` → no duplicates.
3. Point the scripts at the production URL → they refuse with a clear message.
4. After the owner sets the Netlify variables: open the dev preview → you see **only seed data**; production is unchanged.
5. A unit test (`src/test/db-apply.test.ts`) for migration ordering and the production-guard function.

```bash
cp .env.dev.example .env.dev.local      # fill in the dev project values
npm run db:apply
npm run db:seed
npx vitest run && npm run build
```

## 9. Acceptance criteria

- [ ] The dev preview shows only seed data and no longer touches production
- [ ] Running the seed on an empty project gives a working demo in one command
- [ ] `db/README.md` lets someone else redo it from scratch
- [ ] The migrate-safely checklist is in `CONTRIBUTING.md`
- [ ] The scripts refuse to run against production

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/18-dev-database
git add scripts/db-apply.mjs scripts/seed.mjs db/README.md .env.dev.example package.json package-lock.json
git commit -m "Dev DB: migration runner and seed script"
git push -u origin feature/18-dev-database
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#18 Separate dev database and seed data" --body "Closes #18 ..."
```

## 11. In the pull request

- `Closes #18`
- The exact list of Netlify / GitHub env values the owner must set (names only, no values)
- Screenshots of the dev preview showing the demo workspace

## 12. Settle with the lead/owner before starting

- A separate project or a Supabase branch (cost and limits).
- Who sets the Netlify and GitHub environment values, and when.
