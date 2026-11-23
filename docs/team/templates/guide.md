# Developer guide: {{NAME}}

**GitHub:** `{{LOGIN}}` · **Repository:** https://github.com/yulabs-in/CRM-Based-Voice-Agents · **Updated:** {{DATE}}

This guide covers everything you need to build, test and ship your issues: one-time setup, the branch model and **where to push**, the daily development loop, testing, opening a pull request into `dev`, review and merge, checking the dev preview, and fixing common Git problems. The end of the guide has the full context for each of your issues.

## Your issues

{{ISSUE_TABLE}}

{{PLAN}}

---

## 1. The golden rules

1. **Never push to `main`.** `main` is production and is protected. Only the owner releases to it.
2. **Never commit straight to `dev`.** `dev` is the shared integration branch. Your work reaches `dev` only through a **pull request** that has been reviewed and has green CI.
3. **One issue = one branch = one pull request.** Branch name: `feature/<issue>-<short-name>`.
4. **Always start a branch from the latest `dev`.**
5. **Never commit secrets.** Keys live only in `.env.local`, which is git-ignored.
6. **Don't apply database migrations yourself.** Commit the SQL file; the owner applies it.
7. Run the checks (tests, type check, build) **before** you push for review.

## 2. Branches: what goes where

| Branch | What it is | Who pushes | Deploys to |
|---|---|---|---|
| `main` | Production | Owner only (protected) | https://yulabs-crm-1122.netlify.app |
| `dev` | Integration of everyone's finished work | Merged PRs only | https://dev--yulabs-crm-1122.netlify.app |
| `feature/<issue>-<name>` | Your work on one issue | **You** | nothing (CI runs on the PR) |

```
[your laptop]  feature/{{FIRST_BRANCH_SHORT}}
      |
      |  git push -u origin feature/{{FIRST_BRANCH_SHORT}}
      v
[GitHub]       feature/{{FIRST_BRANCH_SHORT}}
      |
      |  pull request (base: dev) -> CI green -> review -> squash-merge
      v
[GitHub]       dev    -> auto-deploys https://dev--yulabs-crm-1122.netlify.app
      |
      |  owner only: release PR dev -> main
      v
[GitHub]       main   -> auto-deploys https://yulabs-crm-1122.netlify.app
```

**Where you push:** `git push -u origin feature/<issue>-<name>`. That always goes to your own feature branch on `origin`. Then open a PR with **base = `dev`**.

## 3. One-time setup

### 3.1 Install the tools

| Tool | Version | Check |
|---|---|---|
| Git | 2.40+ | `git --version` |
| Node.js | **22** (same as CI) | `node -v` |
| npm | comes with Node | `npm -v` |
| GitHub CLI (optional, recommended) | latest | `gh --version` |
| VS Code (or Cursor) | latest | |
| cloudflared (only for webhook testing) | latest | `cloudflared --version` |

Windows: use **Git Bash** or PowerShell. All commands below work in both unless noted.

### 3.2 Tell Git who you are (once per computer)

```bash
git config --global user.name "{{NAME}}"
git config --global user.email "<the email on your GitHub account>"
git config --global pull.rebase true
git config --global init.defaultBranch main
```

### 3.3 Sign in to GitHub

```bash
gh auth login          # choose GitHub.com → HTTPS → login with a web browser
gh auth status         # should say: Logged in to github.com account {{LOGIN}}
```

Without `gh`, Git asks for credentials on your first push. Use the browser sign-in window (Git Credential Manager) or a Personal Access Token, **not** your password.

### 3.4 Clone the repository

```bash
git clone https://github.com/yulabs-in/CRM-Based-Voice-Agents.git
cd CRM-Based-Voice-Agents
git checkout dev
git pull
```

> Older clones may point at `yulabs-in/screenshot-exact-match`, the repository's old name. GitHub redirects it, but you can update it with `git remote set-url origin https://github.com/yulabs-in/CRM-Based-Voice-Agents.git`.

### 3.5 Install dependencies

```bash
npm ci                 # exact versions from package-lock.json (same as CI)
```

Use `npm ci`, not `npm install`, unless you are adding a package on purpose. If you do add a package (`npm install <pkg>`), commit both `package.json` **and** `package-lock.json`.

