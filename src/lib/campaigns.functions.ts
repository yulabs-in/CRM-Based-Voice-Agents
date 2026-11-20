import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hashCallbackToken, makeCallbackToken } from "@/lib/sarvam-auth.server";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import { SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";
import { chunk, cohortName, fillGreeting, greetingValues, mapSarvamCampaignStatus, resolveVariables, type CohortContact, type VariableMap } from "@/lib/campaign-vars";

const CAMPAIGN_ROLES = ["owner", "admin", "sales_manager", "voice_manager"];

async function requireCampaignRole(context: { supabase: SupabaseClient<Database>; userId: string }, organizationId: string) {
  const { data } = await context.supabase.from("memberships").select("role").eq("organization_id", organizationId).eq("user_id", context.userId).maybeSingle();
  if (!data || !CAMPAIGN_ROLES.includes(data.role)) throw new Error("Only owners, admins, sales managers and voice managers can run campaigns");
}

async function loadCampaign(context: { supabase: SupabaseClient<Database> }, campaignId: string) {
  const { data, error } = await context.supabase.from("call_campaigns").select("*").eq("id", campaignId).maybeSingle();
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
export const launchCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const campaign = await loadCampaign(context, data.campaignId);
    await requireCampaignRole(context, campaign.organization_id);
    const { runCampaignLaunch } = await import("@/lib/campaigns.server");
    return runCampaignLaunch(context.supabase, data.campaignId, new URL(getRequest().url).origin);
  });

export const setCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid(), action: z.enum(["pause", "resume", "cancel"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { sarvamJson, workspacePath, getOrgSarvamConfig } = await import("@/lib/sarvam.server");
    const campaign = await loadCampaign(context, data.campaignId);
    await requireCampaignRole(context, campaign.organization_id);
    if (!campaign.sarvam_campaign_id) throw new Error("This campaign has not been launched");
    try {
      const config = await getOrgSarvamConfig(campaign.organization_id);
      const result = await sarvamJson<{ status: string }>(`/scheduling/v1${workspacePath(config.sarvamOrg, config.workspace)}/campaigns/${encodeURIComponent(campaign.sarvam_campaign_id)}/status`, {
        method: "PUT", body: { action: data.action },
      });
      const status = data.action === "cancel" ? "cancelled" : data.action === "pause" ? "paused" : mapSarvamCampaignStatus(result.status === "paused" ? "active" : result.status);
      await context.supabase.from("call_campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", campaign.id);
      if (data.action === "cancel") {
        await context.supabase.from("campaign_targets").update({ status: "excluded", updated_at: new Date().toISOString() })
          .eq("campaign_id", campaign.id).in("status", ["pending", "queued", "retrying"]);
      }
      return { status };
    } catch (error) {
      throw new Error(message(error));
    }
  });

/** Pulls the campaign's current status from Sarvam (e.g. 'ended' after the schedule window closes). */
export const syncCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { sarvamJson, workspacePath, getOrgSarvamConfig } = await import("@/lib/sarvam.server");
    const campaign = await loadCampaign(context, data.campaignId);
    if (!campaign.sarvam_campaign_id) return { status: campaign.status };
    try {
      const config = await getOrgSarvamConfig(campaign.organization_id);
      const remote = await sarvamJson<{ status: string }>(`/scheduling/v1${workspacePath(config.sarvamOrg, config.workspace)}/campaigns/${encodeURIComponent(campaign.sarvam_campaign_id)}`);
      const status = mapSarvamCampaignStatus(remote.status);
      if (status !== campaign.status && !["failed"].includes(campaign.status)) {
        await context.supabase.from("call_campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", campaign.id);
      }
      return { status };
    } catch (error) {
      throw new Error(message(error));
    }
  });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/**
 * Changes a launched campaign's calling hours on Sarvam. Sarvam only allows edits while a campaign is
 * paused or scheduled, so an active campaign is paused, updated, then resumed.
 */
export const updateCampaignSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    campaignId: z.string().uuid(),
    allowedStartTime: z.string().regex(HHMM),
    allowedEndTime: z.string().regex(HHMM),
    allowedDays: z.array(z.enum(DAY_NAMES)).min(1),
    timezone: z.string().trim().min(1).max(60),
  }).refine((value) => value.allowedStartTime < value.allowedEndTime, "Start time must be before end time").parse(input))
  .handler(async ({ data, context }) => {
    const { sarvamJson, workspacePath, getOrgSarvamConfig } = await import("@/lib/sarvam.server");
    const campaign = await loadCampaign(context, data.campaignId);
    await requireCampaignRole(context, campaign.organization_id);
    const schedule = { allowed_start_time: data.allowedStartTime, allowed_end_time: data.allowedEndTime, allowed_days: data.allowedDays, timezone: data.timezone };
    const local = { allowed_start_time: data.allowedStartTime, allowed_end_time: data.allowedEndTime, allowed_days: data.allowedDays, timezone: data.timezone, updated_at: new Date().toISOString() };

    if (!campaign.sarvam_campaign_id) {
      await context.supabase.from("call_campaigns").update(local).eq("id", campaign.id);
      return { status: campaign.status, resumed: false };
    }
    if (["completed", "cancelled"].includes(campaign.status)) throw new Error(`This campaign is ${campaign.status}; create a new one instead`);
    try {
      const config = await getOrgSarvamConfig(campaign.organization_id);
      const base = `/scheduling/v1${workspacePath(config.sarvamOrg, config.workspace)}/campaigns/${encodeURIComponent(campaign.sarvam_campaign_id)}`;
      const remote = await sarvamJson<{ status: string }>(base);
      const wasActive = remote.status === "active";
      if (wasActive) await sarvamJson(`${base}/status`, { method: "PUT", body: { action: "pause" } });
      try {
        await sarvamJson(base, { method: "PATCH", body: { allowed_schedule: schedule } });
      } finally {
        if (wasActive) await sarvamJson(`${base}/status`, { method: "PUT", body: { action: "resume" } });
      }
      await context.supabase.from("call_campaigns").update({ ...local, last_error: null }).eq("id", campaign.id);
      return { status: wasActive ? "running" : mapSarvamCampaignStatus(remote.status), resumed: wasActive };
    } catch (error) {
      throw new Error(message(error));
    }
  });
