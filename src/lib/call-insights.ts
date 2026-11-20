// Pure aggregations for calls, campaigns, answers and projects (used by dashboards and analytics pages).
import { asAnswers, humanize } from "@/lib/sarvam-call";

export type CallRow = {
  id: string; status: string; duration_seconds: number | null; sentiment: string | null; outcome: string | null;
  campaign_id: string | null; agent_id: string | null; contact_id: string | null; started_at: string | null; created_at: string;
  answers: unknown; recording_path?: string | null;
};
export type Point = { name: string; value: number };

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
export const pctLabel = (part: number, whole: number) => (whole ? `${pct(part, whole)}%` : "—");

export function countBy<T>(rows: T[], key: (row: T) => string | null | undefined, value: (row: T) => number = () => 1): Point[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = key(row) || "Unknown";
    map.set(name, (map.get(name) ?? 0) + value(row));
  }
  return [...map.entries()].map(([name, total]) => ({ name, value: total })).sort((a, b) => b.value - a.value);
}

const when = (call: CallRow) => new Date(call.started_at ?? call.created_at);
const connected = (call: CallRow) => call.status === "completed";
const hasAnswers = (call: CallRow) => Object.keys(asAnswers(call.answers)).length > 0;

export function callKpis(calls: CallRow[]) {
  const done = calls.filter(connected);
  const talk = done.reduce((sum, call) => sum + Number(call.duration_seconds ?? 0), 0);
  return {
    total: calls.length,
    connected: done.length,
    connectRate: pctLabel(done.length, calls.length),
    avgDuration: done.length ? Math.round(talk / done.length) : 0,
    talkMinutes: Math.round(talk / 60),
    positive: calls.filter((call) => call.sentiment === "positive").length,
    answered: calls.filter(hasAnswers).length,
    recordings: calls.filter((call) => call.recording_path).length,
  };
}

/** Dialed → connected → gave answers → positive outcome. */
export function callFunnel(calls: CallRow[]): Point[] {
  const done = calls.filter(connected);
  return [
    { name: "Dialed", value: calls.length },
    { name: "Connected", value: done.length },
    { name: "Answered questions", value: done.filter(hasAnswers).length },
    { name: "Positive outcome", value: done.filter((call) => call.sentiment === "positive").length },
  ];
}

/** Daily series of calls vs connected calls over the last `days` days. */
export function callsOverTime(calls: CallRow[], days = 30): Array<{ day: string; calls: number; connected: number }> {
  const buckets = new Map<string, { calls: number; connected: number }>();
  for (const call of calls) {
    const key = when(call).toDateString();
    const bucket = buckets.get(key) ?? { calls: 0, connected: 0 };
    bucket.calls += 1;
    if (connected(call)) bucket.connected += 1;
    buckets.set(key, bucket);
  }
  return Array.from({ length: days }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (days - 1 - index));
    const bucket = buckets.get(day.toDateString()) ?? { calls: 0, connected: 0 };
    return { day: day.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), ...bucket };
  });
}

/** Connect rate by hour of day (local time) — when do people pick up? */
export function bestHours(calls: CallRow[]): Array<{ name: string; calls: number; connected: number; rate: number }> {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, calls: 0, connected: 0 }));
  for (const call of calls) {
    const slot = hours[when(call).getHours()]!;
    slot.calls += 1;
    if (connected(call)) slot.connected += 1;
  }
  return hours.filter((slot) => slot.calls > 0).map((slot) => ({
    name: `${String(slot.hour).padStart(2, "0")}:00`, calls: slot.calls, connected: slot.connected, rate: pct(slot.connected, slot.calls),
  }));
}

/** Every answer key the agents captured, with the distribution of values for each (top values only). */
export function answerBreakdown(calls: CallRow[], maxKeys = 6, maxValues = 8): Array<{ key: string; label: string; total: number; values: Point[] }> {
  const perKey = new Map<string, Map<string, number>>();
  for (const call of calls) {
    for (const [key, raw] of Object.entries(asAnswers(call.answers))) {
      const value = raw.trim().slice(0, 40) || "(blank)";
      const values = perKey.get(key) ?? new Map<string, number>();
      values.set(value, (values.get(value) ?? 0) + 1);
      perKey.set(key, values);
    }
  }
  return [...perKey.entries()]
    .map(([key, values]) => {
      const points = [...values.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
      const top = points.slice(0, maxValues);
      const rest = points.slice(maxValues).reduce((sum, point) => sum + point.value, 0);
      return { key, label: humanize(key), total: points.reduce((sum, point) => sum + point.value, 0), values: rest ? [...top, { name: "Other", value: rest }] : top };
    })
    // Low-cardinality keys (yes/no, disposition) are the useful ones to chart.
    .filter((entry) => entry.values.length > 1 || entry.total > 1)
    .sort((a, b) => b.total - a.total)
    .slice(0, maxKeys);
}

export function byAgent(calls: CallRow[], agentNames: Map<string, string>) {
  const groups = new Map<string, CallRow[]>();
  for (const call of calls) {
    const key = call.agent_id ?? "none";
    groups.set(key, [...(groups.get(key) ?? []), call]);
  }
  return [...groups.entries()].map(([id, rows]) => {
    const kpi = callKpis(rows);
    return { name: agentNames.get(id) ?? "No agent", calls: kpi.total, connected: kpi.connected, rate: pct(kpi.connected, kpi.total), avgDuration: kpi.avgDuration, positive: kpi.positive };
  }).sort((a, b) => b.calls - a.calls);
}

export type CampaignRow = { id: string; name: string; status: string; project_id: string | null; target_count: number };
export type TargetRow = { campaign_id: string; status: string };

export function campaignComparison(campaigns: CampaignRow[], targets: TargetRow[], calls: CallRow[]) {
  return campaigns.map((campaign) => {
    const own = targets.filter((target) => target.campaign_id === campaign.id);
    const ownCalls = calls.filter((call) => call.campaign_id === campaign.id);
    const finished = own.filter((target) => !["pending", "queued", "calling", "retrying"].includes(target.status)).length;
    const kpi = callKpis(ownCalls);
    return {
      id: campaign.id, name: campaign.name, status: campaign.status,
      contacts: own.length || campaign.target_count, progress: pct(finished, own.length),
      calls: kpi.total, connected: kpi.connected, rate: pct(kpi.connected, kpi.total), positive: kpi.positive, answered: kpi.answered,
    };
  });
}

/** Seconds → "3m 05s". */
export const duration = (seconds: number) => `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
