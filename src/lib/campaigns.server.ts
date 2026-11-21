import { asApp } from "@/lib/supabase";
// Server-only campaign launch, shared by the "Launch" button (user's RLS client) and automations (service client).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { hashCallbackToken, makeCallbackToken } from "@/lib/sarvam-auth.server";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import { SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";
import { chunk, cohortName, fillGreeting, greetingValues, resolveVariables, type CohortContact, type VariableMap } from "@/lib/campaign-vars";

async function loadCampaign(context: { supabase: SupabaseClient<Database> }, campaignId: string) {
  const { data, error } = await asApp(context.supabase).from("call_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (error || !data) throw new Error("Campaign not found");
  return data;
}

const message = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong talking to Sarvam");

/**
 * Launches a project campaign on Sarvam:
 * 1. snapshot the project's callable contacts into campaign_targets,
 * 2. create the Sarvam campaign (schedule window, retries, webhook with a private token),
 * 3. stream the targets as cohorts of ≤1000 users (user_identifier = target id).
 */
export async function runCampaignLaunch(client: SupabaseClient<Database>, campaignId: string, requestOrigin?: string) {
    const { sarvamJson, workspacePath, publicAppUrl, getOrgSarvamConfig } = await import("@/lib/sarvam.server");
    const campaign = await loadCampaign({ supabase: client }, campaignId);
    if (!["draft", "failed"].includes(campaign.status)) throw new Error(`This campaign is already ${campaign.status}`);
    if (!campaign.consent_confirmed) throw new Error("Confirm that the contacts agreed to be called before launching");
    const contactIds = campaign.contact_ids?.length ? campaign.contact_ids : null;
    if (!campaign.project_id && !contactIds) throw new Error("Choose the project whose contacts should be called");
    if (!campaign.agent_id) throw new Error("Choose a voice agent");

    const { data: agent } = await client.from("voice_agents")
      .select("id, status, greeting, sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number").eq("id", campaign.agent_id).maybeSingle();
    const appId = agent?.sarvam_agent_id?.trim() || SARVAM_DEFAULTS.agentId;
    const connectionId = agent?.sarvam_connection_id?.trim() || SARVAM_DEFAULTS.connectionId;
    const agentPhone = normalizePhoneNumber(agent?.sarvam_agent_phone_number?.trim() || SARVAM_DEFAULTS.callerNumber);
    if (!agent || agent.status !== "active") throw new Error("The selected voice agent is not active");
    if (!appId || !connectionId || !agentPhone) throw new Error("The voice agent needs its Sarvam agent ID, telephony connection ID and caller number (Voice Agents page)");

    let config;
    let base: string;
    try {
      config = await getOrgSarvamConfig(campaign.organization_id);
      base = publicAppUrl(requestOrigin);
    } catch (error) {
      throw new Error(message(error));
    }

    // 1. Snapshot callable contacts.
    const contacts: Array<CohortContact & { id: string; phone: string | null }> = [];
    for (let from = 0; ; from += 1000) {
      const base = client.from("contacts")
        .select("id, phone, first_name, last_name, email, city, job_title, custom_fields")
        .eq("organization_id", campaign.organization_id).not("phone", "is", null)
        // Inactive = do-not-call (set manually or by the "Not interested" workflow).
        .neq("status", "inactive");
      // Specific contacts (scheduled call / automation callback) or the whole project.
      const scoped = contactIds ? base.in("id", contactIds) : base.eq("project_id", campaign.project_id!);
      const { data: page, error } = await scoped.order("created_at").range(from, from + 999);
      if (error) throw new Error("Could not load the project's contacts");
      contacts.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }
    const seen = new Set<string>();
    const callable = contacts.flatMap((contact) => {
      const phone = normalizePhoneNumber(contact.phone ?? "");
      if (!phone || seen.has(phone)) return [];
      seen.add(phone);
      return [{ ...contact, phone }];
    });
    if (!callable.length) throw new Error("This project has no contacts with a valid phone number");

    await client.from("campaign_targets").delete().eq("campaign_id", campaign.id); // relaunch after a failed attempt
    const targetIds = new Map<string, string>();
    for (const part of chunk(callable, 1000)) {
      const { data: inserted, error } = await client.from("campaign_targets")
        .insert(part.map((contact) => ({ organization_id: campaign.organization_id, campaign_id: campaign.id, contact_id: contact.id, phone: contact.phone, status: "pending" })))
        .select("id, contact_id");
      if (error) throw new Error(`Could not prepare the call list: ${error.message}`);
      for (const row of inserted ?? []) if (row.contact_id) targetIds.set(row.contact_id, row.id);
    }

    // 2. Create the Sarvam campaign.
    const token = makeCallbackToken();
    // Sarvam requires start_timestamp ≥ 120 s in the future; use 3 min for "start now" (and for past/too-soon start times).
    const earliest = new Date(Date.now() + 3 * 60_000);
    const start = campaign.starts_at && new Date(campaign.starts_at) > earliest ? new Date(campaign.starts_at) : earliest;
    const end = campaign.ends_at && new Date(campaign.ends_at) > start ? new Date(campaign.ends_at) : new Date(start.getTime() + 14 * 864e5);
    const path = `/scheduling/v1${workspacePath(config.sarvamOrg, config.workspace)}/campaigns`;
    let sarvamCampaignId: string;
    try {
      const created = await sarvamJson<{ campaign_id: string; status: string }>(path, {
        method: "POST",
        body: {
          name: campaign.name.slice(0, 100),
          description: `Yulabs CRM campaign ${campaign.id}`.slice(0, 150),
          start_timestamp: start.toISOString(),
          end_timestamp: end.toISOString(),
          allowed_schedule: {
            allowed_start_time: campaign.allowed_start_time,
            allowed_end_time: campaign.allowed_end_time,
            allowed_days: campaign.allowed_days,
            timezone: campaign.timezone,
          },
          app_config: {
            // Sarvam picks the app_config schema from this discriminator; without it the request is rejected (422).
            app_type: "agent",
            app_id: appId,
            app_version: agent.sarvam_app_version,
            attempts_per_second: Number(campaign.attempts_per_second),
            // Shape matches what Sarvam stores for working campaigns (GET campaign → app_config).
            connection_configs: [{ connection_id: connectionId, phone_numbers: [agentPhone], weight: 1 }],
            phone_rotation: { agent: false },
            retry_config: {
              max_retries: campaign.max_retries,
              retry_interval_minutes: Array.from({ length: Math.max(1, campaign.max_retries) }, () => campaign.retry_interval_minutes),
              retry_on: {
                busy: { enabled: true },
                no_answer: { enabled: true },
                failed: { enabled: true },
                provider_error: { enabled: true, max_retries: 1, retry_interval_minutes: 5 },
                internal_error: { enabled: true, max_retries: 1, retry_interval_minutes: 5 },
              },
            },
            webhook_config: {
              url: `${base}/api/public/sarvam-campaign-webhook?c=${campaign.id}&t=${token}`,
              metadata: { crm_campaign_id: campaign.id },
            },
          },
        },
      });
      sarvamCampaignId = created.campaign_id;
    } catch (error) {
      await client.from("call_campaigns").update({ status: "failed", last_error: message(error) }).eq("id", campaign.id);
      throw new Error(message(error));
    }

    await client.from("call_campaigns").update({
      sarvam_campaign_id: sarvamCampaignId, webhook_token_hash: await hashCallbackToken(token), status: "launching",
      target_count: callable.length, launched_at: new Date().toISOString(), starts_at: start.toISOString(), ends_at: end.toISOString(), last_error: null,
    }).eq("id", campaign.id);

    // 3. Stream contacts as cohorts.
    const variables = (campaign.agent_variables ?? {}) as VariableMap;
    const cohortIds: string[] = [];
    const errors: string[] = [];
    const parts = chunk(callable, 1000);
    for (const [index, part] of parts.entries()) {
      try {
        const cohort = await sarvamJson<{ cohort_id: string }>(`${path}/${encodeURIComponent(sarvamCampaignId)}/cohorts/stream`, {
          method: "POST",
          body: {
            name: cohortName(campaign.name, index + 1),
            users: part.map((contact) => {
              // Personalised opening line per contact (Sarvam supports initial_bot_message as a per-user override).
              const greeting = fillGreeting(agent.greeting, greetingValues(contact));
              return {
                user_phone_number: contact.phone,
                user_identifier: targetIds.get(contact.id),
                ...(Object.keys(variables).length ? { app_variables: resolveVariables(contact, variables) } : {}),
                ...(greeting ? { app_overrides: { initial_bot_message: greeting } } : {}),
              };
            }),
          },
        });
        cohortIds.push(cohort.cohort_id);
        await client.from("campaign_targets").update({ status: "queued", updated_at: new Date().toISOString() })
          .eq("campaign_id", campaign.id).in("id", part.map((contact) => targetIds.get(contact.id)!));
      } catch (error) {
        errors.push(`Part ${index + 1}: ${message(error)}`);
        if (index === 0) break; // the first batch failing (e.g. unknown agent variable) will fail for every batch
      }
    }

    const failedAll = cohortIds.length === 0;
    await client.from("call_campaigns").update({
      status: failedAll ? "failed" : start > new Date(Date.now() + 10 * 60_000) ? "scheduled" : "running",
      sarvam_cohort_ids: cohortIds,
      last_error: errors.length ? errors.join(" · ").slice(0, 2000) : null,
    }).eq("id", campaign.id);
    if (failedAll) {
      await sarvamJson(`${path}/${encodeURIComponent(sarvamCampaignId)}/status`, { method: "PUT", body: { action: "cancel" } }).catch(() => null);
      throw new Error(errors[0] ?? "Sarvam did not accept the contact list");
    }
    return { sarvamCampaignId, contacts: callable.length, cohorts: cohortIds.length, errors };
}
