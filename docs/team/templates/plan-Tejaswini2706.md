## Your plan

Work through your issues in this order, **one PR at a time**:

| # | Issue | Branch | Why this order |
|---|---|---|---|
| 1 | #18 Dev database and seed data | `feature/18-dev-database` | It unblocks everyone: once `dev` has its own database, migrations can be tested safely. Charan's E2E tests (#17) use your seed workspace. |
| 2 | #9 Multi-agent setup | `feature/9-multi-agent` | Agent and version data that #10 (Shashank) and your own #15 build on. |
| 3 | #6 MCP server | `feature/6-mcp-server` | Needs Charan's API keys (#5). Start with a stub key check if #5 isn't merged yet. |
| 4 | #12 WhatsApp follow-up | `feature/12-whatsapp-followup` | Independent; uses the workflow builder. |
| 5 | #15 Agent analytics and A/B | `feature/15-agent-analytics` | Uses the version data from #9. |
| 6 | #21 Transcript search and player | `feature/21-transcript-search` | Independent. |
| 7 | #24 Email sync | `feature/24-email-sync` | Independent; needs OAuth app credentials from the lead. |

### Who you work with

- **Charan Varigonda** (`CHARANVARIGONDA`): his `authenticateApiKey()` from #5 is what your MCP server (#6) uses, so agree on its signature early in the #5 thread. His E2E tests (#17) need your seed data (#18).
- **Kammar Shashank** (`KAMMAR-SHASHANK`): documents your MCP server in #7, so share your Claude Desktop / Claude Code / Cursor config snippets in your PR. His per-agent rules (#10) build on your agents (#9). Use his `permissions.ts` (#16) to decide who can manage agents.
- For #18 you need the **owner** to create the dev Supabase project and set the Netlify branch variables. Ask early.

### Your first day

```bash
git clone https://github.com/yulabs-in/CRM-Based-Voice-Agents.git
cd CRM-Based-Voice-Agents
npm ci
cp .env.example .env.local        # ask the lead for the secret values
npm run dev
git checkout dev && git pull
git checkout -b feature/18-dev-database
gh issue comment 18 --body "Starting on this. Branch feature/18-dev-database."
```
