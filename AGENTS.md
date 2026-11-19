<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

<!-- AGENT-MEMORY:BEGIN -->
- Every tenant table carries organization_id; RLS uses is_org_member / can_write_org / has_org_role security-definer helpers — never rely on client filtering.
- Current org lives in OrgProvider (src/lib/org.tsx); signed-in app pages live under src/routes/_authenticated/_app/ which loads memberships and redirects to /onboarding when none.
- Generic CRUD list pages use src/components/app/EntityPage.tsx with field/column configs.
- tsconfig relaxes noPropertyAccessFromIndexSignature, noUncheckedIndexedAccess, exactOptionalPropertyTypes to keep config-driven pages readable.
- Sarvam dialing stays in authenticated TanStack server functions; per-attempt callback tokens are stored hashed because Sarvam callbacks do not support custom auth headers.
- One-time test calls use a database-enforced organization/number limit, and audio recordings are stored privately with organization-scoped access.
<!-- AGENT-MEMORY:END -->
