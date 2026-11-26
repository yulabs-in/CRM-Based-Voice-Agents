# End-to-End Tests (Playwright)

Covers the Call-to-Lead regression suite for Issue #17:
1. **Interested (insurance agent)** — Call completes, lead appears under **Leads -> Interested**, deal sits in `qualification`, and follow-up task exists.
2. **Consultation booked (stock agent)** — Deal moves to `proposal` stage and follow-up task exists.
3. **Not interested** — Call completes, no lead appears under **Leads -> Interested**.
4. **Do-not-contact** — Contact becomes `inactive` with `do-not-call`, and a second call attempt is refused.
5. **Webhook missing (sync path)** — Without sending a webhook, `/api/public/cron-sync` pulls the mocked Sarvam completion and creates the lead.

## Local Setup

Create `.env.e2e.local` (git-ignored) pointing to your **dev/staging** Supabase project (never production!):

```env
E2E_SUPABASE_URL=https://your-dev-project.supabase.co
E2E_SUPABASE_PUBLISHABLE_KEY=your-dev-publishable-key
E2E_SUPABASE_SERVICE_ROLE_KEY=your-dev-service-role-key
E2E_USER_EMAIL=e2e-bot@example.com
E2E_USER_PASSWORD=your-test-user-password
SARVAM_MOCK=1
```

Use a dedicated test project with the repository migrations applied. The sync fixture changes the project-wide cron token. Use the same project for all three Supabase settings and a dedicated test account. Stop any existing app on port 8080 before starting the suite.

Then run:

```bash
npx playwright install chromium
npm run e2e
```

## GitHub Actions CI Secrets

Add these 5 repository secrets under **Settings -> Secrets and variables -> Actions** so the `e2e` job in `.github/workflows/ci.yml` can run on every PR:
- `E2E_SUPABASE_URL`
- `E2E_SUPABASE_PUBLISHABLE_KEY`
- `E2E_SUPABASE_SERVICE_ROLE_KEY`
- `E2E_USER_EMAIL`
- `E2E_USER_PASSWORD`

CI checks these settings before installing Chromium:

- **None of the five set** (the current state, until a test Supabase project exists): the `e2e` job is skipped with a notice. It shows as passing, but **no CRM flow was exercised**.
- **Some set, some missing:** the job fails and names the missing ones.
- **All five set:** the full suite runs. A successful run lists five passing Chromium scenarios.

Use a dedicated test Supabase project, never production: the suite creates its own workspaces and users.

## Verifying Regression Detection

To verify the suite catches broken disposition mappings, temporarily change `interested` -> `qualified` in `src/lib/crm-outcome.ts` and run `npm run e2e`. Scenario 1 and Scenario 5 will fail because the lead will not appear under **Leads -> Interested**.
