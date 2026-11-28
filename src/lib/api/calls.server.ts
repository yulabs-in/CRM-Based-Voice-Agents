import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { ApiError } from "@/lib/api-auth.server";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import { phoneKey } from "@/lib/campaign-vars";
import { makeCallbackToken, hashCallbackToken } from "@/lib/sarvam-auth.server";
import { isBlocked, logBlockedAttempt } from "@/lib/dnc.server";
import { SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";
import { decodeCursor, encodeCursor, isUuid, parseLimit } from "./pagination";

export const CALL_COLUMNS =
  "id, organization_id, contact_id, agent_id, campaign_id, direction, status, sarvam_status, duration_seconds, answers, summary, transcript, transcript_turns, started_at, ended_at, created_at, is_test_call, recording_url";

const CALL_COLUMNS_WITH_PATH = `${CALL_COLUMNS}, recording_path`;

export async function listCalls(
  orgId: string,
  params: {
    status?: string | null;
    agentId?: string | null;
    campaignId?: string | null;
    since?: string | null;
    limit?: string | null;
    cursor?: string | null;
  }
) {
  const limit = parseLimit(params.limit);
  const cursor = decodeCursor(params.cursor);

  let query = supabaseAdmin
    .from("calls")
    .select(CALL_COLUMNS)
    .eq("organization_id", orgId);

  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.agentId) {
    if (!isUuid(params.agentId)) {
      throw new ApiError(400, "invalid_request", "agent_id must be a valid UUID");
    }
    query = query.eq("agent_id", params.agentId);
  }
  if (params.campaignId) {
    if (!isUuid(params.campaignId)) {
      throw new ApiError(400, "invalid_request", "campaign_id must be a valid UUID");
    }
    query = query.eq("campaign_id", params.campaignId);
  }
  if (params.since) {
    if (Number.isNaN(Date.parse(params.since))) {
      throw new ApiError(400, "invalid_request", "since must be a valid ISO timestamp");
    }
    query = query.gte("created_at", params.since);
  }

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }

  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  const { data, error } = await query;
  if (error) {
    console.error("[api/calls] listCalls failed:", error.message);
    throw new ApiError(500, "internal_error", "Failed to list calls");
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  let next_cursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1] as { created_at: string; id: string };
    next_cursor = encodeCursor(lastItem.created_at, lastItem.id);
  }

  return {
    data: items,
    next_cursor,
  };
}

export async function getCallById(orgId: string, callId: string) {
  if (!isUuid(callId)) return null;

  const { data: call, error } = await supabaseAdmin
    .from("calls")
    .select(CALL_COLUMNS_WITH_PATH)
    .eq("organization_id", orgId)
    .eq("id", callId)
    .maybeSingle();

  if (error) {
    console.error("[api/calls] getCallById failed:", error.message);
    throw new ApiError(500, "internal_error", "Failed to fetch call");
  }
  if (!call) return null;

  // Generate short-lived signed recording URL (~10 minutes) if recording exists, never expose recording_path
  let signedRecordingUrl: string | null = null;
  if (call.recording_path) {
    try {
      const { data: signedData } = await supabaseAdmin.storage
        .from("call-recordings")
        .createSignedUrl(call.recording_path, 600);
      signedRecordingUrl = signedData?.signedUrl ?? null;
    } catch {
      signedRecordingUrl = null;
    }
  }

  const { recording_path: _omitted, ...publicCall } = call;
  void _omitted;

  return {
    ...publicCall,
    recording_url: signedRecordingUrl ?? publicCall.recording_url,
  };
}

