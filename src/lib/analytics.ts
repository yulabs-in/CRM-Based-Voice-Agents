export type AnalyticsKind = "sales" | "calls" | "campaigns" | "team";
type R = Record<string, any>;
export type AnalyticsInput = { deals: R[]; leads: R[]; calls: R[]; campaigns: R[]; tasks: R[]; members: R[]; profiles: R[] };
const group = (rows: R[], key: (r: R) => string, val: (r: R) => number = () => 1) => {
  const m = new Map<string, number>();
  rows.forEach((r) => { const k = key(r) || "Unknown"; m.set(k, (m.get(k) ?? 0) + val(r)); });
  return [...m.entries()].map(([name, value]) => ({ name, value }));
};
const label = (s: string) => s.replace(/_/g, " ");

export type Kpi = { label: string; value: number | string; money?: boolean };
export function buildAnalytics(kind: AnalyticsKind, d: AnalyticsInput): { kpis: Kpi[]; charts: { title: string; data: { name: string; value: number }[] }[] } {
  if (kind === "sales") {
    const won = d.deals.filter((x) => x.stage === "won"), lost = d.deals.filter((x) => x.stage === "lost");
    const closed = won.length + lost.length;
    return {
      kpis: [
        { label: "Revenue won", value: won.reduce((s, x) => s + Number(x.value), 0), money: true },
        { label: "Open pipeline", value: d.deals.filter((x) => !["won", "lost"].includes(x.stage)).reduce((s, x) => s + Number(x.value), 0), money: true },
        { label: "Win rate", value: closed ? `${Math.round((won.length / closed) * 100)}%` : "—" },
        { label: "Lead conversion", value: d.leads.length ? `${Math.round((d.leads.filter((x) => x.status === "converted").length / d.leads.length) * 100)}%` : "—" },
      ],
      charts: [
        { title: "Deal value by stage (₹)", data: group(d.deals, (x) => label(x.stage), (x) => Number(x.value)) },
        { title: "Leads by source", data: group(d.leads, (x) => x.source) },
      ],
    };
  }
  if (kind === "calls") {
    const done = d.calls.filter((x) => x.status === "completed");
    const total = done.reduce((s, x) => s + Number(x.duration_seconds), 0);
    return {
      kpis: [
        { label: "Total calls", value: d.calls.length },
        { label: "Answered rate", value: d.calls.length ? `${Math.round((done.length / d.calls.length) * 100)}%` : "—" },
        { label: "Avg. duration", value: done.length ? `${Math.round(total / done.length / 60)} min` : "—" },
        { label: "Positive sentiment", value: d.calls.filter((x) => x.sentiment === "positive").length },
      ],
      charts: [
        { title: "Calls by status", data: group(d.calls, (x) => label(x.status)) },
        { title: "Sentiment", data: group(d.calls.filter((x) => x.sentiment), (x) => x.sentiment) },
      ],
    };
  }
  if (kind === "campaigns") {
    const names = new Map(d.campaigns.map((c) => [c.id, c.name]));
    const inCamp = d.calls.filter((x) => x.campaign_id);
    return {
      kpis: [
        { label: "Campaigns", value: d.campaigns.length },
        { label: "Campaign calls", value: inCamp.length },
        { label: "Completed", value: inCamp.filter((x) => x.status === "completed").length },
        { label: "Positive outcomes", value: inCamp.filter((x) => x.sentiment === "positive").length },
      ],
      charts: [
        { title: "Calls per campaign", data: group(inCamp, (x) => names.get(x.campaign_id) ?? "Deleted campaign") },
        { title: "Completed calls per campaign", data: group(inCamp.filter((x) => x.status === "completed"), (x) => names.get(x.campaign_id) ?? "Deleted campaign") },
      ],
    };
  }
  const names = new Map(d.profiles.map((p) => [p.id, p.full_name || "Teammate"]));
  const who = (id: string) => names.get(id) ?? "Unassigned";
  return {
    kpis: [
      { label: "Team members", value: d.members.length },
      { label: "Deals won", value: d.deals.filter((x) => x.stage === "won").length },
      { label: "Tasks done", value: d.tasks.filter((x) => x.status === "done").length },
      { label: "Open tasks", value: d.tasks.filter((x) => x.status !== "done").length },
    ],
    charts: [
      { title: "Revenue won by person (₹)", data: group(d.deals.filter((x) => x.stage === "won"), (x) => who(x.owner_id), (x) => Number(x.value)) },
      { title: "Tasks completed by person", data: group(d.tasks.filter((x) => x.status === "done"), (x) => who(x.assignee_id)) },
    ],
  };
}
