import type { AppClient } from "@/lib/supabase";
import {
  computeBudgetStatus,
  currentIstMonth,
  DEFAULT_USAGE_SETTINGS,
  estimateCost,
  istMonthRange,
  minutesForSummaryRow,
  type BudgetStatus,
  type UsageRounding,
  type UsageSettings,
  type UsageSummaryRow,
} from "@/lib/usage";

export function normalizeUsageSettings(row: {
  cost_per_minute?: number | string | null;
  cost_per_attempt?: number | string | null;
  currency?: string | null;
  monthly_budget?: number | string | null;
  hard_stop?: boolean | null;
  rounding?: string | null;
} | null): UsageSettings {
  if (!row) return { ...DEFAULT_USAGE_SETTINGS };
  return {
    cost_per_minute: Number(row.cost_per_minute ?? 0) || 0,
    cost_per_attempt: Number(row.cost_per_attempt ?? 0) || 0,
    currency: row.currency || "INR",
    monthly_budget: row.monthly_budget != null ? Number(row.monthly_budget) : null,
    hard_stop: Boolean(row.hard_stop),
    rounding: (row.rounding === "exact" ? "exact" : "per_call_minute") as UsageRounding,
  };
}

export async function loadUsageSettings(client: AppClient, organizationId: string): Promise<UsageSettings> {
  const { data, error } = await client
    .from("usage_settings")
    .select("cost_per_minute, cost_per_attempt, currency, monthly_budget, hard_stop, rounding")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeUsageSettings(data);
}

export async function loadUsageSummary(
  client: AppClient,
  organizationId: string,
  fromIso: string,
  toIso: string
): Promise<UsageSummaryRow[]> {
  const { data, error } = await client.rpc("usage_summary", {
    org: organizationId,
    from_ts: fromIso,
    to_ts: toIso,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    day: String(row.day),
    agent_id: row.agent_id ?? null,
    campaign_id: row.campaign_id ?? null,
    attempts: Number(row.attempts ?? 0),
    connected: Number(row.connected ?? 0),
    seconds: Number(row.seconds ?? 0),
    billable_minutes: Number(row.billable_minutes ?? 0),
  }));
}

/**
 * Computes current IST month spend vs configured monthly budget.
 * Returns `level: "ok"` when no budget is configured.
 */
export async function getBudgetStatus(
  client: AppClient,
  organizationId: string,
  now = new Date()
): Promise<BudgetStatus> {
  const settings = await loadUsageSettings(client, organizationId);
  if (settings.monthly_budget == null || settings.monthly_budget <= 0) {
    return computeBudgetStatus(0, null, settings.hard_stop);
  }

  const { fromIso, toIso } = istMonthRange(currentIstMonth(now));
  const rows = await loadUsageSummary(client, organizationId, fromIso, toIso);

  const totals = rows.reduce(
    (acc, row) => {
      acc.minutes += minutesForSummaryRow(row, settings.rounding);
      acc.attempts += row.attempts;
      return acc;
    },
    { minutes: 0, attempts: 0 }
  );

  const spent = estimateCost({
    minutes: totals.minutes,
    attempts: totals.attempts,
    costPerMinute: settings.cost_per_minute,
    costPerAttempt: settings.cost_per_attempt,
  });

  return computeBudgetStatus(spent, settings.monthly_budget, settings.hard_stop);
}