### 3.6 Environment variables

```bash
cp .env.example .env.local
```

`.env` (committed) holds the public Supabase values. `.env.local` (git-ignored) holds the server secrets. **Ask the team lead** for the values for `SUPABASE_SERVICE_ROLE_KEY`, `SARVAM_API_KEY` and `PUBLIC_APP_URL`. Never paste them into chat, issues, PRs, code or screenshots.

Check that Git ignores the file:

```bash
git check-ignore .env.local      # must print: .env.local
```

### 3.7 Run the app

```bash
npm run dev
```

Open the **Local** URL that Vite prints (for example `http://localhost:8080`). Sign up or sign in, and you should see the dashboard. Stop it with `Ctrl+C`.

### 3.8 Run the tests once, so you know the baseline

```bash
npx vitest run
npx tsc --noEmit       # 10 known errors exist today, so note the number you see
npm run build
```

## 4. Daily development loop

### 4.1 Start an issue

```bash
git checkout dev
git pull                                   # get everyone's latest merged work
git checkout -b feature/{{FIRST_BRANCH_SHORT}}       # new branch from dev
```

On GitHub, comment on the issue: "Starting on this today. Branch `feature/{{FIRST_BRANCH_SHORT}}`."

### 4.2 Work in small steps

```bash
npm run dev                  # keep it running; the page reloads on save
npx vitest                   # optional: tests in watch mode in a second terminal
```

### 4.3 See what changed

```bash
git status                   # which files changed
git diff                     # the exact lines
```

### 4.4 Commit

```bash
git add src/routes/_authenticated/_app/profile.tsx src/components/app/AppShell.tsx
git commit -m "Profile: upload and remove avatar"
```

- Add files **by name**. Avoid `git add .` unless you've checked `git status` and nothing unexpected (`.env.local`, `dist/`, `.netlify/`, screenshots) is listed.
- One idea per commit; present-tense message under ~70 characters; details in the body if needed.

### 4.5 Push your branch (do this often; it is your backup)

```bash
git push -u origin feature/{{FIRST_BRANCH_SHORT}}    # first push: creates the branch on GitHub
git push                                   # later pushes
```

This pushes only to **your feature branch**. It never touches `dev` or `main`.

### 4.6 Stay up to date with `dev` (at least daily, and before opening a PR)

```bash
git fetch origin
git rebase origin/dev        # replay your commits on top of the latest dev
# if there are conflicts: fix the files, then
git add <fixed files>
git rebase --continue
# when the rebase is done, update your remote branch:
git push --force-with-lease
```

`--force-with-lease` is safe on **your own** feature branch, because it refuses to overwrite commits you haven't seen. **Never force-push `dev` or `main`.**

Prefer merging? `git merge origin/dev`, then a normal `git push`. Either is fine; just be consistent within a branch.

## 5. Testing: what to run, and when

### 5.1 Automated checks (every PR, CI runs the first and third too)

```bash
npx vitest run               # all unit tests
npx vitest run src/test/crm-outcome.test.ts    # one file
npx vitest -t "interested"   # tests whose name matches
npx tsc --noEmit             # type check: no NEW errors
npm run build                # production build must succeed
npm run lint                 # lint
```

### 5.2 Writing unit tests

- Put tests in `src/test/<thing>.test.ts`. Vitest with jsdom (see `src/test/crm-outcome.test.ts` for the house style).
- Test **pure functions** first: parsers, rule lookups, permission checks, mappers. Move logic out of components and server routes into small functions so you can test it.
- Freeze time when it matters: `vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-23T10:00:00+05:30"))`.
- Mock network and Sarvam: `vi.mock("@/lib/sarvam.server", () => ({ ... }))`. Tests must never call real Sarvam or send real messages.

Example:

```ts
import { describe, expect, it } from "vitest";
import { classifyCallOutcome } from "@/lib/crm-outcome";

describe("classifyCallOutcome", () => {
  it("ignores calls that never connected", () => {
    expect(classifyCallOutcome({ status: "no_answer", answers: { disposition: "interested" } })).toBeNull();
  });

  it("qualifies an interested caller", () => {
    const r = classifyCallOutcome({ status: "completed", answers: { disposition: "interested" } });
    expect(r).toMatchObject({ leadStatus: "qualified", dealStage: "qualification" });
  });
});
```

