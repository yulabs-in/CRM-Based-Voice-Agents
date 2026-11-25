# #8: UI/UX polish pass

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/8 |
| **Assignee** | Charan Varigonda (`CHARANVARIGONDA`) |
| **Branch** | several small ones: `feature/8-ui-polish-audit`, `feature/8-ui-polish-tables`, `feature/8-ui-polish-empty-states`, `feature/8-ui-polish-a11y`, `feature/8-ui-polish-landing` |
| **PR into** | `dev` (one PR per branch) |
| **Order** | Charan's **last** issue: it touches almost every page |
| **Depends on** | nothing; coordinate colours with #25 (dark mode, Shashank) |
| **Blocks** | nothing |
| **Size** | ~6–8 days spread over several PRs |

## 1. Summary

Make the whole app feel consistent and easy to use on every screen and at phone width: empty states, loading skeletons, friendly errors, readable tables, accessible controls, consistent headers and buttons, and the auth page's visual style carried to the landing page and onboarding.

## 2. What already exists

- UI kit: `src/components/ui/*` (shadcn), `PageHeader`, `EntityPage`, `StatusBadge`.
- Utilities: `shadow-soft`, `shadow-float`, `bg-gradient-primary`, `dot-canvas`, `animate-rise` (in `src/styles.css`).
- `src/routes/auth.tsx`: the visual reference, plus `friendlyError()`.
- Pages: `src/routes/_authenticated/_app/*.tsx` (dashboard, contacts, companies, deals, pipeline, leads, tasks, meetings, call-history, live-calls, transcripts, recordings, call-campaigns, projects, voice-agents, analytics pages, workflows, triggers, integrations, settings, team…).

## 3. Scope

**In scope:** visual and interaction fixes on existing pages; small shared components (`EmptyState`, `TableSkeleton`, `ResponsiveTable`).

**Out of scope:** new features, data model changes, big redesigns of a page's purpose, and dark mode (#25).

## 4. What to build, point by point

### 4.1 Audit first (PR 1, no code changes)
1. Open every sidebar page at **1440 px** and **375 px** (DevTools → device toolbar → iPhone SE).
2. For each page, note: spacing/alignment, overflow or horizontal scroll of the whole page, truncated tables, inconsistent buttons, missing empty/loading/error states, missing labels, contrast problems.
3. Post it as a checklist comment on issue #8 (page → problems → planned fix), and save it as `docs/ui-audit.md` in PR 1 with screenshots in the PR. This is your to-do list for the following PRs.

### 4.2 Shared components
4. `src/components/app/EmptyState.tsx`: icon, title, one-line description, and **one primary action** (e.g. "Import contacts"). Use it on every list page with no rows.
5. `src/components/app/TableSkeleton.tsx` (rows × columns of `Skeleton`) and `CardSkeleton`. Use them while queries load, instead of blank areas or spinners in the middle of the page.
6. `src/components/app/ErrorState.tsx`: a friendly message (via `friendlyError`) and a **Retry** button that calls `refetch()`.

### 4.3 Tables (one PR)
7. Wrap every table in a container with `overflow-x-auto`. The page itself must never scroll sideways.
8. Sticky header (`sticky top-0 bg-card z-10`), row hover (`hover:bg-muted/50`), min-widths on name/phone columns, and right-aligned numbers.
9. On ≤ 640 px: hide low-value columns (`hidden sm:table-cell`), or switch to a card list for the main tables (contacts, leads, calls).
10. Long text truncates with `truncate` and a `title` tooltip.

### 4.4 Consistency (one PR)
11. Every page uses `PageHeader` (title, description, primary action at the top right).
12. **One primary button per page**; the others are `variant="outline"` or `ghost`. Destructive actions are `variant="destructive"` with a confirm dialog.
13. Toasts only for things the user can't otherwise see (saved in background, copied, error). Not for "page loaded".
14. Consistent spacing: page padding, card gap `gap-4 md:gap-6`, form field spacing.

### 4.5 Accessibility (one PR)
15. Visible focus rings on every interactive element (`focus-visible:ring-2 ring-ring`). Don't remove outlines.
16. A `<Label>` on every input. Icon-only buttons get an `aria-label` ("Delete contact").
17. AA colour contrast (4.5:1 for text). Check muted text and badges with DevTools → Lighthouse or the contrast picker.
18. Dialogs: focus moves into the dialog, Tab is trapped, Esc closes, and focus returns to the trigger (shadcn `Dialog` does this; check custom ones).
19. Keyboard-only run: sign in → Voice Agents → Test call → open the call → Leads → open the lead.

### 4.6 Landing and onboarding (one PR)
20. Apply the auth page's style (cards, spacing, gradient accents, `animate-rise`) to the landing page and the onboarding flow.

## 5. Data model

None.

## 6. Files

| File | Change |
|---|---|
| `docs/ui-audit.md` | **new** (PR 1) |
| `src/components/app/EmptyState.tsx`, `TableSkeleton.tsx`, `ErrorState.tsx` | **new** |
| `src/routes/_authenticated/_app/*.tsx` | small targeted edits |
| `src/routes/index.tsx` (landing), onboarding route | style pass |

## 7. Rules (to keep PRs mergeable)

- **Small PRs, one theme each.** Rebase on `dev` daily: others are editing the same pages.
- **Don't reformat whole files** or rename things; change only what you're fixing, so diffs stay readable and conflicts stay small.
- If a page is being rebuilt by someone else (e.g. `voice-agents.tsx` by #9), skip it and polish it after their PR merges.
- Don't change behaviour or data. If you find a bug, open a separate issue.

## 8. Testing

- Before/after screenshots for every page you touch, at desktop and 375 px.
- Lighthouse (DevTools → Lighthouse → Accessibility) on 5 key pages before and after; put the scores in the PR.
- Keyboard-only run of the main flow (4.5 #19).
- A unit test for `EmptyState` / `ErrorState` rendering (React Testing Library is set up in `src/test/setup.ts`).
- `npx vitest run && npx tsc --noEmit && npm run build`

## 9. Acceptance criteria

- [ ] Audit checklist posted; every item fixed or explained
- [ ] Every list page has empty, loading and error states
- [ ] No page scrolls horizontally at 375 px; tables are readable
- [ ] Every input has a label; icon buttons have aria-labels; focus is visible; dialogs are keyboard-friendly
- [ ] One primary action per page; `PageHeader` everywhere
- [ ] Landing and onboarding match the auth page style
- [ ] Before/after screenshots in each PR

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/8-ui-polish-tables
git add src/components/app/TableSkeleton.tsx src/routes/_authenticated/_app/contacts.tsx
git commit -m "UI: responsive contacts table with sticky header"
git push -u origin feature/8-ui-polish-tables
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#8 UI polish: tables" --body "Part of #8 ..."
```

Use `Part of #8` in every PR except the last one, which uses `Closes #8`.

## 11. In the pull request

- Which audit items it fixes (link to the comment)
- Before/after screenshots (desktop and mobile) and Lighthouse scores

## 12. Settle with the lead before starting

- The order of pages (most-used first: Leads, Contacts, Call history, Campaigns, Dashboard).
- The colour tokens to agree with #25 before touching colours.
