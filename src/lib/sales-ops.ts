// Shared, pure helpers for sales orders, payments, renewals and the sales hierarchy.
// Used by the pages and the reports; covered by src/test/sales-ops.test.ts.

export type OrderStatus = "draft" | "confirmed" | "issued" | "cancelled";
export type PaymentState = "paid" | "partial" | "overdue" | "pending" | "not_set" | "cancelled";

export type OrderLike = {
  id: string;
  status: string;
  premium_amount: number | string | null;
  amount_paid: number | string | null;
  payment_due_date?: string | null;
  policy_end_date?: string | null;
  renewed_from_order_id?: string | null;
  owner_id?: string | null;
  created_at?: string;
};

export type PaymentLike = { amount: number | string; status: string; paid_on: string; mode?: string };
export type MemberLike = { user_id: string; role: string; reports_to: string | null };

const num = (value: unknown) => Number(value ?? 0) || 0;
const day = (value: string | Date) => {
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  return d.getTime();
};
const DAY = 86_400_000;

export const PRODUCT_TYPES = [
  { value: "health", label: "Health" },
  { value: "family_floater", label: "Family floater" },
  { value: "term", label: "Term life" },
  { value: "motor", label: "Motor" },
  { value: "other", label: "Other" },
];
export const ORDER_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "issued", label: "Policy issued" },
  { value: "cancelled", label: "Cancelled" },
];
export const PAYMENT_FREQUENCIES = [
  { value: "yearly", label: "Yearly" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "monthly", label: "Monthly" },
  { value: "single", label: "One time" },
];
export const PAYMENT_MODES = [
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "netbanking", label: "Net banking" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];
export const KYC_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "collected", label: "Collected" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

export const labelOf = (list: { value: string; label: string }[], value: unknown) =>
  list.find((item) => item.value === value)?.label ?? String(value ?? "—").replace(/_/g, " ");

export const balanceDue = (order: OrderLike) => Math.max(0, num(order.premium_amount) - num(order.amount_paid));

/** Where an order stands on payment, as of `today`. */
export function paymentState(order: OrderLike, today: Date = new Date()): PaymentState {
  if (order.status === "cancelled") return "cancelled";
  const premium = num(order.premium_amount);
  const paid = num(order.amount_paid);
  if (premium <= 0) return "not_set";
  if (paid >= premium) return "paid";
  if (order.payment_due_date && day(order.payment_due_date) < day(today)) return "overdue";
  return paid > 0 ? "partial" : "pending";
}

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  paid: "Paid", partial: "Partly paid", overdue: "Overdue", pending: "Pending", not_set: "Premium not set", cancelled: "Cancelled",
};

/** Days until the policy ends (negative once it has lapsed). Null without an end date. */
export function daysToRenewal(order: OrderLike, today: Date = new Date()): number | null {
  if (!order.policy_end_date) return null;
  return Math.round((day(order.policy_end_date) - day(today)) / DAY);
}

export type RenewalWindow = "overdue" | "week" | "month" | "quarter" | "later" | "none";
export function renewalWindow(days: number | null): RenewalWindow {
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  if (days <= 90) return "quarter";
  return "later";
}
export const RENEWAL_WINDOW_LABEL: Record<RenewalWindow, string> = {
  overdue: "Lapsed", week: "Due this week", month: "Due in 30 days", quarter: "Due in 90 days", later: "Later", none: "No end date",
};

/** Issued policies that still need renewing (no non-cancelled order renews them yet). */
export function renewalsDue<T extends OrderLike>(orders: T[]): T[] {
  const renewed = new Set(orders.filter((o) => o.renewed_from_order_id && o.status !== "cancelled").map((o) => o.renewed_from_order_id));
  return orders.filter((o) => o.status === "issued" && o.policy_end_date && !renewed.has(o.id));
}

/** The user plus everyone who reports to them, directly or further down. */
export function teamOf(members: MemberLike[], userId: string): Set<string> {
  const reports = new Map<string, string[]>();
  for (const m of members) if (m.reports_to) reports.set(m.reports_to, [...(reports.get(m.reports_to) ?? []), m.user_id]);
  const team = new Set<string>([userId]);
  const queue = [userId];
  while (queue.length) {
    for (const child of reports.get(queue.shift()!) ?? []) {
      if (!team.has(child)) { team.add(child); queue.push(child); }
    }
  }
  return team;
}

