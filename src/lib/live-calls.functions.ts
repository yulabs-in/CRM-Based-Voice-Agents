// Stop controls for the Live Calls page.
// Sarvam's API has no "hang up this call" endpoint, so a stop does everything that *is* possible:
// cancel the Sarvam campaign the call belongs to (no new dials, no retries) and close the call in the CRM.
// A call already connected ends on its own (the agent's max call length / end_interaction).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { asApp, type Database } from "@/lib/supabase";

const STOP_ROLES = ["owner", "admin", "sales_manager", "voice_manager", "sales_rep", "support_agent"];
const ACTIVE_CAMPAIGN = ["launching", "scheduled", "running", "paused"];
const OPEN_TARGETS = ["pending", "queued", "calling", "retrying"];

async function requireStopRole(context: { supabase: unknown; userId: string }, organizationId: string) {
  const { data } = await asApp(context.supabase).from("memberships").select("role").eq("organization_id", organizationId).eq("user_id", context.userId).maybeSingle();
  if (!data || !STOP_ROLES.includes(data.role)) throw new Error("You don't have permission to stop calls");
}

async function cancelSarvamCampaign(supabase: SupabaseClient<Database>, campaign: { id: string; organization_id: string; sarvam_campaign_id: string | null }) {
  const now = new Date().toISOString();
  if (campaign.sarvam_campaign_id) {
    const { sarvamJson, workspacePath, getOrgSarvamConfig } = await import("@/lib/sarvam.server");
    const config = await getOrgSarvamConfig(campaign.organization_id);
    await sarvamJson(`/scheduling/v1${workspacePath(config.sarvamOrg, config.workspace)}/campaigns/${encodeURIComponent(campaign.sarvam_campaign_id)}/status`, {
      method: "PUT", body: { action: "cancel" },
    });
  }
  await supabase.from("call_campaigns").update({ status: "cancelled", updated_at: now }).eq("id", campaign.id);
  await supabase.from("campaign_targets").update({ status: "excluded", updated_at: now }).eq("campaign_id", campaign.id).in("status", OPEN_TARGETS);
}

const closeCall = (supabase: SupabaseClient<Database>, ids: string[]) =>
  ids.length
    ? supabase.from("calls").update({ status: "cancelled", sarvam_status: "stopped", sarvam_failure_reason: "Stopped from Live Calls", updated_at: new Date().toISOString() }).in("id", ids)
    : Promise.resolve();

/** Stops one call: its campaign (if any) is cancelled on Sarvam so nothing else dials, and the call is closed here. */
export const stopCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ callId: z.string().uuid(), stopCampaign: z.boolean().default(false) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: call, error } = await asApp(context.supabase).from("calls").select("id, organization_id, campaign_id, contact_id, status").eq("id", data.callId).maybeSingle();
    if (error || !call) throw new Error("Call not found");
    await requireStopRole(context, call.organization_id);
    let campaignCancelled = false;
    if (call.campaign_id) {
      if (data.stopCampaign) {
        const { data: campaign } = await asApp(context.supabase).from("call_campaigns").select("id, organization_id, sarvam_campaign_id, status").eq("id", call.campaign_id).maybeSingle();
        if (campaign && ACTIVE_CAMPAIGN.includes(campaign.status)) {
          try {
            await cancelSarvamCampaign(asApp(context.supabase), campaign);
            campaignCancelled = true;
          } catch (cause) {
            throw new Error(cause instanceof Error ? cause.message : "Sarvam did not cancel the campaign");
          }
        }
      } else if (call.contact_id) {
        // Don't retry this person in the campaign.
        await asApp(context.supabase).from("campaign_targets").update({ status: "excluded", updated_at: new Date().toISOString() })
          .eq("campaign_id", call.campaign_id).eq("contact_id", call.contact_id).in("status", OPEN_TARGETS);
      }
    }
    await closeCall(asApp(context.supabase), [call.id]);
    return { campaignCancelled };
  });

/** Emergency stop: cancels every active campaign on Sarvam and closes every open call in this workspace. */
export const stopAllCalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireStopRole(context, data.organizationId);
    const { data: campaigns } = await asApp(context.supabase).from("call_campaigns").select("id, organization_id, sarvam_campaign_id, status")
      .eq("organization_id", data.organizationId).in("status", ACTIVE_CAMPAIGN);
    const errors: string[] = [];
    let cancelled = 0;
    for (const campaign of campaigns ?? []) {
      try {
        await cancelSarvamCampaign(asApp(context.supabase), campaign);
        cancelled += 1;
      } catch (cause) {
        errors.push(cause instanceof Error ? cause.message : "Sarvam did not cancel a campaign");
      }
    }
    const { data: open } = await asApp(context.supabase).from("calls").select("id").eq("organization_id", data.organizationId).in("status", ["queued", "in_progress"]);
    const ids = (open ?? []).map((row) => row.id);
    await closeCall(asApp(context.supabase), ids);
    return { campaignsCancelled: cancelled, callsClosed: ids.length, errors };
  });
