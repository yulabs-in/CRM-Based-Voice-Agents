# #20: Website lead-capture widget with instant AI callback

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/20 |
| **Assignee** | Charan Varigonda (`CHARANVARIGONDA`) |
| **Branch** | `feature/20-lead-widget` |
| **PR into** | `dev` |
| **Order** | Charan's 5th issue |
| **Depends on** | `isBlocked()` from #13 (Shashank). Uses its **own widget key**, not the #5 API key |
| **Blocks** | nothing |
| **Size** | ~6 days |

## 1. Summary

A small form **any website can embed** with one `<script>` tag. Enquiries go straight into the CRM as contacts in a chosen project. If the workspace turned on **instant callback** and the visitor ticked consent, an AI agent calls them **within a minute**.

## 2. What already exists

- `normalizePhoneNumber` for validating Indian mobile numbers.
- Placing calls: the core of `startSarvamCall` (`src/lib/sarvam.functions.ts`), reused through a server-side helper.
- Projects and contacts (with `project_id`, `custom_fields`).
- Public route pattern: `src/routes/api/public/*.ts`; static files in `public/` are served at the site root.

## 3. Scope

**In scope:** `public/widget.js`, `widget_settings`, the public submit endpoint with CORS/origin checks, rate limit, spam protection, contact upsert, instant callback, settings page with live preview and embed code.

**Out of scope:** multi-step forms, file uploads, A/B testing of the widget.

## 4. What to build, point by point

### 4.1 Database and settings
1. Migration `00NN_lead_widget.sql` (§5): `widget_settings` (one row per workspace; more widgets later if needed).
2. Settings page `src/routes/_authenticated/_app/settings.widget.tsx` (or a tab):
   - **Widget key** `wk_…` (random, shown in full; this is a public identifier, not a secret) with a **Regenerate** button (confirm: "Existing embeds stop working")
   - **Allowed domains** (chips: `example.com`, `www.example.com`; `localhost:*` allowed only while testing)
   - **Project** ▾ for new contacts, and **Agent** ▾ for callbacks
   - **Instant callback** toggle, and **calling hours** (no calls at night; outside the hours → queue for the next window, or create a task)
   - **Colour**, title ("Get a call back"), button text, privacy-policy URL (required for the consent text)
   - **Live preview** (renders the real widget in the page) and a **Copy embed code** box:
     `<script src="https://yulabs-crm-1122.netlify.app/widget.js" data-key="wk_…" async></script>`

