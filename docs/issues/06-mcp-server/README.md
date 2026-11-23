# #6: MCP server for the CRM

| | |
|---|---|
| **Issue** | https://github.com/yulabs-in/CRM-Based-Voice-Agents/issues/6 |
| **Assignee** | Tejaswini (`Tejaswini2706`) |
| **Branch** | `feature/6-mcp-server` |
| **PR into** | `dev` |
| **Order** | Tejaswini's 3rd issue |
| **Depends on** | #5 API keys (Charan). Start with a stub key check until it's merged |
| **Blocks** | #7 docs (Shashank documents the MCP setup) |
| **Size** | ~4–5 days |

## 1. Summary

Expose the CRM to AI assistants (Claude Desktop, Claude Code, Cursor, …) through the **Model Context Protocol**. A customer adds `https://<app>/api/mcp` with their API key, and can then ask in plain language: "show me today's interested leads", "summarise the last call with +91…", "call this lead". Each question maps to a tool that runs organization-scoped queries.

## 2. What already exists / what you reuse

- From #5: `authenticateApiKey(request, scope)` in `src/lib/api-auth.server.ts`, and the shared query functions in `src/lib/api/*.server.ts`. **Call these; don't write new queries.**
- `startSarvamCall` logic for placing calls (via the #5 shared function).
- Server route pattern: `src/routes/api/public/*.ts`.

## 3. Scope

**In scope:** a Streamable HTTP MCP endpoint, API-key auth with per-tool scopes, 8 tools, zod schemas with good descriptions, tests, and config snippets for 3 clients.

**Out of scope:** MCP resources and prompts (tools only), OAuth for MCP, stdio transport.

## 4. What to build, point by point

### 4.1 Setup
1. `npm install @modelcontextprotocol/sdk` (commit `package.json` and `package-lock.json`).
2. Create `src/lib/mcp/server.ts`: a function `buildMcpServer(ctx: { organizationId; scopes })` that creates an `McpServer({ name: "yulabs-crm", version: "1.0.0" })` and registers the tools.
3. Create the route `src/routes/api/mcp.ts` handling `POST` (and `GET`/`DELETE` if the transport needs them) with `StreamableHTTPServerTransport` in **stateless** mode (`sessionIdGenerator: undefined`). This works on serverless (Netlify functions).
4. Auth at the top of the handler: `authenticateApiKey(request, "contacts:read")` as the minimum. Pass the scopes to the server so each tool checks its own.

### 4.2 Tools

| Tool | Scope | Input (zod) | Returns |
|---|---|---|---|
| `search_contacts` | `contacts:read` | `query` (string, name/phone/email), `limit` (1–50, default 10) | list: id, name, phone, email, status |
| `get_contact` | `contacts:read` | `contact_id` (uuid) **or** `phone` | contact, plus its last 5 calls (date, outcome, summary) and open deals |
| `create_contact` | `contacts:write` | `first_name`, `last_name?`, `phone`, `email?`, `city?`, `project_id?` | created/updated contact |
| `list_leads` | `leads:read` | `status?` (e.g. `qualified`), `since?` (ISO date or "today"/"this_week"), `limit?` | leads, with name, phone, product interest and last call summary |
| `list_deals` | `deals:read` | `stage?`, `limit?` | deals: title, stage, value, contact |
| `list_recent_calls` | `calls:read` | `since?`, `agent_id?`, `outcome?`, `limit?` | calls: id, contact, status, duration, outcome, summary |
| `get_call` | `calls:read` | `call_id` **or** `phone` (= that number's latest call) | status, duration, answers, summary, transcript (trimmed to ~8k chars) |
| `place_call` | `calls:write` | `phone`, `agent_id`, `contact_id?`, `consent_confirmed: z.literal(true)` | `{ call_id, status }` |

5. Each tool: check its scope first. If it's missing, return an MCP error result with "This API key lacks the calls:write scope" (`isError: true`, not a thrown exception).
6. Return **both** a short human-readable text and structured JSON (`content: [{ type: "text", text }]`; add `structuredContent` if the SDK version supports it).
7. Write descriptions **for the AI**: say what the tool does, when to use it, and what each field means, e.g. *"List leads (people who showed interest on AI calls). Use `since: 'today'` for today's new leads."*
8. `place_call`: the description must say that the user must explicitly confirm they have the person's consent; `consent_confirmed` must be the literal `true`. Do-not-contact numbers are refused with a clear message.
9. Resolve "today"/"this_week" in **Asia/Kolkata**.

### 4.3 Stub while waiting for #5
10. If #5 isn't merged yet: create `src/lib/api-auth.server.ts` with the same signature, returning a fixed test org from an env var `MCP_DEV_ORG_ID`, marked `// TODO(#5): replace with real key auth`. Delete the stub when you rebase onto #5.

## 5. Data model

None. Everything goes through the #5 tables and functions.

## 6. Files

| File | Change |
|---|---|
| `src/lib/mcp/server.ts` | **new**: builds the server and registers the tools |
| `src/lib/mcp/tools/*.ts` | **new**: one file per tool (handler + schema) |
| `src/lib/mcp/time.ts` | **new**: "today"/"this_week" → IST date ranges |
| `src/routes/api/mcp.ts` | **new**: HTTP endpoint |
| `src/test/mcp-tools.test.ts` | **new** |
| `package.json`, `package-lock.json` | the SDK dependency |

## 7. Rules, edge cases, security

- Same isolation rule as #5: every query uses the key's `organization_id`.
- Trim large outputs (transcripts, long lists) so the AI's context isn't flooded; say "(truncated)" when you do.
- Never return the Sarvam key, internal tokens or the service-role key in a tool result or error.
- Phone inputs go through `normalizePhoneNumber`. Ambiguous input → ask for the full number in the error text.
- Log tool name, org id and duration only. **No personal data in logs.**

## 8. Testing

**Unit tests** (call the tool handlers directly with a mocked data layer):
- each tool returns data only for the given org
- a missing scope → `isError` result with the scope name
- `place_call` without `consent_confirmed: true` fails schema validation
- `time.ts`: "today" at 00:30 IST is still the correct IST day

**With real clients** (dev server running, a real key from #5):

```bash
# Claude Code
claude mcp add --transport http yulabs http://localhost:8080/api/mcp --header "Authorization: Bearer yk_live_xxx"
claude    # then ask: "show me today's interested leads"
```

Claude Desktop (`claude_desktop_config.json`, via the `mcp-remote` bridge):

```json
{ "mcpServers": { "yulabs": { "command": "npx", "args": ["-y", "mcp-remote", "http://localhost:8080/api/mcp", "--header", "Authorization: Bearer yk_live_xxx"] } } }
```

Cursor (`.cursor/mcp.json`):

```json
{ "mcpServers": { "yulabs": { "url": "http://localhost:8080/api/mcp", "headers": { "Authorization": "Bearer yk_live_xxx" } } } }
```

You can also use the MCP Inspector: `npx @modelcontextprotocol/inspector`, then connect to the URL with the header.

Questions to try: "show me today's interested leads", "summarise the last call with +91 90000 00001", "find contact Ravi", "how many calls did the insurance agent make this week?", and "call +91 9…" (it must ask for consent).

## 9. Acceptance criteria

- [ ] The server connects from Claude Code, Claude Desktop and Cursor using an API key
- [ ] The two example questions in the issue return correct, org-scoped answers
- [ ] Each tool enforces its scope; `place_call` requires consent and refuses DNC numbers
- [ ] Tools reuse the #5 functions (no duplicated queries)
- [ ] Tests added; all checks pass

## 10. Git workflow for this issue

```bash
git checkout dev && git pull
git checkout -b feature/6-mcp-server
npm install @modelcontextprotocol/sdk
git add package.json package-lock.json src/lib/mcp src/routes/api/mcp.ts
git commit -m "MCP: server endpoint with contact and call tools"
git push -u origin feature/6-mcp-server
git fetch origin && git rebase origin/dev && git push --force-with-lease
gh pr create --base dev --title "#6 MCP server for the CRM" --body "Closes #6 ..."
```

## 11. In the pull request

- `Closes #6`
- A short screen recording or screenshots of Claude answering the two questions
- The three client config snippets (for #7)
- The list of tools with their descriptions

## 12. Settle with the lead before starting

- Which questions customers will ask most (that tells you which tools matter).
- The maximum transcript length to return.
