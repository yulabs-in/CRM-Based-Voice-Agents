import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hashCallbackToken } from "@/lib/sarvam-auth.server";
import { extractAnswers, formatTranscript, isValidCallbackToken, mapSarvamStatus, summarizeAnswers, toTranscriptTurns } from "@/lib/sarvam-call";

// Sarvam instant-outbound webhook: https://docs.sarvam.ai/voice-agents/api/instant-outbound/webhook-payload
const Payload = z.object({
  attempt_id: z.string().min(1).max(200),
  status: z.enum(["connected", "no_answer", "busy", "failed"]),
  app_id: z.string().min(1).max(200),
  app_version: z.number().int().positive(),
  duration: z.number().finite().nonnegative().nullable().optional(),
  interaction_id: z.string().max(300).nullable().optional(),
  failure_reason: z.string().max(2000).nullable().optional(),
  final_agent_variables: z.record(z.unknown()).nullable().optional(),
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
        const { supabaseAdmin } = await import("@/lib/supabase-admin.server");
        const { data: call, error: lookupError } = await supabaseAdmin.from("calls")
          .select("id, organization_id, webhook_token_hash, contact_id")
          .eq("id", metadata.call_id).maybeSingle();
        if (lookupError || !call || !isValidCallbackToken(await hashCallbackToken(metadata.callback_token), call.webhook_token_hash)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const turns = toTranscriptTurns(body.data.interaction_transcript);
        const answers = extractAnswers(body.data.final_agent_variables);
        const insight = summarizeAnswers(answers);
        const durationSeconds = Math.min(86400, Math.max(0, Math.floor(body.data.duration ?? 0)));
        const { error: updateError } = await supabaseAdmin.from("calls").update({
          external_id: body.data.attempt_id,
          sarvam_status: body.data.status,
          sarvam_interaction_id: body.data.interaction_id ?? null,
          status: mapSarvamStatus(body.data.status),
          duration_seconds: durationSeconds,
          transcript_turns: turns.length ? turns : null,
          transcript: turns.length ? formatTranscript(turns) : null,
          answers,
          outcome: insight.outcome,
          sentiment: insight.sentiment,
          summary: insight.summary,
          sarvam_failure_reason: body.data.failure_reason ?? null,
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", call.id);
        if (updateError) return Response.json({ error: "Could not save call result" }, { status: 500 });

        // Full multilingual transcript + WAV recording come from the Analytics API.
        if (body.data.interaction_id) {
          const { enrichCallFromSarvam, scheduleRecordingRetries } = await import("@/lib/sarvam.server");
          const enriched = await enrichCallFromSarvam(call.id).catch((error) => { console.error("[sarvam] enrich failed", error); return null; });
          // Recordings are usually not ready yet when the result arrives — keep trying in the background.
          if (!enriched?.recording) scheduleRecordingRetries(call.id);
        }

        // Automations: an instant call's result is always final.
        const { runAutomations } = await import("@/lib/automation.server");
        const { eventsForCall } = await import("@/lib/automation");
        const callStatus = mapSarvamStatus(body.data.status);
        for (const event of eventsForCall(callStatus, true)) {
          await runAutomations({
            organizationId: call.organization_id, event, callId: call.id, contactId: call.contact_id,
            facts: { status: callStatus, sentiment: insight.sentiment, outcome: insight.outcome, duration_seconds: durationSeconds, answers },
          });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
