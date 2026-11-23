# Contributing — branches, reviews and releases

## Branches

| Branch | What it is | Who writes to it |
|---|---|---|
| `main` | **Production.** Every push deploys the live site (https://yulabs-crm-1122.netlify.app). | Only the owner, by merging `dev`. |
| `dev` | **Integration.** Everyone's finished work comes together here. Every push deploys the preview at https://dev--yulabs-crm-1122.netlify.app. | Merged pull requests from feature branches. |
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
7. Check your change on the dev preview after it deploys.

## Releasing (owner)

1. Make sure the dev preview works and CI on `dev` is green.
2. Open a pull request **`dev` → `main`** titled `Release YYYY-MM-DD` listing what's included.
3. Merge it. The push to `main` deploys production automatically.
4. Hotfix: branch from `main` as `hotfix/<name>`, PR into `main`, then merge `main` back into `dev`.

## Database changes

- Migrations are SQL files in `db/migrations/`, numbered in order (`0018_…`). One migration per PR, with a comment saying what it does.
- **The dev preview and production share the same Supabase database today.** Only the owner applies migrations, and only additive ones (new tables/columns) before the release that needs them. A separate dev database is planned — until then, test destructive changes locally only.

## Checks before opening a PR

- `npx vitest run` passes.
- `npm run build` succeeds.
- `npx tsc --noEmit` adds no new errors (10 known ones exist today).
- No secrets, `.env.local` or build output (`dist/`, `.netlify/`) in the diff.
