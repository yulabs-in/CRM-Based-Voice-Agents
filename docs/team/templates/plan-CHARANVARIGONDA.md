## Your plan

Work through your issues in this order, **one PR at a time**:

| # | Issue | Branch | Why this order |
|---|---|---|---|
| 1 | #5 API keys and public REST API | `feature/5-api-keys` | Tejaswini's MCP server (#6) and Shashank's docs (#7) both depend on it, so it goes first. Share the `authenticateApiKey()` signature in the issue early. |
| 2 | #14 Notifications | `feature/14-notifications` | Independent, and visible quickly. |
| 3 | #11 Consultation booking | `feature/11-consultation-booking` | Independent; the time parser needs lots of tests. |
| 4 | #17 End-to-end tests | `feature/17-e2e-tests` | Uses Tejaswini's seed workspace (#18). Start with your own fixtures if it isn't merged. |
| 5 | #20 Lead-capture widget | `feature/20-lead-widget` | Uses Shashank's `isBlocked()` (#13). |
| 6 | #23 Usage and cost dashboard | `feature/23-usage-dashboard` | Independent. |
| 7 | #8 UI/UX polish pass | `feature/8-ui-polish-*` | Touches almost every page, so do it last, in several small PRs, to avoid conflicts. |

### Who you work with

- **Tejaswini** (`Tejaswini2706`): her MCP server (#6) calls your `authenticateApiKey()` and shared query functions. Put them in `src/lib/api-auth.server.ts` and `src/lib/api/*.server.ts` so she can reuse them. Your E2E tests (#17) use her seed data (#18).
- **Kammar Shashank** (`KAMMAR-SHASHANK`): documents your API in #7, so keep request and response shapes stable and write them in the PR. Use his `permissions.ts` (#16) for the API-key screen and cost visibility, and his `isBlocked()` (#13) in `POST /api/v1/calls` and the widget. He also edits `crm-sync.server.ts` (#10, #13, #19, #22), so add small functions and rebase often.
- Agree on dark-mode colours (#25, Shashank) before your polish pass (#8).

### Your first day

```bash
git clone https://github.com/yulabs-in/CRM-Based-Voice-Agents.git
cd CRM-Based-Voice-Agents
npm ci
cp .env.example .env.local        # ask the lead for the secret values
npm run dev
git checkout dev && git pull
git checkout -b feature/5-api-keys
gh issue comment 5 --body "Starting on this. Branch feature/5-api-keys."
```
