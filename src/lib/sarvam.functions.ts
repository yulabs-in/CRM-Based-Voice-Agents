import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hashCallbackToken, makeCallbackToken } from "@/lib/sarvam-auth.server";
import { isApprovedSupportTestPhone, normalizePhoneNumber } from "@/lib/sarvam-call";

type SarvamSettings = { sarvam_organization_id: string; sarvam_workspace_id: string };

export const saveSarvamWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    organizationId: z.string().uuid(),
    sarvamOrganizationId: z.string().trim().max(200),
    sarvamWorkspaceId: z.string().trim().max(200),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = data.organizationId.trim();
    const sarvamOrganizationId = data.sarvamOrganizationId.trim();
    const sarvamWorkspaceId = data.sarvamWorkspaceId.trim();
    if (!organizationId || !sarvamOrganizationId || !sarvamWorkspaceId || sarvamOrganizationId.length > 200 || sarvamWorkspaceId.length > 200) throw new Error("Enter valid Sarvam organization and workspace IDs");
    const { data: membership, error: membershipError } = await context.supabase
      .from("memberships").select("role").eq("organization_id", organizationId).eq("user_id", context.userId).maybeSingle();
    if (membershipError || !membership || !["owner", "admin"].includes(membership.role)) throw new Error("Only organization owners and admins can update Sarvam settings");
    const { error } = await context.supabase.from("organizations").update({
      sarvam_organization_id: sarvamOrganizationId || null,
      sarvam_workspace_id: sarvamWorkspaceId || null,
    }).eq("id", organizationId);
    if (error) throw new Error("Could not save Sarvam settings");
    return { saved: true };
  });

export const startSarvamSupportCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    phone: z.string().trim().min(8).max(40),
    consentConfirmed: z.literal(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    if (!data.consentConfirmed) throw new Error("Confirm the recipient agreed to this test call first");
    const phone = normalizePhoneNumber(data.phone);
    if (!phone) throw new Error("Enter a valid mobile number");
    if (!isApprovedSupportTestPhone(phone)) throw new Error("This one-time test is approved only for 8019628820");

    const { data: organization, error: organizationError } = await context.supabase
      .from("organizations").select("id, sarvam_organization_id, sarvam_workspace_id")
      .eq("id", data.organizationId).single();
    if (organizationError || !organization) throw new Error("Organization not found");
    const { data: agent, error: agentError } = await context.supabase
      .from("voice_agents")
      .select("id, organization_id, name, purpose, status, sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number")
      .eq("id", data.agentId).eq("organization_id", organization.id).single();
    if (agentError || !agent) throw new Error("Voice agent not found in this organization");
    if (agent.status !== "active" || agent.purpose !== "support") throw new Error("Choose an active support agent");

    const apiKey = process.env["SARVAM_API_KEY"];
    if (!apiKey) throw new Error("Sarvam API key is not configured");
    const sarvamOrganizationId = organization.sarvam_organization_id?.trim();
    const sarvamWorkspaceId = organization.sarvam_workspace_id?.trim();
    const appId = agent.sarvam_agent_id?.trim();
    const connectionId = agent.sarvam_connection_id?.trim();
    const agentPhoneNumber = normalizePhoneNumber(agent.sarvam_agent_phone_number ?? "");
    if (!sarvamOrganizationId || !sarvamWorkspaceId) throw new Error("Add the Sarvam organization ID and workspace ID in Integrations first");
    if (!appId || !connectionId || !agentPhoneNumber) throw new Error("Add the agent ID, telephony connection ID, and connected caller number to this voice agent first");

    const { data: previousCall, error: previousCallError } = await context.supabase
      .from("calls").select("id").eq("organization_id", organization.id).eq("phone", phone)
      .in("status", ["queued", "in_progress"]).limit(1).maybeSingle();
    if (previousCallError) throw new Error("Could not check for an active call");
    if (previousCall) throw new Error("A call to this number is already in progress");

    const callbackToken = makeCallbackToken();
    const callbackTokenHash = await hashCallbackToken(callbackToken);
    const { data: contact } = await context.supabase.from("contacts").select("id")
      .eq("organization_id", organization.id).eq("phone", phone).limit(1).maybeSingle();
    const { data: call, error: insertError } = await context.supabase.from("calls").insert({
      organization_id: organization.id,
      agent_id: agent.id,
      contact_id: contact?.id ?? null,
      phone,
      direction: "outbound",
      status: "queued",
      sarvam_status: "queued",
      webhook_token_hash: callbackTokenHash,
      is_test_call: true,
    }).select("id").single();
    if (insertError || !call) {
      if (insertError?.code === "23505") throw new Error("The one-time support test call for this number has already been used");
      throw new Error("Could not create the test call record");
    }

    const origin = new URL(getRequest().url).origin;
    const webhookUrl = `${origin}/api/public/sarvam-call-webhook`;
    const endpoint = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${encodeURIComponent(sarvamOrganizationId)}/workspaces/${encodeURIComponent(sarvamWorkspaceId)}/outbounds`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          app_config: {
            app_id: appId,
            app_version: agent.sarvam_app_version,
            connection_config: { connection_id: connectionId, agent_phone_number: agentPhoneNumber },
            agent_variables: { company_name: "Yulabs Support Test", call_purpose: "customer support test" },
            app_overrides: {
              initial_bot_message: "Hello, this is the Yulabs AI support assistant on a test call. This call may be recorded and transcribed. Is now a good time to continue?",
              initial_language_name: "English",
            },
          },
          user_config: { user_phone_number: phone },
          webhook_config: { url: webhookUrl, metadata: { call_id: call.id, callback_token: callbackToken } },
        }),
      });
      if (!response.ok) {
        await context.supabase.from("calls").update({ status: "failed", sarvam_status: "failed", sarvam_failure_reason: `Sarvam could not start the call (HTTP ${response.status})` }).eq("id", call.id);
        throw new Error(response.status === 401 || response.status === 403
          ? "Sarvam rejected the API key or workspace access"
          : `Sarvam could not start the call (HTTP ${response.status}); check the configured agent and telephony details`);
      }
      const payload = await response.json() as { attempt_id?: string };
      if (!payload.attempt_id) {
        await context.supabase.from("calls").update({ status: "failed", sarvam_status: "failed", sarvam_failure_reason: "Sarvam returned no call attempt ID" }).eq("id", call.id);
        throw new Error("Sarvam did not return a call attempt ID");
      }
      const { error: updateError } = await context.supabase.from("calls").update({ external_id: payload.attempt_id }).eq("id", call.id);
      if (updateError) throw new Error("Sarvam accepted the call, but the CRM could not save its reference");
      return { callId: call.id, attemptId: payload.attempt_id, phone };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Sarvam ")) throw error;
      await context.supabase.from("calls").update({ status: "failed", sarvam_status: "failed", sarvam_failure_reason: "Could not reach Sarvam" }).eq("id", call.id);
      throw new Error("Could not reach Sarvam to start the call");
    }
  });

export type SarvamWorkspaceSettings = SarvamSettings;