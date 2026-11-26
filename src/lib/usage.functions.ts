import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { asApp, type AppClient } from "@/lib/supabase";
import {
  canViewBilling,
  computeBudgetStatus,
  currentIstMonth,
  estimateCost,
  istMonthRange,
  minutesForSummaryRow,
  type BudgetStatus,
  type UsageSettings,
  type UsageSummaryRow,
} from "@/lib/usage";

async function getMemberRole(client: AppClient, organizationId: string, userId: string): Promise<string> {
  const { data, error } = await client
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("Not a member of this workspace");
  return data.role;
}

export const getUsageSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ settings: UsageSettings; canSeeCosts: boolean }> => {
    const client = asApp(context.supabase);
    const role = await getMemberRole(client, data.organizationId, context.userId);
    const { loadUsageSettings } = await import("@/lib/usage.server");
    const settings = await loadUsageSettings(client, data.organizationId);
    const canSeeCosts = canViewBilling(role);
    if (!canSeeCosts) {
      return {
        canSeeCosts,
        settings: {
          ...settings,
          cost_per_minute: 0,
          cost_per_attempt: 0,
          monthly_budget: null,
        },
      };
    }
    return { settings, canSeeCosts };
  });

const updateSchema = z.object({
  organizationId: z.string().uuid(),
  cost_per_minute: z.number().min(0).max(10000),
  cost_per_attempt: z.number().min(0).max(10000),
  monthly_budget: z.number().min(0).max(100_000_000).nullable(),
  hard_stop: z.boolean(),
  rounding: z.enum(["per_call_minute", "exact"]),
});

export const updateUsageSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }): Promise<UsageSettings> => {
    const client = asApp(context.supabase);
    const role = await getMemberRole(client, data.organizationId, context.userId);
    if (!["owner", "admin"].includes(role)) {
      throw new Error("Only workspace owners and admins can update usage settings");
    }

    const { error } = await client.from("usage_settings").upsert(
      {
        organization_id: data.organizationId,
        cost_per_minute: data.cost_per_minute,
        cost_per_attempt: data.cost_per_attempt,
        currency: "INR",
        monthly_budget: data.monthly_budget,
        hard_stop: data.hard_stop,
        rounding: data.rounding,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    );
    if (error) throw new Error(error.message);

    const { loadUsageSettings } = await import("@/lib/usage.server");
    return loadUsageSettings(client, data.organizationId);
  });

export interface UsageDashboardData {
  rows: UsageSummaryRow[];
  settings: UsageSettings;
  canSeeCosts: boolean;
  budgetStatus: BudgetStatus;
  agents: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
}

export const getUsageDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        fromIso: z.string().datetime(),
        toIso: z.string().datetime(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }): Promise<UsageDashboardData> => {
    const client = asApp(context.supabase);
    const role = await getMemberRole(client, data.organizationId, context.userId);
    const canSeeCosts = canViewBilling(role);

    const { loadUsageSettings, loadUsageSummary } = await import("@/lib/usage.server");
    const [settings, rows, agentsRes, campaignsRes] = await Promise.all([
      loadUsageSettings(client, data.organizationId),
      loadUsageSummary(client, data.organizationId, data.fromIso, data.toIso),
      client.from("voice_agents").select("id, name").eq("organization_id", data.organizationId),
      client.from("call_campaigns").select("id, name").eq("organization_id", data.organizationId),
    ]);

    if (agentsRes.error) throw new Error(agentsRes.error.message);
    if (campaignsRes.error) throw new Error(campaignsRes.error.message);

    // Current IST month budget status (even if user is viewing another range)
    const { fromIso: monthFrom, toIso: monthTo } = istMonthRange(currentIstMonth());
    const monthRows =
      monthFrom === data.fromIso && monthTo === data.toIso
        ? rows
        : await loadUsageSummary(client, data.organizationId, monthFrom, monthTo);

    const monthTotals = monthRows.reduce(
      (acc, r) => {
        acc.minutes += minutesForSummaryRow(r, settings.rounding);
        acc.attempts += r.attempts;
        return acc;
      },
      { minutes: 0, attempts: 0 }
    );

    const spent = canSeeCosts
      ? estimateCost({
          minutes: monthTotals.minutes,
          attempts: monthTotals.attempts,
          costPerMinute: settings.cost_per_minute,
          costPerAttempt: settings.cost_per_attempt,
        })
      : 0;

    const budgetStatus = canSeeCosts
      ? computeBudgetStatus(spent, settings.monthly_budget, settings.hard_stop)
      : { spent: 0, budget: null, percent: 0, level: "ok" as const, hardStop: settings.hard_stop };

    return {
      rows,
      settings: canSeeCosts
        ? settings
        : { ...settings, cost_per_minute: 0, cost_per_attempt: 0, monthly_budget: null },
      canSeeCosts,
      budgetStatus,
      agents: agentsRes.data ?? [],
      campaigns: campaignsRes.data ?? [],
    };
  });

export const getOrgBudgetStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organizationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<BudgetStatus> => {
    const client = asApp(context.supabase);
    const role = await getMemberRole(client, data.organizationId, context.userId);
    if (!["owner", "admin", "sales_manager", "voice_manager"].includes(role)) {
      return { spent: 0, budget: null, percent: 0, level: "ok", hardStop: false };
    }
    const { getBudgetStatus } = await import("@/lib/usage.server");
    return getBudgetStatus(client, data.organizationId);
  });
