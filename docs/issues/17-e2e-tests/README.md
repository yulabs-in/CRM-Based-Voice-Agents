# #17: End-to-end tests for the call to lead flow

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/17 |
| **Assignee** | Charan Varigonda (`CHARANVARIGONDA`) |
| **Branch** | `feature/17-e2e-tests` |
| **PR into** | `dev` |
| **Order** | Charan's 4th issue |
| **Depends on** | #18 seed data (Tejaswini). Start with your own fixtures if it isn't merged |
| **Blocks** | nothing |
| **Size** | ~5–6 days |

## 1. Summary

Automatically catch regressions in the most important flow: **place a call → Sarvam reports the result → the CRM shows the call, lead, deal and task correctly.** Playwright tests drive a real browser against a local dev server with a seeded workspace and a **mocked Sarvam**, and run in GitHub Actions on every PR.

## 2. What already exists

- Unit tests with Vitest (`src/test/*`), and CI in `.github/workflows/ci.yml` (Vitest plus build on PRs into `dev`/`main`).
- Webhook route: `src/routes/api/public/sarvam-call-webhook.ts`. It finds the call by id and checks `webhook_token_hash`, then runs `applyCallOutcomeToCrm`.
- Cron sync route: `src/routes/api/public/cron-sync.ts` (pulls from Sarvam when the webhook never arrives).
- Outcome mapping: `src/lib/crm-outcome.ts`.

## 3. Scope

**In scope:** Playwright setup, a test workspace and user, the Sarvam mock, 5 scenario tests, a CI job, an HTML report artifact on failure, and how-to-run docs.

**Out of scope:** visual regression, load testing, tests against production.

## 4. What to build, point by point

