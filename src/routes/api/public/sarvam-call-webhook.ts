import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { constantTimeStringEqual, hashCallbackToken } from "@/lib/sarvam-auth.server";
import { formatSarvamTranscript, mapSarvamStatus } from "@/lib/sarvam-call";

const Payload = z.object({
  attempt_id: z.string().min(1).max(200),
  status: z.enum(["connected", "no_answer", "busy", "failed"]),
  app_id: z.string().min(1).max(200),
  app_version: z.number().int().positive(),
  duration: z.number().finite().nonnegative().nullable().optional(),
  interaction_id: z.string().max(300).nullable().optional(),
  failure_reason: z.string().max(2000).nullable().optional(),
  interaction_transcript: z.array(z.object({ role: z.string().max(40), en_text: z.string().max(10000) })).nullable().optional(),
  webhook_config: z.object({
    metadata: z.object({ call_id: z.string().uuid(), callback_token: z.string().min(40).max(200) }).passthrough(),
  }).passthrough().nullable().optional(),
}).passthrough();

export const Route = createFileRoute("/api/public/sarvam-call-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = Payload.safeParse(await request.json().catch(() => null));
        if (!body.success) return Response.json({ error: "Invalid call result" }, { status: 400 });

        const metadata = body.data.webhook_config?.metadata;
        if (!metadata) return new Response("Unauthorized", { status: 401 });
        const providedHash = await hashCallbackToken(metadata.callback_token);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: call, error: lookupError } = await supabaseAdmin.from("calls")
          .select("id, organization_id, webhook_token_hash, agent_id")
          .eq("id", metadata.call_id).maybeSingle();
        if (lookupError || !call?.webhook_token_hash || !constantTimeStringEqual(call.webhook_token_hash, providedHash)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let transcript = formatSarvamTranscript(body.data.interaction_transcript ?? []);
        if (!transcript && body.data.interaction_id && call.agent_id) {
          const { data: agent } = await supabaseAdmin.from("voice_agents").select("sarvam_agent_id").eq("id", call.agent_id).maybeSingle();
          const { data: organization } = await supabaseAdmin.from("organizations").select("sarvam_organization_id, sarvam_workspace_id").eq("id", call.organization_id).maybeSingle();
          const apiKey = process.env["SARVAM_API_KEY"];
          const appId = agent?.sarvam_agent_id?.trim();
          const sarvamOrg = organization?.sarvam_organization_id?.trim();
          const workspace = organization?.sarvam_workspace_id?.trim();
          if (apiKey && appId && sarvamOrg && workspace) {
            const transcriptUrl = `https://apps.sarvam.ai/api/analytics/v1/${encodeURIComponent(sarvamOrg)}/${encodeURIComponent(workspace)}/${encodeURIComponent(appId)}/transcripts/${body.data.interaction_id.split("/").map(encodeURIComponent).join("%2F")}`;
            const transcriptResponse = await fetch(transcriptUrl, { headers: { "X-API-Key": apiKey } }).catch(() => null);
            if (transcriptResponse?.ok) {
              const transcriptData = await transcriptResponse.json().catch(() => null) as { messages?: Array<{ role: string; content: string }> } | null;
              transcript = (transcriptData?.messages ?? []).map((message) => `${message.role === "assistant" ? "Agent" : "Customer"}: ${message.content.trim()}`).filter((line) => !line.endsWith(": ")).join("\n");
            }
          }
        }

        const sarvamStatus = body.data.status;
        const update = {
          external_id: body.data.attempt_id,
          sarvam_status: sarvamStatus,
          sarvam_interaction_id: body.data.interaction_id ?? null,
          sarvam_failure_reason: body.data.failure_reason ?? null,
          status: mapSarvamStatus(sarvamStatus),
          duration_seconds: Math.min(86400, Math.max(0, Math.floor(body.data.duration ?? 0))),
          transcript: transcript || null,
          updated_at: new Date().toISOString(),
        };
        const { error: updateError } = await supabaseAdmin.from("calls").update(update).eq("id", call.id);
        if (updateError) return Response.json({ error: "Could not save call result" }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});