import { supabaseAdmin } from "@/lib/supabase-admin.server";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import { phoneKey } from "@/lib/campaign-vars";
import { makeCallbackToken, hashCallbackToken } from "@/lib/sarvam-auth.server";
import { SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";
import { decodeCursor, encodeCursor, parseLimit } from "./pagination";

export const CALL_COLUMNS =
  "id, organization_id, contact_id, agent_id, campaign_id, direction, status, sarvam_status, duration_seconds, answers, summary, transcript, transcript_turns, started_at, ended_at, created_at, is_test_call, recording_path, recording_url";

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
    query = query.eq("agent_id", params.agentId);
  }
  if (params.campaignId) {
    query = query.eq("campaign_id", params.campaignId);
  }
  if (params.since) {
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
  if (error) throw new Error(error.message);

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
  const { data: call, error } = await supabaseAdmin
    .from("calls")
    .select(CALL_COLUMNS)
    .eq("organization_id", orgId)
    .eq("id", callId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!call) return null;

  // Generate short-lived signed recording URL (~10 minutes) if recording exists
  let signedRecordingUrl: string | null = null;
  if (call.recording_path) {
    try {
      const { data: signedData } = await supabaseAdmin.storage
        .from("call-recordings")
        .createSignedUrl(call.recording_path, 600); // 10 minutes
      signedRecordingUrl = signedData?.signedUrl ?? null;
    } catch {
      signedRecordingUrl = null;
    }
  }

  return {
    ...call,
    recording_url: signedRecordingUrl ?? call.recording_url,
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
    throw new Error("Explicit customer consent is required before placing a call (consent_confirmed: true)");
  }

  const phone = normalizePhoneNumber(input.phone);
  if (!phone) {
    throw new Error("Invalid phone number. Must be a valid mobile number.");
  }

  // Refuse do-not-contact / inactive numbers
  const { data: blocked } = await supabaseAdmin
    .from("contacts")
    .select("phone")
    .eq("organization_id", orgId)
    .eq("status", "inactive")
    .ilike("phone", `%${phoneKey(phone)}`)
    .limit(20);

  if ((blocked ?? []).some((row) => phoneKey(row.phone) === phoneKey(phone))) {
    const err: any = new Error("This number is marked do-not-call");
    err.code = "do_not_contact";
    err.status = 409;
    throw err;
  }

  // Check agent exists and belongs to org
  const { data: agent, error: agentError } = await supabaseAdmin
    .from("voice_agents")
    .select("id, name, status, greeting, greeting_no_name, agent_variables, sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number")
    .eq("id", input.agent_id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (agentError || !agent) {
    throw new Error("Voice agent not found in this organization");
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
    throw new Error("A call to this number is already in progress");
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
    throw new Error(insertError?.message || "Failed to create call record");
  }

  // Trigger Sarvam API if configured
  try {
    const { sarvamJson, workspacePath, publicAppUrl, getOrgSarvamConfig } = await import("@/lib/sarvam.server");
    const config = await getOrgSarvamConfig(orgId);
    const webhookUrl = `${publicAppUrl(reqOrigin || "https://yulabs-crm-1122.netlify.app")}/api/public/sarvam-call-webhook`;
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
  } catch {
    // If Sarvam call dispatch fails or in test env without Sarvam, call remains queued or logged
  }

  return {
    id: call.id,
    status: call.status,
  };
}
