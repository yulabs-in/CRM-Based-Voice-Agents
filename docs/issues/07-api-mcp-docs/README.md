# #7: API and MCP documentation (with use cases)

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/7 |
| **Assignee** | Kammar Shashank (`KAMMAR-SHASHANK`) |
| **Branch** | `feature/7-api-docs` |
| **PR into** | `dev` |
| **Order** | Shashank's last issue (the skeleton can start any time) |
| **Depends on** | #5 REST API (Charan), #6 MCP server (Tejaswini) |
| **Blocks** | nothing |
| **Size** | ~4–5 days |

## 1. Summary

A documentation page that lets a customer's developer integrate **without asking us anything**: quick start, authentication, every endpoint with copy-able examples, errors, rate limits, MCP setup for three AI clients, and five step-by-step use cases.

## 2. What already exists / your sources

- The #5 PR description: endpoint table, request/response examples, error codes.
- The #6 PR description: tool list and client config snippets.
- UI building blocks: `PageHeader`, cards, `src/components/ui/*`; `auth.tsx` for the visual style.

## 3. Scope

**In scope:** the docs route, layout with a sidebar table of contents, all content below, copy buttons, mobile layout.

**Out of scope:** auto-generated OpenAPI (note it as a follow-up), SDKs.

## 4. What to build, point by point

### 4.1 Page and layout
1. Agree on the route with the lead: `/docs` (public, best for customers) or `/settings/developers` (signed in). If it's public, put it outside `_authenticated` (e.g. `src/routes/docs.tsx`).
2. Layout: a sticky left sidebar (desktop) with anchors to every section, collapsing to a "Contents" dropdown on mobile. Content max width ~760 px.
3. A `CodeBlock` component (`src/components/docs/CodeBlock.tsx`): language tabs (**curl** | **JavaScript**), monospace, horizontal scroll, and a **Copy** button that shows "Copied" for 2 s.
4. An `Endpoint` component: method badge (GET green, POST blue, PATCH amber), path, required scope chip, description, parameters table, request example, response example, error list.
5. Keep the content in `src/content/docs/*.ts` (plain data/strings), so it's easy to update without touching layout code.
6. When signed in, show a "Create an API key" button that links to Settings → API & MCP.

### 4.2 Sections (in this order)
7. **Overview:** what the API can do, the base URL (`https://yulabs-crm-1122.netlify.app/api/v1`), JSON only.
8. **Quick start:** (1) create a key in Settings → API & MCP, (2) first request:
   `curl https://…/api/v1/contacts?limit=5 -H "Authorization: Bearer yk_live_…"`, (3) the response explained.
9. **Authentication & scopes:** the Bearer header; a table of every scope and what it allows; key safety (server-side only, never in browser code; revoke if leaked).
10. **Pagination:** `limit`, `cursor`, `next_cursor`, with a loop example in JS.
11. **Errors:** the `{ error: { code, message } }` format; a table of 400/401/403/404/409/429/500 with the cause and the fix.
12. **Rate limits:** 60/min per key, the headers, retry with backoff (a JS snippet).
13. **Endpoints:** one `Endpoint` block for each route in #5 (contacts ×4, leads, deals, calls ×3).
14. **MCP:** what MCP is (2 lines), the server URL, the auth header, and config for **Claude Code**, **Claude Desktop**, **Cursor** (from the #6 PR), plus example questions and the list of tools.
15. **Use cases** (each: goal → what you need → steps → full code → how to check it worked):
    1. *Website enquiries → Contacts:* a form handler (Node/Express or a serverless function) that POSTs to `/contacts`.
    2. *New lead → AI call → read the result:* POST `/calls`, then poll `GET /calls/:id` until `completed`, then read `answers` and `summary`.
    3. *Interested leads → Google Sheet every morning:* a Google Apps Script with `UrlFetchApp`, a time-driven trigger at 9:00 IST, writing rows.
    4. *Ask an AI over MCP:* "Which callers want a consultation this week?" Setup plus the expected answer.
    5. *Deals → external dashboard:* a nightly script that pages through `/deals` and upserts into the dashboard's DB or CSV.
16. **Changelog:** a small dated list ("2026-12: v1 released").

## 5. Data model

None.

## 6. Files

| File | Change |
|---|---|
| `src/routes/docs.tsx` (or `_authenticated/_app/settings.developers.tsx`) | **new** |
| `src/components/docs/CodeBlock.tsx`, `Endpoint.tsx`, `DocsSidebar.tsx` | **new** |
| `src/content/docs/endpoints.ts`, `use-cases.ts`, `mcp.ts` | **new**: content |
| `src/components/app/AppShell.tsx` | optional "Developers" link |
| `src/test/docs-content.test.ts` | **new** |

## 7. Rules and edge cases

- **Every example must work exactly as written.** Run each one against your local server before the PR.
- Use obviously fake keys (`yk_live_xxxxxxxx`) and fake numbers (`+91 90000 00001`), never real ones.
- Keep request/response examples in sync with the #5 code. If you find a mismatch, raise it on #5, don't paper over it.
- Copy buttons must copy plain text (no line numbers or prompts).

## 8. Testing

**Unit test** (`src/test/docs-content.test.ts`): every endpoint in `endpoints.ts` has a method, path, scope, at least one example, and a valid JSON response example (`JSON.parse` succeeds).

**Manual:**
1. Run every curl and JS example against `npm run dev` with a real local key, and tick each one off in the PR.
2. Run the Apps Script use case against a tunnel URL (`cloudflared tunnel --url http://localhost:8080`).
3. **Hallway test:** a teammate who hasn't used the API does use cases 1 and 2 with only the page. Note where they got stuck, fix it, and say so in the PR.
4. Check at 375 px: code scrolls sideways, the sidebar collapses.

## 9. Acceptance criteria

- [ ] All sections in §4.2 exist, with copy-able curl **and** JS examples
- [ ] Every example was run successfully (checklist in the PR)
- [ ] MCP setup works for Claude Code, Claude Desktop and Cursor as written
- [ ] A teammate completed use cases 1 and 2 using only the docs
- [ ] Works on mobile; all checks pass

## 10. Git workflow for this issue

```bash
git checkout dev && git pull            # make sure #5 and #6 are merged
git checkout -b feature/7-api-docs
git add src/routes/docs.tsx src/components/docs src/content/docs
git commit -m "Docs: layout, quick start and authentication"
git push -u origin feature/7-api-docs
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#7 API and MCP documentation" --body "Closes #7 ..."
```

## 11. In the pull request

- `Closes #7`
- Screenshots (desktop, mobile), the examples-run checklist, and notes from the hallway test

## 12. Settle with the lead before starting

- Public `/docs` vs signed-in `/settings/developers`.
- The production base URL to show, and whether to mention the dev preview at all.
