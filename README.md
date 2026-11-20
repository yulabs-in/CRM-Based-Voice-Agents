# Yulabs CRM

Multi-tenant CRM with AI voice calling through [Sarvam Voice Agents](https://docs.sarvam.ai/voice-agents): import contact lists as **projects**, run **campaigns** that call everyone in a project, and get each customer's **answers, transcript and recording** back in the CRM, with analytics on top.

Stack: TanStack Start (React 19, Vite) · Supabase (Postgres + RLS, Auth, Storage) · Tailwind/shadcn · Recharts. Builds for Cloudflare Workers via Nitro.

## Setup

```sh
npm install
cp .env.example .env.local   # then fill in the server secrets
npm run dev
```

`.env` holds the public Supabase values. Put secrets in `.env.local` (git-ignored) or your host's secret settings:

| Variable | What it's for |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin access (webhooks saving call results and recordings) |
| `SARVAM_API_KEY` | Sarvam Voice Agents workspace API key |
| `PUBLIC_APP_URL` | Public https address Sarvam sends call results to — your deployed URL, or a tunnel (`cloudflared tunnel --url http://localhost:3000`) during development |

## Using it

1. **Integrations** → save your Sarvam organization ID and workspace ID, check the connection.
2. **Voice Agents** → create an agent and add its Sarvam agent ID, version, telephony connection ID and caller number. Use **Test call** to try it on one number.
3. **Projects** → *Import CSV / Excel*. Map columns (name, phone, email, …); other columns are kept as custom fields. Each file becomes a project.
4. **Run campaign** on a project → choose agent, calling hours, retries and which contact fields to pass as agent variables → launch.
5. Watch progress on the campaign page; click any contact to see what they said, the conversation, and play the recording. Export results to CSV.

To capture answers, define output variables on your Sarvam agent (e.g. `interested`, `disposition`, `callback_time`). The CRM stores them per call and per contact and charts them.

## Database

Migrations live in `db/migrations/` (applied to Supabase in order). Regenerate `src/integrations/supabase/types.ts` after schema changes.

## Scripts

`npm run dev` · `npm run build` · `npm test` · `npm run lint`
