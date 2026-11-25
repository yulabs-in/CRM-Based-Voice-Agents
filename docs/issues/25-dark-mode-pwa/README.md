# #25: Dark mode and installable mobile app (PWA)

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/25 |
| **Assignee** | Kammar Shashank (`KAMMAR-SHASHANK`) |
| **Branch** | `feature/25-dark-mode-pwa` (or two: `feature/25-dark-mode`, `feature/25-pwa`) |
| **PR into** | `dev` |
| **Order** | Shashank's 7th issue |
| **Depends on** | nothing; agree on colours with Charan (#8 UI polish); the theme setting fits on the #4 Profile page |
| **Blocks** | nothing |
| **Size** | ~5–6 days |

## 1. Summary

The app is **comfortable at night** (dark theme with a System / Light / Dark toggle, saved per user, no flash on load) and **usable as an app on a phone** (installable PWA with a manifest, icons, an offline-friendly shell and an install prompt; Live Calls and Leads work at phone width).

## 2. What already exists

- Design tokens as CSS variables in `src/styles.css` (Tailwind v4, shadcn). The `.dark` variant may be partly defined; check it.
- Utilities `bg-gradient-primary`, `shadow-soft`, `shadow-float`, `dot-canvas`.
- Charts with Recharts (some hard-coded colours, probably).
- The account menu in `AppShell.tsx`; the `profiles` table (`preferred_language` etc. from #4).
- Root document/HTML shell in `src/routes/__root.tsx`.

## 3. Scope

**In scope:** dark values for every token, the theme toggle with persistence, the no-flash script, fixes for charts/badges/gradients/auth in dark, a contrast check, the manifest, icons, the service worker (static assets only), the install prompt, mobile checks for Live Calls and Leads.

**Out of scope:** push notifications, full offline data access, native apps.

## 4. What to build, point by point

### 4.1 Dark theme tokens
1. In `src/styles.css`, define a `.dark { … }` value for **every** token in `:root` (background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, chart-1…5, sidebar-*). Use the same hue family, with lighter text and darker surfaces. Aim for AA contrast.
2. Gradients and shadows: dark versions (a softer `shadow-soft`, gradients with less glare).
3. Replace hard-coded colours in components (`bg-white`, `text-gray-900`, `#hex` in charts) with tokens (`bg-background`, `text-foreground`, `var(--chart-1)`). Search: `grep -rn "bg-white\|text-black\|#[0-9a-fA-F]\{6\}" src/`.

### 4.2 Toggle and persistence
4. `src/lib/theme.tsx`: a `ThemeProvider` with `theme: "system" | "light" | "dark"`, a resolved theme that listens to `matchMedia('(prefers-color-scheme: dark)')`, and it applies or removes the `dark` class on `<html>`.
5. Save it to `localStorage` (instant) **and** to `profiles.theme` (follows the user across devices). On sign-in, the profile value wins.
6. **No flash:** an inline script in the HTML `<head>` (in `__root.tsx`) that reads localStorage/system and sets the class **before** the page paints.
7. The toggle in the account menu: a three-option segmented control (Monitor / Sun / Moon icons, `aria-label`s). Also on the Profile page (#4) if it's merged.

### 4.3 Check every page in both themes
8. Go through every sidebar page, the auth page, the landing page and the dialogs. Fix unreadable text, invisible borders, white flashes in charts, and badges with poor contrast (`StatusBadge` colours need dark variants).
9. Recharts: axis/grid/tooltip colours from tokens; the tooltip background `var(--popover)`.
10. Images or logos that disappear on dark: provide a light version, or add a subtle background.

### 4.4 PWA
11. `public/manifest.webmanifest`: `name` "Yulabs CRM", `short_name` "Yulabs", `start_url` "/dashboard", `scope` "/", `display` "standalone", `background_color`, `theme_color`, and `icons` 192, 512 and 512 maskable (PNG). Link it in the `<head>` with `<link rel="manifest">`, plus `<meta name="theme-color">` (light and dark via `media`), and the `apple-touch-icon` 180.
12. Icons in `public/icons/` (generated from the logo; keep the maskable icon's safe zone in mind).
13. Service worker `public/sw.js` (hand-written, small) or `vite-plugin-pwa` (check it works with the Lovable/TanStack config first; if unsure, go hand-written):
    - precache the app shell (the offline page, icons, main CSS/JS from the build manifest if practical)
    - **network-first** for navigations, falling back to `/offline.html` ("You're offline. Reconnect to see your calls.")
    - **cache-first** for hashed static assets (`/assets/*`)
    - **never cache** API calls (`/api/*`), Supabase requests or anything with customer data
    - version the cache name and delete old caches on `activate`
14. Register the SW in the client only in production (`import.meta.env.PROD`), after load.
15. **Install prompt:** catch `beforeinstallprompt` and show an "Install app" item in the account menu (Android/desktop Chrome). On iOS Safari, show a one-time hint: "Share → Add to Home Screen".

### 4.5 Phone width
16. Live Calls and Leads at 375 px: cards instead of wide tables, big tap targets (≥ 44 px), and the sidebar becomes a drawer. Coordinate with #8, which may already do this.

## 5. Data model

```sql
-- 00NN_profile_theme.sql: remember each user's theme
alter table public.profiles add column if not exists theme text not null default 'system'
  check (theme in ('system','light','dark'));
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_profile_theme.sql` | **new** |
| `src/styles.css` | dark tokens |
| `src/lib/theme.tsx` | **new**: provider and hook |
| `src/routes/__root.tsx` | no-flash script, manifest/meta links, SW registration |
| `src/components/app/AppShell.tsx` | theme toggle, install item |
| `src/components/app/ThemeToggle.tsx`, `InstallPrompt.tsx` | **new** |
| `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`, `public/icons/*` | **new** |
| components with hard-coded colours, chart configs | use tokens |
| `src/test/theme.test.ts` | **new** |

## 7. Rules, edge cases, security

- **The service worker never caches API or customer data.** It's a shell cache only.
- No flash of the wrong theme on load or navigation.
- "System" follows OS changes live.
- An old service worker must not trap users on an old version: use a versioned cache, `skipWaiting` + `clients.claim`, and show "New version available, Reload" when an update is waiting.
- AA contrast in both themes.

## 8. Testing

**Unit tests:** theme resolution (system + OS dark → dark; explicit light wins); the localStorage read/write helper; the SW route matcher (a pure function deciding cache / network / never for a URL), which must return "never" for `/api/*` and Supabase URLs.

**Manual:**
1. Toggle System/Light/Dark → it applies instantly; reload → no flash; sign in on another browser → the theme follows the profile.
2. Screenshot every page in dark mode (attach them in the PR).
3. Lighthouse → "Installable" passes; the PWA checks are green.
4. Build and preview: `npm run build && npm run preview` (the SW only registers in production builds).
5. DevTools → Application → Service Workers: registered; Cache Storage contains **no** `/api` responses.
6. Offline (DevTools → Network → Offline) → the offline page shows.
7. **Android** (Chrome): install from the menu → it opens to the dashboard in standalone mode. **iPhone** (Safari): Share → Add to Home Screen → it opens to the dashboard.

```bash
npx vitest run src/test/theme.test.ts
npm run build && npm run preview
```

## 9. Acceptance criteria

- [ ] Every page looks right in dark mode (screenshots), with AA contrast
- [ ] System / Light / Dark toggle, saved per user, no flash
- [ ] The app installs on Android and iOS home screens and opens to the dashboard
- [ ] The service worker caches the shell only (never API data); there's an offline page
- [ ] Live Calls and Leads are usable at phone width

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/25-dark-mode-pwa
git add src/styles.css src/lib/theme.tsx src/components/app/ThemeToggle.tsx
git commit -m "Dark mode: tokens, theme provider and toggle"
git push -u origin feature/25-dark-mode-pwa
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#25 Dark mode and installable PWA" --body "Closes #25 ..."
```

## 11. In the pull request

- `Closes #25`; the migration to apply
- Light/dark screenshots of the main pages; photos or screenshots of the installed app on a phone

## 12. Settle with the lead before starting

- The dark palette (agree with #8), and the app name/icon for the home screen.
- A hand-written service worker vs `vite-plugin-pwa`.
