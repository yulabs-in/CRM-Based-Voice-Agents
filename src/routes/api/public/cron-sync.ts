import { createFileRoute } from "@tanstack/react-router";

// Server-side safety net, called every minute by a Supabase pg_cron job (migration 0017).
// The Sarvam webhook is the instant path; this catches anything it missed — even when nobody has the app open:
// syncs unfinished calls from Sarvam, applies outcomes to leads/deals, and saves late recordings.
// Auth: the caller sends a token that only the database knows (Supabase Vault); we compare its SHA-256 here.

const MIN_INTERVAL_MS = 30_000;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/cron-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-cron-token") ?? "";
        if (token.length < 32) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/lib/supabase-admin.server");
        const { data: state } = await supabaseAdmin.from("cron_state").select("token_hash, last_run_at").eq("id", 1).maybeSingle();
        const hash = await sha256Hex(token);
        if (!state?.token_hash || state.token_hash.length !== hash.length) return new Response("Unauthorized", { status: 401 });
        let difference = 0;
        for (let index = 0; index < hash.length; index += 1) difference |= hash.charCodeAt(index) ^ state.token_hash.charCodeAt(index);
        if (difference !== 0) return new Response("Unauthorized", { status: 401 });

        // Claim this run (skip if one ran in the last 30 s), so overlapping triggers do the work once.
        const cutoff = new Date(Date.now() - MIN_INTERVAL_MS).toISOString();
        const { data: claimed } = await supabaseAdmin.from("cron_state").update({ last_run_at: new Date().toISOString() } as never)
          .eq("id", 1).or(`last_run_at.is.null,last_run_at.lt.${cutoff}`).select("id");
        if (!claimed?.length) return Response.json({ ok: true, skipped: "ran recently" });

        // Only workspaces with something to do: open calls, or finished calls not yet in the CRM / missing a recording.
        // Same 14-day window as applyPendingCrmOutcomes, so calls re-queued for the CRM (or whose answers arrived
        // late) are found; a 3-day window here silently skipped them.
        const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
        const { data: rows } = await supabaseAdmin.from("calls").select("organization_id")
          .gte("created_at", since)
          .or("status.in.(queued,in_progress),and(status.eq.completed,crm_synced_at.is.null),and(status.eq.completed,recording_path.is.null,sarvam_interaction_id.not.is.null)")
          .limit(500);
        const organizations = [...new Set((rows ?? []).map((row) => row.organization_id as string))];

        const { syncCallsFromSarvam, fetchMissingRecordings } = await import("@/lib/sarvam.server");
        const { applyPendingCrmOutcomes } = await import("@/lib/crm-sync.server");
        const results: Array<{ organization: string; synced: number; crm: number; recordings: number; error?: string }> = [];
        for (const organization of organizations) {
          try {
            const sync = process.env["SARVAM_API_KEY"] ? await syncCallsFromSarvam(organization) : { updated: 0 };
            const crm = await applyPendingCrmOutcomes(organization);
            const recordings = process.env["SARVAM_API_KEY"] ? await fetchMissingRecordings(organization) : { saved: 0 };
            results.push({ organization, synced: sync.updated, crm: crm.applied, recordings: recordings.saved });
          } catch (error) {
            console.error("[cron-sync] organization failed", organization, error);
            results.push({ organization, synced: 0, crm: 0, recordings: 0, error: error instanceof Error ? error.message.slice(0, 200) : "failed" });
          }
        }
        return Response.json({ ok: true, organizations: results.length, results });
      },
    },
  },
});
