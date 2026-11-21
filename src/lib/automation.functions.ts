import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_AGENT_VARIABLES } from "@/lib/sarvam-defaults";
import { describeCondition, rulesMatch, type Condition } from "@/lib/automation";

const CAMPAIGN_ROLES = ["owner", "admin", "sales_manager", "voice_manager"];

async function roleIn(context: { supabase: SupabaseClient<Database>; userId: string }, organizationId: string, roles: string[]) {
  const { data } = await context.supabase.from("memberships").select("role").eq("organization_id", organizationId).eq("user_id", context.userId).maybeSingle();
  return !!data && roles.includes(data.role);
}

/** After a CSV/Excel import: runs "Contacts imported" workflows for the new contacts. */
export const runImportAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid(), projectId: z.string().uuid(), contactIds: z.array(z.string().uuid()).max(50000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("can_write_org", { _org: data.organizationId });
    if (!allowed || !data.contactIds.length) return { ran: 0 };
    const { runImportAutomations: run } = await import("@/lib/automation.server");
    return run(data.organizationId, data.projectId, data.contactIds);
  });

/** Dry run: would this workflow's rules match a recent call? Nothing is changed. */
export const testWorkflowOnCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    callId: z.string().uuid(),
    conditions: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string().optional() })),
    match: z.enum(["all", "any"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: call } = await context.supabase.from("calls").select("status, sentiment, outcome, duration_seconds, answers").eq("id", data.callId).maybeSingle();
    if (!call) throw new Error("Call not found");
    const conditions = data.conditions as Condition[];
    const { conditionMatches } = await import("@/lib/automation");
    return {
      matched: rulesMatch(conditions, data.match, call),
      checks: conditions.map((condition) => ({ rule: describeCondition(condition), ok: conditionMatches(condition, call) })),
    };
  });

/** Schedules Sarvam to call chosen contacts (or a whole project) at a set time — a campaign that starts later. */
export const scheduleCalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    organizationId: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    agentId: z.string().uuid(),
    projectId: z.string().uuid().optional(),
    contactIds: z.array(z.string().uuid()).max(5000).optional(),
    startsAt: z.string().datetime(),
    allowedStartTime: z.string().regex(/^\d{2}:\d{2}$/),
    allowedEndTime: z.string().regex(/^\d{2}:\d{2}$/),
    consentConfirmed: z.literal(true),
  }).refine((value) => value.projectId || value.contactIds?.length, "Choose contacts or a project").parse(input))
  .handler(async ({ data, context }) => {
    if (!(await roleIn(context, data.organizationId, CAMPAIGN_ROLES))) throw new Error("Only owners, admins, sales managers and voice managers can schedule calls");
    const { data: campaign, error } = await context.supabase.from("call_campaigns").insert({
      organization_id: data.organizationId, name: data.name, agent_id: data.agentId, source: "scheduled", status: "draft",
      project_id: data.projectId ?? null, contact_ids: data.contactIds?.length ? data.contactIds : null,
      starts_at: data.startsAt, allowed_start_time: data.allowedStartTime, allowed_end_time: data.allowedEndTime,
      allowed_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      consent_confirmed: true, agent_variables: DEFAULT_AGENT_VARIABLES, max_retries: 1, retry_interval_minutes: 30,
    }).select("id").single();
    if (error || !campaign) throw new Error(error?.message ?? "Could not schedule the calls");
    const { runCampaignLaunch } = await import("@/lib/campaigns.server");
    try {
      const result = await runCampaignLaunch(context.supabase, campaign.id, new URL(getRequest().url).origin);
      return { campaignId: campaign.id, contacts: result.contacts };
    } catch (launchError) {
      throw new Error(launchError instanceof Error ? launchError.message : "Could not schedule on Sarvam");
    }
  });