### 5.3 Manual testing checklist

- [ ] The happy path works end to end.
- [ ] Error paths: empty input, bad input, network error. You see friendly messages, not a blank screen.
- [ ] Loading states show (throttle the network in DevTools → Network → "Slow 4G").
- [ ] Desktop width **and** 375 px (DevTools → device toolbar → iPhone SE).
- [ ] Keyboard only: Tab, Shift+Tab, Enter, Esc.
- [ ] Reload the page: state persisted where it should.
- [ ] **Security:** signed in as a second user in another workspace (use a private window), you cannot see or change the first user's data.
- [ ] Browser console has no new errors or warnings.

### 5.4 Testing webhooks and real calls locally

Sarvam can't reach `localhost`, so open a tunnel:

```bash
cloudflared tunnel --url http://localhost:<port>
# copy the https://xxxx.trycloudflare.com URL into PUBLIC_APP_URL in .env.local, then restart npm run dev
```

You can also simulate a webhook without placing a call:

```bash
curl -X POST http://localhost:<port>/api/public/sarvam-call-webhook \
  -H "Content-Type: application/json" \
  -d @test-payload.json
```

Keep sample payloads out of Git if they contain real data, and **only ever call your own number** with test calls.

### 5.5 Database changes

- Write the SQL in `db/migrations/NNNN_short_name.sql`. NNNN = the highest number on `origin/dev` + 1, checked when you open the PR (`git fetch && git ls-tree --name-only origin/dev db/migrations/ | tail -3`).
- Every table: `organization_id`, RLS on, policies scoped to the user's memberships. Additive changes only.
- Add the new types to `src/integrations/supabase/types.ts` (or ask the lead to regenerate it).
- **Do not run it against Supabase.** In the PR description, say "Migration `00NN_…` needs applying". The owner applies it before merging, while dev and production still share one database.

## 6. Open a pull request into `dev`

### 6.1 Final checks

```bash
git fetch origin && git rebase origin/dev
npx vitest run && npx tsc --noEmit && npm run build
git status                   # nothing unexpected; no .env.local, dist/, .netlify/
git push --force-with-lease  # or plain git push if you didn't rebase
```

### 6.2 Create the PR

**With GitHub CLI:**

```bash
gh pr create --base dev --head feature/{{FIRST_BRANCH_SHORT}} \
  --title "#{{FIRST}} <issue title>" \
  --body "Closes #{{FIRST}}

## What changed
- …

## How I tested
- npx vitest run (all green), npm run build OK
- Manual: …

## Screenshots
(before / after, desktop + 375 px)

## Migration
None | 00NN_name.sql needs applying"
```

**On the website:** open the repo → the yellow banner "feature/… had recent pushes" → **Compare & pull request** → set **base: `dev`** ← compare: your branch → fill in the title and body as above → **Create pull request**.

> Check the base branch: it must say **`dev`**. If it says `main`, change it (Edit next to the title).

Assign yourself, link the issue (`Closes #N` does this), and ask the team lead for review. Open it as a **Draft PR** early if you want feedback before it's finished: `gh pr create --draft …`.

### 6.3 CI and review

- CI runs `npx vitest run` and `npm run build` on every push to the PR. Watch it with `gh pr checks --watch` or in the PR's **Checks** tab.
- If CI is red, open the failed job log, fix the problem locally, commit, and push. The PR updates by itself.
- Review comments: fix them in new commits on the same branch, push, and reply "Done" (or explain) on each comment. Resolve conversations once they're handled.

```bash
gh pr view --web             # open your PR in the browser
gh pr status                 # your PRs and their checks
```

### 6.4 Merge

