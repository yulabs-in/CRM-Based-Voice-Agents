# Contributing — branches, reviews and releases

## Branches

| Branch | What it is | Who writes to it |
|---|---|---|
| `main` | **Production.** Every push deploys the live site on Vercel (https://crm-based-voice-agents.vercel.app). | Only the owner, by merging `dev`. |
| `dev` | **Integration.** Everyone's finished work comes together here. Every push deploys the Vercel dev preview (https://crm-based-vo-git-e2aa64-thotakurayaswanth104-gmailcoms-projects.vercel.app, sign in with a Vercel team account). | Merged pull requests from feature branches. |
| `feature/<issue-number>-<short-name>` | One task / one GitHub issue. | The dev or intern working on it. |

```
feature/12-whatsapp-followup ──PR──▶ dev ──(owner merges when stable)──▶ main ──▶ live site
```

## Day-to-day (devs and interns)

Step-by-step guides (with PDFs) for each team member are in [`docs/team/`](docs/team/README.md), and the full context for every open issue is in [`docs/issues/README.md`](docs/issues/README.md).

1. Pick an issue and assign it to yourself.
2. Start from the latest `dev`:
   ```bash
   git checkout dev && git pull
   git checkout -b feature/12-whatsapp-followup
   ```
3. Commit small, clear steps. Never commit keys — secrets live in `.env.local` only (see `.env.example`).
4. Keep up to date: `git fetch && git rebase origin/dev` (or merge `origin/dev`).
5. Open a pull request **into `dev`** (not `main`). Use `Closes #12` in the description, add screenshots for UI changes, and say what you tested.
6. CI must be green (tests + production build). Get one review, then squash-merge into `dev`.
7. Check your change on the dev preview after it deploys. Every pull request also gets its own Vercel preview link in a comment from the Vercel bot.

## Releasing (owner)

1. Make sure the dev preview works and CI on `dev` is green.
2. Open a pull request **`dev` → `main`** titled `Release YYYY-MM-DD` listing what's included.
3. Merge it. The push to `main` deploys production automatically.
4. Hotfix: branch from `main` as `hotfix/<name>`, PR into `main`, then merge `main` back into `dev`.

## Deployments

Vercel hosts the app. Its GitHub app builds every push and every pull request; nothing to run by hand.

| Branch | Vercel URL | GitHub environment |
|---|---|---|
| `main` | https://crm-based-voice-agents.vercel.app | `production` |
| `dev` | https://crm-based-vo-git-e2aa64-thotakurayaswanth104-gmailcoms-projects.vercel.app (Vercel sign-in) | `dev` |
| pull requests | link in the Vercel bot's comment on the PR | none |

The **Deploy** workflow (`.github/workflows/deploy.yml`) waits for Vercel's build of each push to `main` or `dev`,
smoke-tests the live URL (key pages and the API's 401 without a key) and records the result on the repository's
**Deployments** page, linked to that URL. If Vercel's build fails or a page stops answering, the deployment
shows as failed there.

**Netlify (optional second host):** the same workflow also deploys to Netlify
(https://yulabs-crm-1122.netlify.app, dev at https://dev--yulabs-crm-1122.netlify.app), but only once the
repository secret `NETLIFY_AUTH_TOKEN` is set (Netlify → User settings → Applications → Personal access tokens,
then GitHub → Settings → Secrets and variables → Actions). Until then that job is skipped with a notice.

**Server environment variables** (`SUPABASE_SERVICE_ROLE_KEY`, `SARVAM_API_KEY`, `PUBLIC_APP_URL`, …) are set in each
host's dashboard (Vercel → Project → Settings → Environment Variables), never in the repository.

## Database changes

- Migrations are SQL files in `db/migrations/`, numbered in order (`0018_…`). One migration per PR, with a comment saying what it does.
- **The dev preview and production share the same Supabase database today.** Only the owner applies migrations, and only additive ones (new tables/columns) before the release that needs them. A separate dev database is planned — until then, test destructive changes locally only.

## Checks before opening a PR

- `npx vitest run` passes.
- `npm run build` succeeds.
- `npx tsc --noEmit` adds no new errors (10 known ones exist today).
- No secrets, `.env.local` or build output (`dist/`, `.netlify/`) in the diff.
