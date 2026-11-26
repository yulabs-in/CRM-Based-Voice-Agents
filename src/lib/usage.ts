export type UsageRounding = "per_call_minute" | "exact";

export interface UsageSettings {
  cost_per_minute: number;
  cost_per_attempt: number;
  currency: string;
  monthly_budget: number | null;
  hard_stop: boolean;
  rounding: UsageRounding;
}

export const DEFAULT_USAGE_SETTINGS: UsageSettings = {
  cost_per_minute: 0,
  cost_per_attempt: 0,
  currency: "INR",
  monthly_budget: null,
  hard_stop: false,
  rounding: "per_call_minute",
};

export interface UsageSummaryRow {
  day: string;
  agent_id: string | null;
  campaign_id: string | null;
  attempts: number;
  connected: number;
  seconds: number;
  billable_minutes: number;
}

export type BudgetLevel = "ok" | "warning" | "exceeded";

export interface BudgetStatus {
  spent: number;
  budget: number | null;
  percent: number;
  level: BudgetLevel;
  hardStop: boolean;
}

export interface UsageCsvRow {
  date: string;
  agent: string;
  campaign: string;
  attempts: number;
  connected: number;
  minutes: number;
  estimated_cost_inr: number;
}

export const BUDGET_EXCEEDED_MESSAGE =
  "Monthly calling budget reached. Raise the budget in Settings → Usage to launch new campaigns.";

/** Roles allowed to view cost/billing figures until #16 permissions.ts lands. */
const BILLING_VIEW_ROLES = new Set(["owner", "admin", "sales_manager"]);

export function canViewBilling(role: string): boolean {
  return BILLING_VIEW_ROLES.has(role);
}

/**
 * Computes billable minutes for a single call duration in seconds.
 * In `per_call_minute` mode, any positive duration rounds up to the next whole minute.
 */
export function billableMinutes(durationSeconds: number, rounding: UsageRounding = "per_call_minute"): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  if (rounding === "exact") return durationSeconds / 60;
  return Math.ceil(durationSeconds / 60);
}

/** Returns minutes for an aggregated usage_summary row under the chosen rounding mode. */
export function minutesForSummaryRow(
  row: Pick<UsageSummaryRow, "seconds" | "billable_minutes">,
  rounding: UsageRounding
): number {
  return rounding === "exact" ? row.seconds / 60 : row.billable_minutes;
}

/** Estimates INR cost from minutes and call attempts, rounded to 2 decimal places. */
export function estimateCost({
  minutes,
  attempts,
  costPerMinute,
  costPerAttempt = 0,
}: {
  minutes: number;
  attempts: number;
  costPerMinute: number;
  costPerAttempt?: number;
}): number {
  const total = Math.max(0, minutes) * Math.max(0, costPerMinute) + Math.max(0, attempts) * Math.max(0, costPerAttempt);
  return Math.round(total * 100) / 100;
}

/** Classifies spend against monthly budget: ok (<80%), warning (80-99.9%), exceeded (>=100%). */
export function budgetLevel(spent: number, budget: number | null | undefined): BudgetLevel {
  if (budget == null || !Number.isFinite(budget) || budget <= 0) return "ok";
  const pct = (spent / budget) * 100;
  if (pct >= 100) return "exceeded";
  if (pct >= 80) return "warning";
  return "ok";
}

export function computeBudgetStatus(
  spent: number,
  budget: number | null | undefined,
  hardStop: boolean
): BudgetStatus {
  const normalizedBudget = budget != null && Number.isFinite(budget) && budget > 0 ? budget : null;
  const percent = normalizedBudget ? Math.round((spent / normalizedBudget) * 1000) / 10 : 0;
  return {
    spent: Math.round(spent * 100) / 100,
    budget: normalizedBudget,
    percent,
    level: budgetLevel(spent, normalizedBudget),
    hardStop,
  };
}

/** Returns the current YYYY-MM string in Asia/Kolkata. */
export function currentIstMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** Converts an IST YYYY-MM month into half-open UTC ISO boundaries [fromIso, toIso). */
export function istMonthRange(yearMonth: string): { fromIso: string; toIso: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) {
    throw new Error(`Invalid YYYY-MM month: ${yearMonth}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month number in: ${yearMonth}`);
  }
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const fromDate = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:30`);
  const toDate = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+05:30`);
  return { fromIso: fromDate.toISOString(), toIso: toDate.toISOString() };
}

/** Converts inclusive IST YYYY-MM-DD dates into half-open UTC ISO boundaries [fromIso, toIso). */
export function istDateRange(fromDay: string, toDay: string): { fromIso: string; toIso: string } {
  const fromDate = new Date(`${fromDay}T00:00:00+05:30`);
  const toStart = new Date(`${toDay}T00:00:00+05:30`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toStart.getTime())) {
    throw new Error("Invalid IST date range");
  }
  const toExclusive = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
  return { fromIso: fromDate.toISOString(), toIso: toExclusive.toISOString() };
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatInr(amount: number): string {
  return inrFormatter.format(Number.isFinite(amount) ? amount : 0);
}

export function formatDurationMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? "");
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Serializes usage rows to UTF-8 CSV with a BOM so Excel opens the ₹ symbol cleanly.
 */
export function toCsv(rows: UsageCsvRow[]): string {
  const header = "date,agent,campaign,attempts,connected,minutes,estimated_cost_inr";
  const lines = rows.map((row) =>
    [
      escapeCsvCell(row.date),
      escapeCsvCell(row.agent),
      escapeCsvCell(row.campaign),
      escapeCsvCell(row.attempts),
      escapeCsvCell(row.connected),
      escapeCsvCell(Math.round(row.minutes * 100) / 100),
      escapeCsvCell(Math.round(row.estimated_cost_inr * 100) / 100),
    ].join(",")
  );
  return `\uFEFF${[header, ...lines].join("\n")}`;
}
