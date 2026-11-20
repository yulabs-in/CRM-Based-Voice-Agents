import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hashCallbackToken, makeCallbackToken } from "@/lib/sarvam-auth.server";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import { fillGreeting, greetingValues } from "@/lib/campaign-vars";
import { SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";

type SarvamSettings = { sarvam_organization_id: string; sarvam_workspace_id: string };

async function requireRole(context: { supabase: SupabaseClient<Database>; userId: string }, organizationId: string, roles: string[], message: string) {
  const { data, error } = await context.supabase.from("memberships").select("role")
    .eq("organization_id", organizationId).eq("user_id", context.userId).maybeSingle();
  if (error || !data || !roles.includes(data.role)) throw new Error(message);
  return data.role as string;
}

export const saveSarvamWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    organizationId: z.string().uuid(),
    sarvamOrganizationId: z.string().trim().min(1).max(200),
    sarvamWorkspaceId: z.string().trim().min(1).max(200),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.organizationId, ["owner", "admin"], "Only organization owners and admins can update Sarvam settings");
    const { error } = await context.supabase.from("organizations").update({
      sarvam_organization_id: data.sarvamOrganizationId,
      sarvam_workspace_id: data.sarvamWorkspaceId,
    }).eq("id", data.organizationId);
    if (error) throw new Error("Could not save Sarvam settings");
    return { saved: true };
  });

/** Checks the Voice Agents API key against the saved Sarvam org/workspace (lists campaigns; returns no personal data). */
export const checkSarvamConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { sarvamJson, workspacePath, SarvamError } = await import("@/lib/sarvam.server");
    if (!process.env["SARVAM_API_KEY"]) return { connected: false, message: "No Sarvam API key on the server yet (SARVAM_API_KEY)" };
    const { data: org } = await context.supabase.from("organizations")
      .select("sarvam_organization_id, sarvam_workspace_id").eq("id", data.organizationId).maybeSingle();
    const sarvamOrg = org?.sarvam_organization_id?.trim() || SARVAM_DEFAULTS.organizationId;
    const workspace = org?.sarvam_workspace_id?.trim() || SARVAM_DEFAULTS.workspaceId;
    try {
      await sarvamJson(`/scheduling/v1${workspacePath(sarvamOrg, workspace)}/campaigns`);
      const callbackReady = Boolean(process.env["PUBLIC_APP_URL"]);
      return { connected: true, message: callbackReady ? "Connected to Sarvam" : "Connected — set PUBLIC_APP_URL so call results can reach the CRM" };
    } catch (error) {
      return { connected: false, message: error instanceof SarvamError ? error.message : "Could not reach Sarvam" };
    }
  });

