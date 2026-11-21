import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { hashCallbackToken } from "@/lib/sarvam-auth.server";
import { extractAnswers, formatTranscript, isValidCallbackToken, mapCampaignAttempt, summarizeAnswers, toTranscriptTurns } from "@/lib/sarvam-call";

// Sarvam campaign webhook: https://docs.sarvam.ai/conversations/api/campaigns/webhook-payload
// Inline-URL deliveries are unsigned, so each campaign gets a private token in its webhook URL (?c=<id>&t=<token>).
const Variables = z.record(z.unknown()).nullable().optional();
const Payload = z.object({
  attempt_id: z.string().min(1).max(200),
  campaign_id: z.string().max(200).optional(),
  retry_attempt: z.number().int().min(0).max(100).optional(),
  completion_status: z.string().max(40).nullable().optional(),
  connectivity_status: z.string().max(40).nullable().optional(),
  next_action_status: z.string().max(60).nullable().optional(),
  failure_reason: z.string().max(2000).nullable().optional(),
  user_identifier: z.string().max(200).nullable().optional(),
  user_phone_number: z.string().max(40).nullable().optional(),
  executed_at: z.string().max(60).nullable().optional(),
  start_datetime: z.string().max(60).nullable().optional(),
  end_datetime: z.string().max(60).nullable().optional(),
  duration: z.number().finite().nonnegative().nullable().optional(),
  interaction_id: z.string().max(300).nullable().optional(),
  initial_agent_variables: Variables,
  final_agent_variables: Variables,
  output_agent_variables: Variables,
  interaction_transcript: z.array(z.object({ role: z.string().max(40), en_text: z.string().max(10000) })).nullable().optional(),
}).passthrough();

const uuid = z.string().uuid();
const TERMINAL_OPEN = ["pending", "queued", "calling", "retrying"];

export const Route = createFileRoute("/api/public/sarvam-campaign-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const campaignId = uuid.safeParse(url.searchParams.get("c"));
        const token = url.searchParams.get("t") ?? "";
        if (!campaignId.success || token.length < 40) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/lib/supabase-admin.server");
        const { data: campaign } = await supabaseAdmin.from("call_campaigns")
          .select("id, organization_id, agent_id, webhook_token_hash, sarvam_campaign_id, status").eq("id", campaignId.data).maybeSingle();
        if (!campaign || !isValidCallbackToken(await hashCallbackToken(token), campaign.webhook_token_hash)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const parsed = Payload.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid campaign result" }, { status: 400 });
        const body = parsed.data;

        const targetId = uuid.safeParse(body.user_identifier);
        const { data: target } = targetId.success
          ? await supabaseAdmin.from("campaign_targets").select("id, contact_id, attempts, answers").eq("id", targetId.data).eq("campaign_id", campaign.id).maybeSingle()
          : { data: null };

        const status = mapCampaignAttempt(body);
        const turns = toTranscriptTurns(body.interaction_transcript);
        const answers = extractAnswers(body.final_agent_variables, body.output_agent_variables, body.initial_agent_variables);
        const insight = summarizeAnswers(answers);
        const now = new Date().toISOString();

        const { data: call, error: callError } = await supabaseAdmin.from("calls").upsert({
          organization_id: campaign.organization_id,
          external_id: body.attempt_id,
          campaign_id: campaign.id,
          campaign_target_id: target?.id ?? null,
          contact_id: target?.contact_id ?? null,
          agent_id: campaign.agent_id,
          phone: body.user_phone_number ?? null,
          direction: "outbound",
          status: status.call,
          sarvam_status: body.connectivity_status ?? body.completion_status ?? null,
          sarvam_campaign_id: body.campaign_id ?? campaign.sarvam_campaign_id,
          sarvam_interaction_id: body.interaction_id ?? null,
          retry_attempt: body.retry_attempt ?? 0,
          started_at: body.start_datetime ?? body.executed_at ?? now,
          ended_at: body.end_datetime ?? null,
          duration_seconds: Math.min(86400, Math.max(0, Math.floor(body.duration ?? 0))),
          transcript_turns: turns.length ? turns : null,
          transcript: turns.length ? formatTranscript(turns) : null,
          answers,
          outcome: insight.outcome,
          sentiment: insight.sentiment,
          summary: insight.summary,
          sarvam_failure_reason: body.failure_reason ?? null,
          updated_at: now,
        }, { onConflict: "organization_id,external_id" }).select("id").single();
        if (callError || !call) return Response.json({ error: "Could not save call result" }, { status: 500 });

        if (target) {
          await supabaseAdmin.from("campaign_targets").update({
            status: status.target,
            attempts: Math.max(target.attempts, (body.retry_attempt ?? 0) + 1),
            last_call_id: call.id,
            // Keep the last real answers if a later retry didn't connect.
            answers: Object.keys(answers).length ? answers : target.answers,
            last_outcome: insight.outcome ?? body.connectivity_status ?? body.completion_status ?? null,
            updated_at: now,
          }).eq("id", target.id);
        }

        if (["launching", "scheduled"].includes(campaign.status)) {
          await supabaseAdmin.from("call_campaigns").update({ status: "running", updated_at: now }).eq("id", campaign.id);
        }
        const { count } = await supabaseAdmin.from("campaign_targets").select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id).in("status", TERMINAL_OPEN);
        const finishedNow = count === 0 && ["launching", "scheduled", "running"].includes(campaign.status);
        if (finishedNow) await supabaseAdmin.from("call_campaigns").update({ status: "completed", updated_at: now }).eq("id", campaign.id);

        if (body.interaction_id) {
          const { enrichCallFromSarvam, scheduleRecordingRetries } = await import("@/lib/sarvam.server");
          const enriched = await enrichCallFromSarvam(call.id).catch((error) => { console.error("[sarvam] campaign enrich failed", error); return null; });
          // Recordings are usually not ready yet when the result arrives — keep trying in the background.
          if (!enriched?.recording) scheduleRecordingRetries(call.id);
        }
        // Automations run once per contact, on the final attempt (no more Sarvam retries coming).
        const { runAutomations } = await import("@/lib/automation.server");
        const { eventsForCall } = await import("@/lib/automation");
        const durationSeconds = Math.min(86400, Math.max(0, Math.floor(body.duration ?? 0)));
        for (const event of eventsForCall(status.call, !body.next_action_status)) {
          await runAutomations({
            organizationId: campaign.organization_id, event, callId: call.id, contactId: target?.contact_id ?? null, campaignId: campaign.id,
            facts: { status: status.call, sentiment: insight.sentiment, outcome: insight.outcome, duration_seconds: durationSeconds, answers },
          });
        }
        if (finishedNow) await runAutomations({ organizationId: campaign.organization_id, event: "campaign.completed", campaignId: campaign.id });
        return Response.json({ ok: true });
      },
    },
  },
});
