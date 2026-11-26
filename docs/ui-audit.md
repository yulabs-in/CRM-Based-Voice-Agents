# UI/UX Polish Audit (#8 — PR 1)

Audit of sidebar pages, landing, and onboarding at **1440 px (desktop)** and **375 px (iPhone SE mobile)** against the visual reference (`src/routes/auth.tsx`).

> Out of scope: dark mode tokens (#25, coordinated separately with Shashank), new features, and data-model changes.

---

## Summary of Cross-Cutting Issues Found

| Area | Problem | Planned PR |
|---|---|---|
| **Error / Empty / Loading states** | `EntityPage.tsx` renders `"No <entity> yet"` when `list.isError` is true (no error banner or Retry button). Non-`EntityPage` routes use ad-hoc skeletons/empty messages. | `feature/8-ui-polish-empty-states` |
| **Shared components** | Missing shared `EmptyState.tsx`, `TableSkeleton.tsx` (`CardSkeleton`), and `ErrorState.tsx` (with `friendlyError()` + `refetch()`). | `feature/8-ui-polish-empty-states` |
| **Tables & 375 px layout** | `EntityPage.tsx` toolbar (`flex items-center gap-3`) lacks `flex-wrap`, crowding search + `toolbar` tabs + count at 375 px. Tables lack `sticky top-0 bg-card z-10` headers, `hidden sm:table-cell` for secondary columns, and `truncate` + `title` tooltips on long text. | `feature/8-ui-polish-tables` |
| **Accessibility & Dialogs** | `EntityPage.tsx` uses browser `confirm()` for delete instead of an accessible `AlertDialog`. Some icon-only buttons, form inputs, and muted badge contrast ratios need explicit labels/focus-ring verification. | `feature/8-ui-polish-a11y` |
| **Consistency** | Ensure every page uses `PageHeader`, has at most one primary (`variant="hero"`) button, and uses `gap-4 md:gap-6` spacing. | `feature/8-ui-polish-a11y` |
| **Landing & Onboarding** | `src/routes/index.tsx` hero CTA row lacks `flex-wrap` at 375 px; feature cards and onboarding flow can align more closely with `auth.tsx` card/shadow/animation polish. | `feature/8-ui-polish-landing` |

---

## Page-by-Page Audit Checklist

### Overview & CRM
- [ ] **Overview (`/dashboard`)** — Add `ErrorState` on stats query failure; use `CardSkeleton` during initial load; verify KPI grid spacing at 375 px.
- [ ] **Projects (`/projects`, `/projects/$projectId`)** — Add `ErrorState` + `EmptyState`; make project target tables responsive (`overflow-x-auto`, `hidden sm:table-cell` on secondary fields).
- [ ] **Contacts (`/contacts`)** — `EntityPage` toolbar wrapping at 375 px (project filter + Import + New); replace `confirm()` delete with `AlertDialog`; add `ErrorState`.
- [ ] **Leads (`/leads`)** — `Interested / All` tablist + search box crowds at 375 px; truncate long `Interested in` / summary chips with `title` tooltip.
- [ ] **Companies (`/companies`), Deals (`/deals`), Tasks (`/tasks`), Meetings (`/meetings`)** — Inherit `EntityPage` fixes: `ErrorState`, `TableSkeleton`, sticky header, `AlertDialog` delete, responsive columns.
- [ ] **Sales Pipeline (`/pipeline`)** — Verify horizontal board scroll stays contained inside board wrapper (never scrolls whole page at 375 px); add `ErrorState`.

### Sales
- [ ] **Sales Orders (`/sales-orders`), Payments (`/payments`), Client KYC (`/kyc`), Renewals (`/renewals`)** — Inherit `EntityPage` `ErrorState`, sticky header, responsive columns, and right-aligned numeric amounts.

### AI Voice
- [ ] **Voice Agents (`/voice-agents`)** — *Coordinate with #9 updates before touching*; verify 375 px stacking and form labels.
- [ ] **Call Campaigns (`/call-campaigns`, `/call-campaigns/$campaignId`)** — Add `ErrorState`; ensure campaign targets table has sticky header, `hidden sm:table-cell` on secondary columns, and `truncate` on answers.
- [ ] **Call History (`/call-history`), Live Calls (`/live-calls`), Transcripts (`/transcripts`), Call Recordings (`/call-recordings`), Call Intelligence (`/call-intelligence`)** — Inherit `CallsPage` / `EntityPage` sticky header, `ErrorState`, `truncate` + `title` on `sarvam_failure_reason` / transcript snippets, and mobile column hiding.

### Automation & Communication
- [ ] **Workflows (`/workflows`), Triggers (`/triggers`), Rules (`/rules`), Scheduled Actions (`/scheduled-actions`)** — Verify consistent `PageHeader`, `EmptyState`, `ErrorState`, and responsive cards/tables at 375 px.
- [ ] **Email (`/email`), WhatsApp (`/whatsapp`), SMS (`/sms`), Activity Timeline (`/activity-timeline`)** — Verify `EmptyState` / `ErrorState` and long message truncation.

### Analytics & Usage
- [ ] **Sales / Call / Campaign Analytics, Team Performance, Reports, Custom Reports, Usage & Cost (`/usage`)** — Ensure `EmptyChart` / `ErrorState` consistency, `overflow-x-auto` on breakdown tables, and 375 px chart container widths.

### Workspace, Developers, Settings & Public
- [ ] **Notifications (`/notifications`), Profile (`/profile`), Team (`/team`), Integrations (`/integrations`), Settings (`/settings`, `/settings/widget`), Developers (`/developers/api`, `/developers/mcp`)** — Verify `PageHeader`, single primary CTA per page, `<Label>` on all inputs, and `aria-label` on icon-only buttons.
- [ ] **Landing (`/`) & Onboarding (`/onboarding`)** — Wrap hero buttons at 375 px (`flex-wrap`), align card shadows/spacing (`shadow-soft`, `animate-rise`) with `src/routes/auth.tsx`.

---

## Follow-up PR Plan
1. **PR 1 (`feature/8-ui-polish-audit`)** — This audit checklist (`docs/ui-audit.md`, no code changes).
2. **PR 2 (`feature/8-ui-polish-empty-states`)** — Shared `EmptyState`, `TableSkeleton` / `CardSkeleton`, `ErrorState` + unit tests + wire into `EntityPage` and main pages.
3. **PR 3 (`feature/8-ui-polish-tables`)** — Responsive wrapping toolbar, sticky headers, `hidden sm:table-cell`, `truncate` + `title` tooltips, right-aligned numbers.
4. **PR 4 (`feature/8-ui-polish-a11y`)** — `AlertDialog` delete confirmation, `PageHeader` & single-primary-button consistency, focus rings, `<Label>` / `aria-label` pass, AA contrast check.
5. **PR 5 (`feature/8-ui-polish-landing`)** — Landing & Onboarding visual alignment with `auth.tsx`.