export async function placeOutboundCall(
  orgId: string,
  input: {
    phone: string;
    agent_id: string;
    contact_id?: string | null;
    variables?: Record<string, unknown>;
    consent_confirmed: boolean;
  },
  reqOrigin?: string
) {
  if (!input.consent_confirmed) {
    throw new ApiError(
      400,
      "invalid_request",
      "Explicit customer consent is required before placing a call (consent_confirmed: true)"
    );
  }

  const phone = normalizePhoneNumber(input.phone);
  if (!phone) {
    throw new ApiError(400, "invalid_request", "Invalid phone number. Must be a valid mobile number.");
  }

  // Verify contact belongs to this organization if contact_id is supplied (prevents cross-tenant link)
  if (input.contact_id) {
    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("id", input.contact_id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (contactErr) {
      console.error("[api/calls] contact lookup failed:", contactErr.message);
      throw new ApiError(500, "internal_error", "Failed to verify contact");
    }
    if (!contact) {
      throw new ApiError(404, "not_found", "Contact not found in this organization");
    }
  }

  // Refuse do-not-contact / inactive numbers (phone-level DNC registry + contact status)
  const registryBlocked = await isBlocked(orgId, phone);
  const { data: blocked } = await supabaseAdmin
    .from("contacts")
    .select("phone")
    .eq("organization_id", orgId)
    .eq("status", "inactive")
    .ilike("phone", `%${phoneKey(phone)}`)
    .limit(20);

  if (registryBlocked || (blocked ?? []).some((row) => phoneKey(row.phone) === phoneKey(phone))) {
    await logBlockedAttempt({
      orgId,
      phone,
      where: "api_v1_calls",
      contactId: input.contact_id ?? null,
    });
    throw new ApiError(409, "do_not_contact", "This number is marked do-not-call");
  }

  // Check agent exists, belongs to org, and is active
  const { data: agent, error: agentError } = await supabaseAdmin
    .from("voice_agents")
    .select("id, name, status, greeting, greeting_no_name, agent_variables, sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number")
    .eq("id", input.agent_id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (agentError) {
    console.error("[api/calls] agent lookup failed:", agentError.message);
    throw new ApiError(500, "internal_error", "Failed to look up voice agent");
  }
  if (!agent) {
    throw new ApiError(404, "not_found", "Voice agent not found in this organization");
  }
  if (agent.status !== "active") {
    throw new ApiError(400, "agent_inactive", "Voice agent is not active");
  }

  // Refuse if call already in progress
  const { data: active } = await supabaseAdmin
    .from("calls")
    .select("id")
    .eq("organization_id", orgId)
    .eq("phone", phone)
    .in("status", ["queued", "in_progress"])
    .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();

  if (active) {
    throw new ApiError(409, "call_in_progress", "A call to this number is already in progress");
  }

  const callbackToken = makeCallbackToken();
  const tokenHash = await hashCallbackToken(callbackToken);

  const { data: call, error: insertError } = await supabaseAdmin
    .from("calls")
    .insert({
      organization_id: orgId,
      agent_id: agent.id,
      contact_id: input.contact_id ?? null,
      phone,
      direction: "outbound",
      status: "queued",
      sarvam_status: "queued",
      webhook_token_hash: tokenHash,
      is_test_call: false,
    })
    .select("id, status")
    .single();

  if (insertError || !call) {
    console.error("[api/calls] insert failed:", insertError?.message);
    throw new ApiError(500, "internal_error", "Failed to create call record");
  }

  try {
    const { sarvamJson, workspacePath, publicAppUrl, getOrgSarvamConfig } = await import("@/lib/sarvam.server");
    const config = await getOrgSarvamConfig(orgId);
    const webhookUrl = `${publicAppUrl(reqOrigin)}/api/public/sarvam-call-webhook`;
    const appId = agent.sarvam_agent_id?.trim() || SARVAM_DEFAULTS.agentId;
    const connectionId = agent.sarvam_connection_id?.trim() || SARVAM_DEFAULTS.connectionId;
    const agentPhoneNumber = normalizePhoneNumber(agent.sarvam_agent_phone_number?.trim() || SARVAM_DEFAULTS.callerNumber);

    const payload = await sarvamJson<{ attempt_id?: string }>(
      `/outbounds/v1${workspacePath(config.sarvamOrg, config.workspace)}/outbounds`,
      {
        method: "POST",
        body: {
          app_config: {
            app_id: appId,
            app_version: agent.sarvam_app_version,
            connection_config: { connection_id: connectionId, agent_phone_number: agentPhoneNumber },
            ...(input.variables ? { agent_variables: input.variables } : {}),
            app_overrides: { initial_bot_message: agent.greeting || "Hello" },
          },
          user_config: { user_phone_number: phone },
          webhook_config: { url: webhookUrl, metadata: { call_id: call.id, callback_token: callbackToken } },
        },
      }
    );

    if (payload.attempt_id) {
      await supabaseAdmin
        .from("calls")
        .update({
          external_id: payload.attempt_id,
          status: "in_progress",
          sarvam_status: "dialing",
        })
        .eq("id", call.id);
    }

    return {
      id: call.id,
      status: payload.attempt_id ? "in_progress" : call.status,
    };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message.slice(0, 500) : "Sarvam dispatch failed";
    console.error("[api/calls] Sarvam dispatch failed:", reason);
    await supabaseAdmin
      .from("calls")
      .update({
        status: "failed",
        sarvam_status: "failed",
        sarvam_failure_reason: reason,
      })
      .eq("id", call.id);

    throw new ApiError(502, "call_dispatch_failed", "Failed to dispatch outbound call");
  }
}
