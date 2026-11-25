# #16: Roles and feature access for users

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/16 |
| **Assignee** | Kammar Shashank (`KAMMAR-SHASHANK`) |
| **Branch** | `feature/16-roles-access` |
| **PR into** | `dev` |
| **Order** | Shashank's 3rd issue (land it early: others use it) |
| **Depends on** | nothing |
| **Used by** | #5 API-key screen, #23 costs (Charan), #9 agent management (Tejaswini), #10 rules (you) |
| **Size** | ~5–6 days |

## 1. Summary

Admins decide which users can use which features. One **permission map** says what each role can do; admins can grant or remove single features per user; the UI hides what a user can't use, **and the server refuses it too**. Every change is audited.

## 2. What already exists

- `memberships.role` (enum `public.org_role`): `owner`, `admin`, `sales_manager`, `sales_rep`, `voice_manager`, `support_agent`, `read_only`.
- SQL helpers: `public.is_org_member(org)`, `public.has_org_role(org, roles[])`, `public.can_write_org(org)`.
- Role checks scattered in server functions (search for `role` / `has_org_role` / `"owner"` in `src/lib/*.functions.ts`).
- Team page: `src/routes/_authenticated/_app/team.tsx`; `useOrg()` returns the current role.

## 3. Scope

**In scope:** the permission map, per-user overrides, a `can()` helper for client and server, the team page role/override editor, nav/button hiding, server enforcement in existing server functions, RLS where it matters, an audit log.

**Out of scope:** custom roles created by admins (note it as a follow-up), field-level permissions.

## 4. What to build, point by point

### 4.1 Permission map (`src/lib/permissions.ts`), shared by client and server
1. Features (string union):
   `calls.place`, `campaigns.run`, `agents.manage`, `recordings.view`, `transcripts.view`, `data.export`, `contacts.edit`, `contacts.delete`, `api_keys.manage`, `settings.manage`, `team.manage`, `billing.view`, `dnc.manage`.
2. `ROLE_PERMISSIONS: Record<OrgRole, Feature[]>`, for example:

| Feature | owner | admin | sales_manager | sales_rep | voice_manager | support_agent | read_only |
|---|---|---|---|---|---|---|---|
| calls.place | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| campaigns.run | ✓ | ✓ | ✓ | | ✓ | | |
| agents.manage | ✓ | ✓ | | | ✓ | | |
| recordings.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| data.export | ✓ | ✓ | ✓ | | | | |
| api_keys.manage | ✓ | ✓ | | | | | |
| settings.manage | ✓ | ✓ | | | | | |
| team.manage | ✓ | ✓ | | | | | |
| billing.view | ✓ | ✓ | ✓ | | | | |
| dnc.manage | ✓ | ✓ | ✓ | | | ✓ | |

   (Agree the final table with the lead; put it in the PR.)
