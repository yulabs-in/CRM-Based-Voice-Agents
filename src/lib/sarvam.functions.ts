import { asApp } from "@/lib/supabase";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { hashCallbackToken, makeCallbackToken } from "@/lib/sarvam-auth.server";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import { asVariableMap, nameVariables, greetingValues, openingLine, phoneKey, pickContactForPhone, resolveVariables } from "@/lib/campaign-vars";
import { DNC_REFUSAL_MESSAGE } from "@/lib/dnc";
import { SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";

// No CRM contact for this number: contact fields go out empty, fixed "=" values still apply.
const NO_CONTACT = { first_name: "", last_name: null, email: null, city: null, job_title: null, custom_fields: {} };

type SarvamSettings = { sarvam_organization_id: string; sarvam_workspace_id: string };

async function requireRole(context: { supabase: SupabaseClient<Database>; userId: string }, organizationId: string, roles: string[], message: string) {
  const { data, error } = await asApp(context.supabase).from("memberships").select("role")
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
    const { error } = await asApp(context.supabase).from("organizations").update({
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
    const { data: org } = await asApp(context.supabase).from("organizations")
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
    await requireRole(context, data.organizationId, ["owner", "admin", "sales_manager", "team_lead", "sales_rep", "voice_manager", "support_agent"], "You don't have permission to place calls");

    const { data: agent, error: agentError } = await asApp(context.supabase).from("voice_agents")
      .select("id, name, status, greeting, greeting_no_name, agent_variables, sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number")
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

    // Someone at this number asked not to be called again (phone-level DNC registry or inactive contact): never dial it.
    const { isBlocked, logBlockedAttempt } = await import("@/lib/dnc.server");
    const registryBlocked = await isBlocked(data.organizationId, phone);
    const { data: blocked } = await asApp(context.supabase).from("contacts").select("phone")
      .eq("organization_id", data.organizationId).eq("status", "inactive").ilike("phone", `%${phoneKey(phone)}`).limit(20);
    const contactInactive = (blocked ?? []).some((row) => phoneKey(row.phone) === phoneKey(phone));
    if (registryBlocked || contactInactive) {
      await logBlockedAttempt({
        orgId: data.organizationId,
        phone,
        where: "one_off_call",
        actor: context.userId,
        contactId: data.contactId ?? null,
      });
      throw new Error(DNC_REFUSAL_MESSAGE);
    }

    const { data: active } = await asApp(context.supabase).from("calls").select("id")
      .eq("organization_id", data.organizationId).eq("phone", phone).in("status", ["queued", "in_progress"])
      .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()).limit(1).maybeSingle();
    if (active) throw new Error("A call to this number is already in progress");

    const customerName = data.customerName?.trim() ?? "";
    const contactColumns = "id, first_name, last_name, email, city, job_title, custom_fields, phone";
    let sharedBy: string[] = [];
    let contact: { id: string; first_name: string; last_name: string | null; email: string | null; city: string | null; job_title: string | null; custom_fields: unknown; phone: string | null } | null = null;
    if (data.contactId) {
      const { data: row } = await asApp(context.supabase).from("contacts").select(contactColumns).eq("organization_id", data.organizationId).eq("id", data.contactId).maybeSingle();
      contact = row;
    } else {
      // Same number may be saved as +91…, 0… or 10 digits, and by several people. Only personalise when they all agree.
      const { data: rows } = await asApp(context.supabase).from("contacts").select(contactColumns).eq("organization_id", data.organizationId)
        .ilike("phone", `%${phoneKey(phone)}`).limit(20);
      const sameNumber = (rows ?? []).filter((row) => phoneKey(row.phone) === phoneKey(phone));
      contact = pickContactForPhone(sameNumber);
      if (!contact && sameNumber.length > 1) sharedBy = sameNumber.map((row) => `${row.first_name} ${row.last_name ?? ""}`.trim());
    }
    const contactId = contact?.id ?? data.contactId ?? null;
    // A typed name always wins over the CRM record.
    const extra: Record<string, string> = customerName ? { customer_name: customerName, full_name: customerName } : {};
    // Variables come from the voice agent row in the database — the same list the Sarvam agent defines.
    const variableMap = asVariableMap(agent.agent_variables);
    const agentVariables = Object.keys(variableMap).length
      ? { ...(resolveVariables(contact ?? NO_CONTACT, variableMap)), ...(customerName ? Object.fromEntries(nameVariables(variableMap).map((name) => [name, customerName])) : {}) }
      : customerName ? { customer_name: customerName } : {};
    // Always a finished sentence: the agent never reads "{customer_name}" aloud or greets a guessed name.
    const greeting = openingLine(agent.greeting, greetingValues(contact, extra), agent.greeting_no_name);

    const callbackToken = makeCallbackToken();
    const { data: call, error: insertError } = await asApp(context.supabase).from("calls").insert({
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
            ...(Object.keys(agentVariables).length ? { agent_variables: agentVariables } : {}),
            app_overrides: { initial_bot_message: greeting },
          },
          user_config: { user_phone_number: phone },
          webhook_config: { url: webhookUrl, metadata: { call_id: call.id, callback_token: callbackToken } },
        },
      });
      if (!payload.attempt_id) throw new SarvamError("Sarvam did not return a call attempt ID");
      await asApp(context.supabase).from("calls").update({ external_id: payload.attempt_id, status: "in_progress", sarvam_status: "dialing" }).eq("id", call.id);
      return { callId: call.id, attemptId: payload.attempt_id, phone, sharedBy, greeting };
    } catch (error) {
      let reason = error instanceof Error ? error.message : "Could not reach Sarvam";
      if (error instanceof SarvamError && error.status === 422) {
        reason += " — the Sarvam agent version must define the same variables as this voice agent (" + Object.keys(agentVariables).join(", ") + "). Commit the Sarvam draft or update the agent's version.";
      }
      await asApp(context.supabase).from("calls").update({ status: "failed", sarvam_status: "failed", sarvam_failure_reason: reason }).eq("id", call.id);
      throw new Error(reason);
    }
  });

/** @deprecated name kept for older imports */
export const startSarvamSupportCall = startSarvamCall;

export type SarvamWorkspaceSettings = SarvamSettings;