When CI is green and the PR is approved, the reviewer (or you, if told to) **squash-merges** into `dev`. Delete the branch on GitHub when asked (there's a button).

## 7. After the merge: check the dev preview

1. The push to `dev` triggers **Deploy** (GitHub → Actions). Wait for it to finish (a few minutes).
2. Open https://dev--yulabs-crm-1122.netlify.app and test your feature there, just as you did locally.
3. Comment on the issue: "Merged in #<PR>, verified on the dev preview." The issue closes automatically from `Closes #N`.
4. If something is broken on the preview, open a new small fix branch from `dev` straight away (`feature/<issue>-fix-<what>`).

### 7.1 Clean up locally and start the next issue

```bash
git checkout dev
git pull
git branch -d feature/{{FIRST_BRANCH_SHORT}}         # delete the local branch (safe: refuses if unmerged)
git fetch --prune                          # forget branches deleted on GitHub
git checkout -b feature/<next-issue>-<name>
```

After a squash merge, `git branch -d` may say "not fully merged". If the PR shows **Merged**, use `git branch -D …`.

## 8. Fixing common problems

**I committed on `dev` (or `main`) by mistake, and haven't pushed:**

```bash
git branch feature/<issue>-<name>      # keep your commits on a new branch
git reset --hard origin/dev            # put local dev back (on main: origin/main)
git checkout feature/<issue>-<name>
```

**I started coding before creating a branch (nothing committed yet):**

```bash
git checkout -b feature/<issue>-<name>  # your uncommitted changes come with you
```

**Rebase conflict:**

```bash
git status                     # files marked "both modified"
# open each file, keep the right parts, remove <<<<<<< ======= >>>>>>> markers
git add <file>
git rebase --continue
# give up and go back to how it was before:
git rebase --abort
```

For `package-lock.json` conflicts: take dev's version, then reinstall your package:

```bash
git checkout origin/dev -- package-lock.json   # start from dev's lock file
npm install                                     # re-adds your package on top
git add package-lock.json && git rebase --continue
```

**I need to switch tasks with unfinished work:**

```bash
git stash push -m "wip profile"     # put it aside
git checkout other-branch
git checkout -                      # come back
git stash pop
```

**Undo the last commit but keep the changes:** `git reset --soft HEAD~1`

**I committed a secret:** stop. Don't push. If you **already pushed**, tell the team lead **immediately** so the key can be rotated. Removing it from Git history isn't enough once it has been pushed.

**`npm ci` fails:** check `node -v` is 22. Delete `node_modules` and run `npm ci` again.

**Push rejected (`non-fast-forward`):** someone else, or you on another machine, pushed to your branch. Run `git pull --rebase` and then `git push`.

**`Permission denied` / 403 on push:** run `gh auth status`. Make sure you're pushing a `feature/...` branch (not `main`) and that you accepted the repository invitation.

## 9. Command cheat sheet

| I want to… | Command |
|---|---|
| Get latest dev | `git checkout dev && git pull` |
| Start an issue | `git checkout -b feature/<n>-<name>` |
| See changes | `git status` · `git diff` |
| Commit | `git add <files> && git commit -m "…"` |
| First push of a branch | `git push -u origin feature/<n>-<name>` |
| Later pushes | `git push` |
| Update with dev | `git fetch && git rebase origin/dev && git push --force-with-lease` |
| Run app | `npm run dev` |
| Unit tests | `npx vitest run` |
| Type check | `npx tsc --noEmit` |
| Build | `npm run build` |
| Open PR into dev | `gh pr create --base dev` |
| PR checks | `gh pr checks --watch` |
| My issues | `gh issue list --assignee @me` |
| Read an issue | `gh issue view <n>` |
| Comment on an issue | `gh issue comment <n> --body "…"` |
| Clean up after merge | `git checkout dev && git pull && git branch -d feature/<n>-<name>` |

## 10. Definition of done (every issue)

- [ ] Branch `feature/<n>-<name>` made from the latest `dev`
- [ ] Everything in the issue's "Done when" works
- [ ] Unit tests added for the new logic; `npx vitest run` is green
- [ ] `npx tsc --noEmit` shows no new errors; `npm run build` passes
- [ ] Tested at desktop and 375 px; keyboard works; a second workspace can't see the data
- [ ] No secrets, `.env.local`, `dist/` or `.netlify/` in the diff
- [ ] PR into **`dev`** with `Closes #n`, a test note, screenshots, and any migration called out
- [ ] CI green, review addressed, merged
- [ ] Verified on https://dev--yulabs-crm-1122.netlify.app and noted on the issue

---

# Your issues in detail

The sections below come from [`docs/issues/README.md`](../issues/README.md), which also explains how all the team's issues fit together (dependencies, shared files, migration numbering).

{{ISSUES}}
