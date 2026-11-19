import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hashCallbackToken } from "@/lib/sarvam-auth.server";
import { formatSarvamTranscript, isValidCallbackToken, mapSarvamStatus } from "@/lib/sarvam-call";

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
        if (lookupError || !call || !isValidCallbackToken(providedHash, call.webhook_token_hash)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let transcript = formatSarvamTranscript(body.data.interaction_transcript ?? []);
        let recordingUrl: string | null = null;
        let recordingFailureReason: string | null = null;
        if (body.data.interaction_id && call.agent_id) {
          const { data: agent } = await supabaseAdmin.from("voice_agents").select("sarvam_agent_id").eq("id", call.agent_id).maybeSingle();
          const { data: organization } = await supabaseAdmin.from("organizations").select("sarvam_organization_id, sarvam_workspace_id").eq("id", call.organization_id).maybeSingle();
          const apiKey = process.env["SARVAM_API_KEY"];
          const appId = agent?.sarvam_agent_id?.trim();
          const sarvamOrg = organization?.sarvam_organization_id?.trim();
          const workspace = organization?.sarvam_workspace_id?.trim();
          if (apiKey && appId && sarvamOrg && workspace) {
            const analyticsBase = `https://apps.sarvam.ai/api/analytics/v1/${encodeURIComponent(sarvamOrg)}/${encodeURIComponent(workspace)}/${encodeURIComponent(appId)}`;
            const interactionPath = body.data.interaction_id.split("/").map(encodeURIComponent).join("%2F");
            const transcriptUrl = `${analyticsBase}/transcripts/${interactionPath}`;
            const transcriptResponse = await fetch(transcriptUrl, { headers: { "X-API-Key": apiKey } }).catch(() => null);
            if (transcriptResponse?.ok) {
              const transcriptData = await transcriptResponse.json().catch(() => null) as { messages?: Array<{ role: string; content: string }> } | null;
              const fetchedTranscript = (transcriptData?.messages ?? []).map((message) => `${message.role === "assistant" ? "Agent" : "Customer"}: ${message.content.trim()}`).filter((line) => !line.endsWith(": ")).join("\n");
              if (fetchedTranscript) transcript = fetchedTranscript;
            }
            const recordingResponse = await fetch(`${analyticsBase}/recordings/${interactionPath}`, {
              headers: { "X-API-Key": apiKey },
            }).catch(() => null);
            if (recordingResponse?.ok) {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const recordingBlob = await recordingResponse.blob();
              const recordingPath = `${call.organization_id}/${call.id}.wav`;
              const { error: uploadError } = await supabaseAdmin.storage.from("call-recordings").upload(recordingPath, recordingBlob, {
                contentType: "audio/wav",
                upsert: true,
              });
              if (!uploadError) {
                const { data: signedUrl, error: signedUrlError } = await supabaseAdmin.storage.from("call-recordings").createSignedUrl(recordingPath, 60 * 60 * 24 * 7);
                if (!signedUrlError) recordingUrl = signedUrl.signedUrl;
                else recordingFailureReason = "Recording was received but could not be made available for playback";
              } else {
                recordingFailureReason = "Recording was received but could not be saved";
              }
            } else if (recordingResponse && recordingResponse.status !== 404) {
              recordingFailureReason = "Sarvam recording could not be retrieved";
            }
          }
        }

        const sarvamStatus = body.data.status;
        const update = {
          external_id: body.data.attempt_id,
          sarvam_status: sarvamStatus,
          sarvam_interaction_id: body.data.interaction_id ?? null,
          status: mapSarvamStatus(sarvamStatus),
          duration_seconds: Math.min(86400, Math.max(0, Math.floor(body.data.duration ?? 0))),
          transcript: transcript || null,
          recording_url: recordingUrl,
          sarvam_failure_reason: body.data.failure_reason ?? recordingFailureReason,
          updated_at: new Date().toISOString(),
        };
        const { error: updateError } = await supabaseAdmin.from("calls").update(update).eq("id", call.id);
        if (updateError) return Response.json({ error: "Could not save call result" }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});