/** Members in tree order with their depth: managers first, their team leads under them, reps under those. */
export function hierarchyRows<T extends MemberLike>(members: T[]): Array<T & { depth: number }> {
  const ids = new Set(members.map((m) => m.user_id));
  const children = new Map<string | null, T[]>();
  for (const m of members) {
    const parent = m.reports_to && ids.has(m.reports_to) ? m.reports_to : null;
    children.set(parent, [...(children.get(parent) ?? []), m]);
  }
  const out: Array<T & { depth: number }> = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const m of children.get(parent) ?? []) {
      if (seen.has(m.user_id)) continue;
      seen.add(m.user_id);
      out.push({ ...m, depth });
      walk(m.user_id, depth + 1);
    }
  };
  walk(null, 0);
  for (const m of members) if (!seen.has(m.user_id)) out.push({ ...m, depth: 0 }); // safety net for bad data
  return out;
}

/** Who a member may report to: anyone else who isn't in their own team (that would make a loop). */
export function managerOptions<T extends MemberLike>(members: T[], userId: string): T[] {
  const team = teamOf(members, userId);
  return members.filter((m) => !team.has(m.user_id));
}

export type PaymentSummary = { collected: number; outstanding: number; overdue: number; overdueCount: number; partialCount: number; paidCount: number };

/** Headline numbers for the payments dashboard. `collected` only counts payments inside the range. */
export function paymentSummary(orders: OrderLike[], payments: PaymentLike[], since: Date | null, today: Date = new Date()): PaymentSummary {
  const live = orders.filter((o) => o.status !== "cancelled" && o.status !== "draft");
  const states = live.map((o) => ({ o, state: paymentState(o, today) }));
  const inRange = (p: PaymentLike) => !since || day(p.paid_on) >= day(since);
  const collected = payments.filter(inRange).reduce((sum, p) => sum + (p.status === "received" ? num(p.amount) : p.status === "refunded" ? -num(p.amount) : 0), 0);
  return {
    collected,
    outstanding: states.reduce((sum, { o }) => sum + balanceDue(o), 0),
    overdue: states.filter((s) => s.state === "overdue").reduce((sum, { o }) => sum + balanceDue(o), 0),
    overdueCount: states.filter((s) => s.state === "overdue").length,
    partialCount: states.filter((s) => s.state === "partial").length,
    paidCount: states.filter((s) => s.state === "paid").length,
  };
}

/** Sums a value per key, largest first — the shape the chart components expect. */
export function groupSum<T>(rows: T[], key: (row: T) => string, value: (row: T) => number = () => 1) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const k = key(row) || "Unknown";
    totals.set(k, (totals.get(k) ?? 0) + value(row));
  }
  return [...totals.entries()].map(([name, v]) => ({ name, value: v })).sort((a, b) => b.value - a.value);
}

/** Last N months (oldest first) as YYYY-MM keys with a label, for trend charts. */
export function lastMonths(count: number, today: Date = new Date()): { key: string; label: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (count - 1 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "short" }) };
  });
}

export type LeaderRow<T extends MemberLike> = T & {
  depth: number;
  own: { orders: number; issued: number; premium: number; collected: number };
  team: { orders: number; issued: number; premium: number; collected: number; size: number };
};

/**
 * Per-person sales numbers in hierarchy order, each with their own figures and their whole team's roll-up
 * (a manager's "team" includes their team leads' reps). Cancelled orders don't count.
 */
export function leaderboard<T extends MemberLike>(
  members: T[],
  orders: Array<OrderLike & { owner_id?: string | null }>,
  payments: Array<PaymentLike & { sales_order_id: string }>,
): LeaderRow<T>[] {
  const live = orders.filter((o) => o.status !== "cancelled");
  const ownerOf = new Map(live.map((o) => [o.id, o.owner_id ?? null]));
  const own = new Map<string, { orders: number; issued: number; premium: number; collected: number }>();
  const bucket = (id: string) => own.get(id) ?? own.set(id, { orders: 0, issued: 0, premium: 0, collected: 0 }).get(id)!;
  for (const o of live) {
    if (!o.owner_id) continue;
    const b = bucket(o.owner_id);
    b.orders += 1;
    if (o.status === "issued") b.issued += 1;
    b.premium += num(o.premium_amount);
  }
  for (const p of payments) {
    const owner = ownerOf.get(p.sales_order_id);
    if (!owner) continue;
    bucket(owner).collected += p.status === "received" ? num(p.amount) : p.status === "refunded" ? -num(p.amount) : 0;
  }
  const zero = { orders: 0, issued: 0, premium: 0, collected: 0 };
  return hierarchyRows(members).map((m) => {
    const team = teamOf(members, m.user_id);
    const totals = { ...zero, size: team.size };
    for (const id of team) {
      const b = own.get(id);
      if (!b) continue;
      totals.orders += b.orders; totals.issued += b.issued; totals.premium += b.premium; totals.collected += b.collected;
    }
    return { ...m, own: own.get(m.user_id) ?? { ...zero }, team: totals };
  });
}
