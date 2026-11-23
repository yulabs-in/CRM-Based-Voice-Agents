## Your plan

Work through your issues in this order, **one PR at a time**:

| # | Issue | Branch | Why this order |
|---|---|---|---|
| 1 | #4 Profile page | `feature/4-profile-page` | Self-contained; a good way to learn the codebase (routes, forms, Supabase storage, `AppShell`). |
| 2 | #10 Per-agent outcome rules | `feature/10-agent-outcome-rules` | Core CRM logic with existing tests to build on. #11 and #14 (Charan) hook into the same sync code later. |
| 3 | #16 Roles and feature access | `feature/16-roles-access` | Charan's API-key screen (#5) and Tejaswini's agent management (#9) should use your permission map, so land it early. |
| 4 | #13 Do-not-contact registry | `feature/13-dnc-registry` | Your `isBlocked()` helper is used by #19, by #20 (Charan's widget) and by `POST /api/v1/calls` (#5). |
| 5 | #19 Inbound calls | `feature/19-inbound-calls` | Builds on #13. |
| 6 | #22 AI contact summary | `feature/22-ai-contact-summary` | Independent. |
| 7 | #25 Dark mode and PWA | `feature/25-dark-mode-pwa` | Agree colours with Charan (#8 UI polish). |
| 8 | #7 API and MCP docs | `feature/7-api-docs` | Needs #5 (Charan) and #6 (Tejaswini) merged. Set up the page skeleton early if you have spare time. |

### Who you work with

- **Charan Varigonda** (`CHARANVARIGONDA`): shares `crm-sync.server.ts` with you (#11, #14). He needs your `permissions.ts` (#16) and `isBlocked()` (#13). His API (#5) is what you document in #7.
- **Tejaswini** (`Tejaswini2706`): her multi-agent work (#9) feeds your per-agent rules (#10). Her MCP server (#6) is the other half of #7.
- Shared files you'll touch: `crm-sync.server.ts`, `AppShell.tsx`, `voice-agents.tsx`, `settings.tsx`. Rebase on `dev` before opening each PR.

### Your first day

```bash
git clone https://github.com/yulabs-in/CRM-Based-Voice-Agents.git
cd CRM-Based-Voice-Agents
npm ci
cp .env.example .env.local        # ask the lead for the secret values
npm run dev
git checkout dev && git pull
git checkout -b feature/4-profile-page
gh issue comment 4 --body "Starting on this. Branch feature/4-profile-page."
```