/** Places one Sarvam instant outbound call (test calls and one-off calls to any contact). */
export const startSarvamCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    organizationId: z.string().uuid(),
    agentId: z.string().uuid(),
    phone: z.string().trim().min(8).max(40),
    contactId: z.string().uuid().optional(),
    customerName: z.string().trim().max(120).optional(),
    consentConfirmed: z.literal(true),
    isTest: z.boolean().default(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { sarvamJson, workspacePath, publicAppUrl, getOrgSarvamConfig, SarvamError } = await import("@/lib/sarvam.server");
    const phone = normalizePhoneNumber(data.phone);
    if (!phone) throw new Error("Enter a valid mobile number (e.g. 98765 43210 or +91…)");
    await requireRole(context, data.organizationId, ["owner", "admin", "sales_manager", "sales_rep", "voice_manager", "support_agent"], "You don't have permission to place calls");

    const { data: agent, error: agentError } = await context.supabase.from("voice_agents")
      .select("id, name, status, greeting, sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number")
      .eq("id", data.agentId).eq("organization_id", data.organizationId).single();
    if (agentError || !agent) throw new Error("Voice agent not found in this organization");
    if (agent.status !== "active") throw new Error("Choose an active voice agent");
    const appId = agent.sarvam_agent_id?.trim() || SARVAM_DEFAULTS.agentId;
    const connectionId = agent.sarvam_connection_id?.trim() || SARVAM_DEFAULTS.connectionId;
    const agentPhoneNumber = normalizePhoneNumber(agent.sarvam_agent_phone_number?.trim() || SARVAM_DEFAULTS.callerNumber);
    if (!appId || !connectionId || !agentPhoneNumber) throw new Error("Add the Sarvam agent ID, telephony connection ID, and connected caller number to this voice agent first");

    let config;
    let webhookUrl: string;
    try {
      config = await getOrgSarvamConfig(data.organizationId);
      webhookUrl = `${publicAppUrl(new URL(getRequest().url).origin)}/api/public/sarvam-call-webhook`;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Sarvam is not configured");
    }

    const { data: active } = await context.supabase.from("calls").select("id")
      .eq("organization_id", data.organizationId).eq("phone", phone).in("status", ["queued", "in_progress"])
      .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()).limit(1).maybeSingle();
    if (active) throw new Error("A call to this number is already in progress");

    let contactId = data.contactId ?? null;
    // Only send customer_name when the user typed it: Sarvam rejects (422) variables the agent doesn't define.
    const customerName = data.customerName?.trim() ?? "";
    const contactQuery = context.supabase.from("contacts").select("id, first_name, last_name, email, city, job_title, custom_fields").eq("organization_id", data.organizationId);
    const { data: contact } = await (contactId ? contactQuery.eq("id", contactId) : contactQuery.eq("phone", phone)).limit(1).maybeSingle();
    contactId = contact?.id ?? contactId;
    // The opening line is sent already filled in, so the agent never reads "{customer_name}" aloud.
    const greeting = fillGreeting(agent.greeting, greetingValues(contact ?? null, customerName ? { customer_name: customerName, full_name: customerName } : {}));

    const callbackToken = makeCallbackToken();
    const { data: call, error: insertError } = await context.supabase.from("calls").insert({
      organization_id: data.organizationId,
      agent_id: agent.id,
      contact_id: contactId,
      phone,
      direction: "outbound",
      status: "queued",
      sarvam_status: "queued",
      webhook_token_hash: await hashCallbackToken(callbackToken),
      is_test_call: data.isTest,
    }).select("id").single();
    if (insertError || !call) throw new Error("Could not create the call record");

    try {
      const payload = await sarvamJson<{ attempt_id?: string }>(`/outbounds/v1${workspacePath(config.sarvamOrg, config.workspace)}/outbounds`, {
        method: "POST",
        body: {
          app_config: {
            app_id: appId,
            app_version: agent.sarvam_app_version,
            connection_config: { connection_id: connectionId, agent_phone_number: agentPhoneNumber },
            ...(customerName ? { agent_variables: { customer_name: customerName } } : {}),
            ...(greeting ? { app_overrides: { initial_bot_message: greeting } } : {}),
          },
          user_config: { user_phone_number: phone },
          webhook_config: { url: webhookUrl, metadata: { call_id: call.id, callback_token: callbackToken } },
        },
      });
      if (!payload.attempt_id) throw new SarvamError("Sarvam did not return a call attempt ID");
      await context.supabase.from("calls").update({ external_id: payload.attempt_id, status: "in_progress", sarvam_status: "dialing" }).eq("id", call.id);
      return { callId: call.id, attemptId: payload.attempt_id, phone };
    } catch (error) {
      let reason = error instanceof Error ? error.message : "Could not reach Sarvam";
      if (error instanceof SarvamError && error.status === 422 && customerName) {
        reason += " — if your Sarvam agent has no customer_name variable, leave Customer name empty and try again.";
      }
      await context.supabase.from("calls").update({ status: "failed", sarvam_status: "failed", sarvam_failure_reason: reason }).eq("id", call.id);
      throw new Error(reason);
    }
  });

/** @deprecated name kept for older imports */
export const startSarvamSupportCall = startSarvamCall;

export type SarvamWorkspaceSettings = SarvamSettings;