### 4.2 The embed script (`public/widget.js`)
3. Plain JavaScript (no framework, < 15 KB), an IIFE. It reads `data-key` from its own `<script>` tag (`document.currentScript`).
4. Fetch the public config: `GET /api/public/widget-config?key=wk_…` → title, colour, button text, privacy URL, callback enabled. Cache it in memory.
5. Render into a **Shadow DOM** container (so the host site's CSS can't break it, and ours can't leak), either inline where the script is placed or as a floating button (the setting `data-mode="inline|floating"`).
6. Fields: name (required), phone (required, `type="tel"`), interest (optional select or text), a consent checkbox (required for the callback): "I agree to receive a call from <company> about my enquiry. [Privacy policy]".
7. A hidden **honeypot** field (`company_website`), and record `renderedAt = Date.now()`.
8. Submit → `POST /api/public/widget-submit` with JSON. Show states: sending, success ("Thanks! We'll call you shortly." / "We'll be in touch."), error (friendly).
9. Accessible: labels, focus states, keyboard support, `aria-live` for the result message.

### 4.3 Public endpoints
10. `GET /api/public/widget-config`: the public settings only (never the agent id or internal ids). CORS for allowed origins.
11. `POST /api/public/widget-submit`:
    - **CORS / origin:** read the `Origin` header; it must match an allowed domain, otherwise 403. Respond to `OPTIONS` preflight with `Access-Control-Allow-Origin: <that origin>`, `-Methods: POST`, `-Headers: Content-Type`
    - **Validate:** zod; `normalizePhoneNumber(phone)` must be a valid mobile, otherwise 400 "Please enter a valid mobile number"
    - **Spam:** honeypot filled → pretend success (200) but drop it; `Date.now() - renderedAt < 3000` → drop it; rate limit 5/min per IP and 100/hour per key → 429
    - **Upsert contact** in the chosen project: match by normalised phone in the org; update name/interest if found, otherwise create it; tag `website-widget`, `custom_fields.interest`, `custom_fields.source_url` (from `Referer`)
    - **Callback:** if instant callback is on, consent is ticked, the number isn't blocked (`isBlocked`), and it's within calling hours → place the call with the chosen agent (`consent_confirmed` = the checkbox), pass `customer_name` and `interest` as variables. Outside hours → a task "Call back <name>" at the next window start
    - respond `{ ok: true, callback: "now" | "scheduled" | "none" }`

## 5. Data model

```sql
-- 00NN_lead_widget.sql: per-workspace website widget settings
create table if not exists public.widget_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  widget_key text not null unique,
  allowed_domains text[] not null default '{}',
  project_id uuid references public.projects(id) on delete set null,
  agent_id uuid references public.voice_agents(id) on delete set null,
  instant_callback boolean not null default false,
  calling_hours jsonb not null default '{"start":"09:00","end":"20:00","tz":"Asia/Kolkata"}',
  appearance jsonb not null default '{"colour":"#6d28d9","title":"Get a call back","button":"Call me"}',
  privacy_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- RLS: members read; owners/admins write. Public endpoints read it via the service role by widget_key.
```

## 6. Files

| File | Change |
|---|---|
| `db/migrations/00NN_lead_widget.sql` | **new** |
| `public/widget.js` | **new** |
| `src/routes/api/public/widget-config.ts`, `widget-submit.ts` | **new** |
| `src/lib/widget.server.ts` | **new**: origin check, spam checks, rate limit, upsert, callback |
| `src/routes/_authenticated/_app/settings.widget.tsx` | **new** |
| `src/test/widget.test.ts` | **new** |
| `e2e/widget-test.html` (or `public/widget-test.html` in dev only) | test page |

## 7. Rules, edge cases, security

- **The widget key is public**; security comes from the allowed domains, rate limits and spam checks. Never accept the API key from #5 here.
- **No callback without ticked consent.** Never call DNC numbers.
- Calling hours are enforced; no night calls.
- Don't reveal whether a number exists in the CRM (same response either way).
- Don't log full phone numbers in server logs (mask them).

## 8. Testing

**Unit tests:** origin matching (`https://www.example.com` vs `example.com`, ports, http/https); honeypot → dropped; too fast → dropped; invalid phone → 400; rate limit → 429 on the 6th request; within/outside calling hours → now/scheduled; consent false → no call; blocked → no call.

**Manual:**
1. Create `widget-test.html` with the embed code and serve it: `npx serve -l 5500 .` (from the folder containing the file). Add `localhost:5500` to the allowed domains.
2. Submit the form → the contact appears in the chosen project with the tag `website-widget`.
3. Turn on instant callback, tick consent, use **your own number** → your phone rings within a minute.
4. Submit from a non-allowed origin (another port) → blocked (check the console for a CORS/403 error).
5. Submit 6 times quickly → rate limited.
6. Check it at phone width and with the keyboard only.

```bash
npx vitest run src/test/widget.test.ts
npx vitest run && npx tsc --noEmit && npm run build
```

## 9. Acceptance criteria

- [ ] Submitting the widget on a test page creates or updates the contact in the chosen project
- [ ] With callback enabled and consent ticked, the phone rings within a minute
- [ ] Disallowed origins, spam and floods are rejected; invalid phones get a friendly error
- [ ] The settings page has a live preview and copy-paste embed code

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/20-lead-widget
git add public/widget.js src/routes/api/public/widget-submit.ts src/lib/widget.server.ts
git commit -m "Widget: embed script and public submit endpoint"
git push -u origin feature/20-lead-widget
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#20 Website lead-capture widget" --body "Closes #20 ..."
```

## 11. In the pull request

- `Closes #20`; the migration to apply; the embed snippet; a GIF of submit → contact → call

## 12. Settle with the lead before starting

- The consent wording (legal), and default calling hours.
- Inline vs floating as the default mode.