### 4.1 Setup
1. `npm i -D @playwright/test` and `npx playwright install --with-deps chromium`.
2. `playwright.config.ts`: `testDir: "e2e"`, `use.baseURL: "http://localhost:8080"` (match the dev server port), `webServer: { command: "npm run dev", url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 }`, retries 1 in CI, `trace: "retain-on-failure"`, `reporter: [["html", { open: "never" }], ["list"]]`.
3. Add npm scripts: `"e2e": "playwright test"` and `"e2e:ui": "playwright test --ui"`.
4. Make sure Vitest ignores `e2e/` (its `include` is `src/**`, so that's fine).
5. Add `playwright-report/` and `test-results/` to `.gitignore`.

### 4.2 Test data
6. Use the **dev database** from #18 (never production). The env vars for e2e: `E2E_SUPABASE_URL`, `E2E_SUPABASE_SERVICE_ROLE_KEY`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, read from `.env.e2e.local` locally and from GitHub Actions secrets in CI.
7. `e2e/fixtures/seed.ts`: before each test, create a fresh test org via the service role (or reset a known one): user membership, one agent, one contact with a fake number `+91 90000 0000x`. After each test, delete it. The tests must be independent.
8. `e2e/fixtures/auth.ts`: sign in once through the UI and save `storageState` for reuse.

### 4.3 Mock Sarvam
9. Placing a call hits Sarvam on the **server**, so browser-level `page.route` can't intercept it. Options (agree with the lead):
   - **a. Env switch (recommended):** `SARVAM_MOCK=1` makes `sarvam.server.ts` return a fake `{ call_id }` instead of calling Sarvam (one small `if` at the HTTP boundary). Never enabled in production; also check `NODE_ENV !== "production"`.
   - **b.** A tiny local mock HTTP server, with `SARVAM_API_BASE` pointing at it.
10. After "placing" the call, the test **POSTs a simulated webhook** to `/api/public/sarvam-call-webhook` with the call's id/token and a payload (`status: completed`, `final_agent_variables: { disposition: "interested", ... }`, a transcript, `duration`). Keep the payloads in `e2e/payloads/*.json`.

### 4.4 Scenarios (`e2e/call-to-lead.spec.ts`)
11. **Interested (insurance agent):** sign in → Voice Agents → Test call to the seeded contact (tick consent) → send the webhook → Call history shows **Completed** → Leads → Interested lists the contact with product interest → Pipeline shows the deal in **qualification** → Tasks has the follow-up task.
12. **Consultation booked (stock agent):** the deal goes to the proposal stage, and the follow-up/meeting exists (if #11 is merged).
13. **Not interested:** the call is completed, **no new lead**, and the deal (if any) is lost.
14. **Do-not-contact:** after the webhook, the contact is inactive with the `do-not-call` tag, and a **second test call is refused** with the do-not-call message.
15. **Webhook missing (sync path):** don't send the webhook; instead make the Sarvam mock report the call completed, and trigger the sync (call `/api/public/cron-sync` with the test token, or the in-app "Sync" action) → same result as scenario 11.
16. Use role/text selectors (`getByRole`, `getByText`), not CSS classes. Add `data-testid` only where needed.

### 4.5 CI
17. Add a job `e2e` to `.github/workflows/ci.yml` (on pull requests into `dev`/`main`): checkout → setup-node 22 → `npm ci` → `npx playwright install --with-deps chromium` → `npx playwright test`, with env from secrets and `SARVAM_MOCK=1`. Upload `playwright-report/` with `actions/upload-artifact@v4` if it fails.
18. The owner adds the secrets (`E2E_*`) in GitHub → Settings → Secrets → Actions. List the names in the PR.

## 5. Data model

None (uses the #18 dev project; fixtures create and delete their own data).

## 6. Files

| File | Change |
|---|---|
| `playwright.config.ts` | **new** |
| `e2e/call-to-lead.spec.ts` | **new** |
| `e2e/fixtures/seed.ts`, `auth.ts`, `webhook.ts` | **new** |
| `e2e/payloads/*.json` | **new**: fake webhook payloads |
| `src/lib/sarvam.server.ts` | `SARVAM_MOCK` switch (tiny) |
| `.github/workflows/ci.yml` | e2e job |
| `package.json` | scripts, devDependency |
| `.gitignore` | Playwright output |
| `e2e/README.md` | how to run locally |

## 7. Rules and edge cases

- **Never run against production.** Refuse to start if `E2E_SUPABASE_URL` equals the production URL.
- No real phone numbers and no real Sarvam calls in tests.
- Tests must be independent and repeatable (clean up, unique names with a timestamp).
- Flaky waits: use `expect(...).toBeVisible()` with auto-waiting, never `waitForTimeout`.

## 8. Testing the tests

1. All 5 scenarios pass locally: `npm run e2e`.
2. **Break a mapping on purpose** (e.g. in `crm-outcome.ts` make "interested" map to `lost`) → the suite fails with a clear message → revert. Mention this in the PR.
3. They pass in CI on your PR, and the report artifact appears when you force a failure.

```bash
npx playwright test                     # all
npx playwright test -g "do-not-contact" # one scenario
npx playwright test --ui                # watch mode with a browser
npx playwright show-report
```

## 9. Acceptance criteria

- [ ] 5 scenarios automated and passing locally and in CI
- [ ] The suite fails if a disposition mapping is broken (demonstrated)
- [ ] Sarvam is mocked; no real calls; never touches production
- [ ] The CI job runs on every PR, with the report uploaded on failure

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/17-e2e-tests
npm i -D @playwright/test
git add package.json package-lock.json playwright.config.ts e2e .gitignore
git commit -m "E2E: Playwright setup with seeded workspace and Sarvam mock"
git push -u origin feature/17-e2e-tests
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#17 End-to-end tests for call to lead" --body "Closes #17 ..."
```

## 11. In the pull request

- `Closes #17`; the GitHub secrets the owner must add; the broken-mapping demo; a screenshot of the report

## 12. Settle with the lead before starting

- Mock approach (a) or (b).
- Which test user/org in the dev project to use.