3. `can(role, feature, overrides?: { grant: Feature[]; revoke: Feature[] }): boolean`. Owners can always do everything (revokes don't apply to owners).
4. A React hook `useCan(feature)` built on `useOrg()` plus the user's overrides.
5. A `<Can feature="agents.manage">…</Can>` component for hiding UI.

### 4.2 Server enforcement
6. `requirePermission(context, orgId, feature)` in `src/lib/permissions.server.ts`: loads the membership and overrides, and throws a 403-style error "You don't have access to manage agents."
7. Add it at the top of every sensitive server function: agent create/edit/publish, campaign launch, exports, API keys, settings, team changes, DNC reactivation.
8. Where the database is written directly from the client (RLS), add policies for the most sensitive tables (e.g. `voice_agents` write needs `owner/admin/voice_manager`), using a SQL function `public.has_feature(org, feature)` that mirrors the map. **Keep the SQL map and the TS map in sync**; a unit test compares them (export the TS map to a JSON fixture that the migration comment references).

### 4.3 Team page
9. Members table: name, email, role ▾ (owners/admins only), "Custom access" badge if there are overrides, last active.
10. A "Customise access" drawer: a checkbox per feature showing the role default; ticking or unticking creates a grant or revoke override. "Reset to role defaults".
11. Rules: you can't demote the last owner; you can't change your own role; only owners can make owners.

### 4.4 Hide in the UI
12. Sidebar (`AppShell.tsx`): hide nav items whose feature the user lacks (Voice Agents edit, Settings, Team, API keys, exports).
13. Buttons: Launch campaign, Export CSV, Edit agent, Delete contact, Revoke key: wrap in `<Can>`.
14. Direct URL to a forbidden page → show "You don't have access to this page", plus a link back (don't crash).

### 4.5 Audit
15. A `role_audit` table: who changed whose role/overrides, from → to, when. Show it at the bottom of the Team page (admins).

## 5. Data model

```sql
-- 00NN_roles_access.sql: per-user permission overrides, audit of role changes, and has_feature() for RLS
create table if not exists public.membership_permission_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  granted boolean not null,            -- true = grant, false = revoke
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, feature)
);
create table if not exists public.role_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor uuid default auth.uid(), target_user uuid not null,
  change jsonb not null,               -- {"role":{"from":"sales_rep","to":"sales_manager"}} or {"grant":"agents.manage"}
  created_at timestamptz not null default now()
);
-- RLS: members read overrides of their org; only owners/admins write overrides and read the audit.
-- create or replace function public.has_feature(_org uuid, _feature text) returns boolean ... security definer ...
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_roles_access.sql` | **new** |
| `src/lib/permissions.ts` | **new**: map, `can`, `useCan`, `<Can>` |
| `src/lib/permissions.server.ts` | **new**: `requirePermission` |
| `src/lib/*.functions.ts` | add `requirePermission` calls |
| `src/routes/_authenticated/_app/team.tsx` | role editor, overrides, audit |
| `src/components/app/AppShell.tsx` | hide nav items |
| `src/components/app/NoAccess.tsx` | **new** |
| `src/test/permissions.test.ts` | **new** |

## 7. Rules, edge cases, security

- **Hiding is not security.** Every hidden action must also be refused by the server (and RLS where the client writes directly).
- Last-owner protection; no self-demotion; only owners create owners.
- Overrides survive a role change (or are cleared; decide and document it).
- Role changes take effect on the user's next request (refetch the membership on focus).

## 8. Testing

**Unit tests:** `can()` for every role × feature against the table; overrides grant/revoke; owners ignore revokes; last-owner protection logic; the TS map equals the SQL map fixture.

**Manual test script:**
1. Create a test user as `sales_rep` in your workspace (invite flow).
2. As the rep: no Voice Agents edit, Settings, Team or API keys in the nav; opening `/settings` directly shows "No access".
3. As the rep, replay an agent-update server function request (DevTools → Network → copy as fetch → run in the console) → refused.
4. As admin: grant the rep `agents.manage` → the rep can now edit agents (after a refresh).
5. The audit shows both changes.
6. Try to demote the only owner → blocked.

```bash
npx vitest run src/test/permissions.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] A sales rep can't open agent management or API-key screens: both the UI and the server refuse
- [ ] An admin can grant access per user, and it works
- [ ] One permission map is used by client and server; role changes are audited
- [ ] Last-owner and self-demotion protections work

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/16-roles-access
git add src/lib/permissions.ts src/test/permissions.test.ts
git commit -m "Roles: permission map and can() helper"
git push -u origin feature/16-roles-access
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#16 Roles and feature access" --body "Closes #16 ..."
```

## 11. In the pull request

- `Closes #16`; the migration to apply
- The final role × feature table; the list of server functions now protected
- A note for teammates: "Use `requirePermission(ctx, org, 'api_keys.manage')` / `<Can feature=…>`"

## 12. Settle with the lead before starting

- The final role × feature table.
- Whether overrides are kept or cleared on a role change.
