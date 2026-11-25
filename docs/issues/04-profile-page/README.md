# #4: Profile page

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/4 |
| **Assignee** | Kammar Shashank (`KAMMAR-SHASHANK`) |
| **Branch** | `feature/4-profile-page` |
| **PR into** | `dev` |
| **Order** | Shashank's 1st issue |
| **Depends on** | nothing |
| **Blocks** | nothing (#25 adds the theme setting to this page later) |
| **Size** | ~3–4 days |

## 1. Summary

Every signed-in user gets a **Profile** page where they can see and edit their own account: photo, name, job title, phone and language. They can also change their password, sign out of other devices, and see which workspaces they belong to. Today the account menu only shows an email initial, and nothing about the user can be changed.

## 2. What already exists

- Migration `db/migrations/0016_profile_details_and_avatars.sql` (applied) adds:
  - `profiles.job_title`, `profiles.phone`, `profiles.preferred_language`
  - a public storage bucket `avatars`; a user may only write inside `avatars/<their user id>/`
- RLS on `profiles`: users may update their own row (`"profiles self update"` in `0000_core_tenancy_crm.sql`).
- `useOrg()` in `src/lib/org.tsx` gives the current workspace and the user's role.
- `src/routes/auth.tsx` has the password **strength meter** and `friendlyError()`; reuse both.
- `src/components/app/AppShell.tsx` renders the account menu (top right).

## 3. Scope

**In scope:** profile page, avatar upload/replace/remove, edit details, change password, sign out of other devices, workspace list, account-menu link and avatar.

**Out of scope:** changing the email address, deleting the account, two-factor auth, theme toggle (that's #25).

## 4. What to build, point by point

### 4.1 Route and layout
1. Create `src/routes/_authenticated/_app/profile.tsx` with `createFileRoute("/_authenticated/_app/profile")`. The route tree (`src/routeTree.gen.ts`) regenerates when you run `npm run dev`; commit it.
2. Page title "Profile" with `PageHeader`, and a short description ("Your personal details and sign-in").
3. Layout: a single column on mobile; on desktop, the header card across the top with two columns below (Details | Security & workspaces).

### 4.2 Header card
4. Avatar circle (96 px). It shows the image if `profiles.avatar_url` is set, otherwise the initials from the full name (or the first letter of the email).
5. Next to it: full name (large), email, role badge in the current workspace (`StatusBadge` or `Badge`), and "Member since <Mon YYYY>".
6. Buttons under the avatar: **Upload photo** / **Replace**, and **Remove** (only when there is a photo).

### 4.3 Avatar upload
7. Hidden `<input type="file" accept="image/png,image/jpeg,image/webp">`.
8. Validate **before uploading**: type is PNG/JPG/WebP and size ≤ 2 MB. Otherwise show the toast "Use a PNG, JPG or WebP image up to 2 MB."
9. Upload path `avatars/<user.id>/avatar-<Date.now()>.<ext>` with `supabase.storage.from("avatars").upload(path, file, { upsert: false, contentType: file.type })`.
10. Get the public URL (`getPublicUrl`) and save it to `profiles.avatar_url`. If the column doesn't exist in `src/integrations/supabase/types.ts`, add migration `00NN_profile_avatar_url.sql`: `alter table public.profiles add column if not exists avatar_url text;`.
11. After saving, delete the **previous** file (if it was in the user's folder).
12. Show an uploading state on the button, and refresh the profile query so the header **and** the account menu update without a reload.
13. **Remove**: delete the file from storage, then set `avatar_url = null`.

### 4.4 Details form
14. Fields: Full name (required, 2–80 chars), Job title (optional, ≤ 80), Phone (optional, validated with `normalizePhoneNumber`, stored in E.164), Preferred language (select: English, Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati; store codes like `en-IN`, `hi-IN`).
15. Use react-hook-form + zod like the other forms. Show field errors inline.
16. **Save** is disabled until something changes. Show a success toast "Profile saved".
17. Update with `supabase.from("profiles").update({...}).eq("id", user.id)`.

### 4.5 Security card
18. Change password: New password + Confirm, with the strength meter from `auth.tsx` (extract it into `src/components/app/PasswordStrength.tsx` and use it in both places). Require at least the "fair" level, and require the two fields to match.
19. Call `supabase.auth.updateUser({ password })`, show `friendlyError()` on failure, and clear the fields on success.
20. **Sign out of other devices**: open a confirm dialog, then call `supabase.auth.signOut({ scope: "others" })`, then toast "Signed out everywhere else".

### 4.6 Workspaces card
21. List every membership: workspace name, role, and a "Current" badge on the active one. Query `memberships` joined with `organizations` for `user_id = auth.uid()`.
22. Optional: a "Switch" button that changes the current workspace with the existing org switcher logic.

### 4.7 Account menu (`AppShell.tsx`)
23. Add a **Profile** item (icon `User`) linking to `/profile`, above "Sign out".
24. Show the avatar image in the menu trigger, falling back to initials. Use the same profile query, so it updates straight after an upload.

## 5. Data model

No new tables. Only if it's missing:

```sql
-- 00NN_profile_avatar_url.sql: store the public URL of the user's avatar
alter table public.profiles add column if not exists avatar_url text;
```

## 6. Files

| File | Change |
|---|---|
| `src/routes/_authenticated/_app/profile.tsx` | **new**: the page |
| `src/components/app/PasswordStrength.tsx` | **new**: extracted from `auth.tsx` |
| `src/lib/profile.ts` | **new**: `validateAvatarFile(file)`, `initials(name, email)`, the profile query hook |
| `src/routes/auth.tsx` | use `PasswordStrength` |
| `src/components/app/AppShell.tsx` | Profile menu item and avatar |
| `src/routeTree.gen.ts` | regenerated |
| `src/test/profile.test.ts` | **new** |

## 7. Rules, edge cases, security

- Never trust the client for file checks alone. The bucket policy already restricts the folder; **test it** (below).
- Phone is optional; store `null`, not `""`, when it's empty.
- A long name or email must truncate with an ellipsis, never overflow the card.
- A user with no memberships (just signed up) still sees the page; the workspaces list says "No workspaces yet".
- An upload that fails part-way leaves the old avatar in place.

## 8. Testing

**Unit tests** (`src/test/profile.test.ts`):
- `validateAvatarFile`: accepts PNG/JPG/WebP ≤ 2 MB; rejects GIF, SVG and 2.1 MB files.
- `initials("Kammar Shashank")` → `"KS"`; `initials("", "a@b.com")` → `"A"`; handles extra spaces.

**Manual test script:**
1. Upload a JPG → it appears in the header and the account menu with no reload.
2. Replace it with a PNG → the old file is gone from the bucket (Supabase dashboard → Storage).
3. Remove → initials are shown.
4. Try a 3 MB image and a `.gif` → friendly error, and nothing appears in storage.
5. Edit all fields, save, reload → values persist. Clear the phone → saved as null.
6. Change password → sign out → sign in with the new password.
7. Sign in on a second browser, click "Sign out of other devices" on the first → the second is signed out on its next request.
8. **Security:** signed in as user B, run this in the console:
   `await supabase.storage.from('avatars').upload('<USER_A_ID>/hack.png', new Blob(['x']), { contentType: 'image/png' })` → must return an error.
9. Check at 375 px width, and keyboard only.

```bash
npx vitest run src/test/profile.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] A user can upload, replace and remove a photo; the header and account menu update without a reload
- [ ] A user can edit full name, job title, phone and language, and the values persist
- [ ] A user can change their password, and sign out of other devices
- [ ] The workspaces list shows every membership and role
- [ ] User B cannot write into user A's avatar folder (tested, noted in the PR)
- [ ] Unit tests added; all checks pass; works at 375 px

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/4-profile-page
# ...work, then commit in small steps:
git add src/routes/_authenticated/_app/profile.tsx src/lib/profile.ts
git commit -m "Profile: page layout and details form"
git push -u origin feature/4-profile-page
# before the PR:
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#4 Profile page" --body "Closes #4 ..."
```

## 11. In the pull request

- `Closes #4`
- Screenshots: header with and without an avatar, form errors, security card, mobile width
- The result of security test 8
- Migration: "None", or "`00NN_profile_avatar_url.sql` needs applying"

## 12. Settle with the lead before starting

- Which languages to offer in the list.
- Whether "Switch workspace" belongs on this page or only in the existing switcher.
