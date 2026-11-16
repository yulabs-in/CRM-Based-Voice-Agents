export const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Since yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "prev", label: "Since last month" },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

export function rangeStart(k: RangeKey, now = new Date()): Date {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  switch (k) {
    case "today": return d;
    case "yesterday": d.setDate(d.getDate() - 1); return d;
    case "7d": d.setDate(d.getDate() - 6); return d;
    case "30d": d.setDate(d.getDate() - 29); return d;
    case "month": d.setDate(1); return d;
    case "prev": d.setDate(1); d.setMonth(d.getMonth() - 1); return d;
  }
}
