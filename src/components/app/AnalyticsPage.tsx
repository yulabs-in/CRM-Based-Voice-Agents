import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "./PageHeader";
import { StatusBadge } from "./StatusBadge";
import { BarBox, ChartCard, Funnel, KpiGrid, PieBox, TrendBox } from "./charts";
import { useOrg } from "@/lib/org";
import { inr, DEAL_STAGES } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { fetchAll } from "@/lib/fetch-all";
import { rangeStart, RANGES, type RangeKey } from "@/lib/ranges";
import { buildAnalytics, type AnalyticsKind } from "@/lib/analytics";
import {
  answerBreakdown, bestHours, byAgent, callFunnel, callKpis, callsOverTime, campaignComparison, countBy, duration, pct, pctLabel,
  type CallRow, type CampaignRow, type TargetRow,
} from "@/lib/call-insights";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows from several tables, read loosely by the chart helpers
type R = Record<string, any>;
const ALL = "__all";
const ALL_TIME = "all";

export function AnalyticsPage({ kind, title, description }: { kind: AnalyticsKind; title: string; description: string }) {
  const { org } = useOrg();
  const [range, setRange] = useState<RangeKey | typeof ALL_TIME>("30d");
  const [projectId, setProjectId] = useState(ALL);
  const usesProjects = kind === "calls" || kind === "campaigns";

  const q = useQuery({
    queryKey: ["analytics", org.id, kind],
    queryFn: async () => {
      const o = org.id;
      const callCols = "id, status, duration_seconds, sentiment, outcome, campaign_id, agent_id, contact_id, started_at, created_at, answers, recording_path";
      const [deals, leads, calls, campaigns, tasks, members, profiles, agents, projects, targets] = await Promise.all([
        fetchAll<R>((f, t) => supabase.from("deals").select("id, stage, value, owner_id, contact_id, created_at, updated_at").eq("organization_id", o).range(f, t)),
        fetchAll<R>((f, t) => supabase.from("leads").select("id, status, source, contact_id, created_at").eq("organization_id", o).range(f, t)),
        fetchAll<CallRow>((f, t) => supabase.from("calls").select(callCols).eq("organization_id", o).range(f, t), 200000),
        supabase.from("call_campaigns").select("id, name, status, project_id, target_count").eq("organization_id", o),
        fetchAll<R>((f, t) => supabase.from("tasks").select("id, status, assignee_id, created_at").eq("organization_id", o).range(f, t)),
        supabase.from("memberships").select("user_id").eq("organization_id", o),
        supabase.from("profiles").select("id, full_name"),
        supabase.from("voice_agents").select("id, name").eq("organization_id", o),
        supabase.from("projects").select("id, name, contact_count").eq("organization_id", o),
        usesProjects ? fetchAll<TargetRow>((f, t) => supabase.from("campaign_targets").select("campaign_id, status").eq("organization_id", o).range(f, t), 200000) : Promise.resolve([]),
      ]);
      return {
        deals, leads, calls, tasks, targets,
        campaigns: (campaigns.data ?? []) as CampaignRow[], members: members.data ?? [], profiles: profiles.data ?? [],
        agents: new Map((agents.data ?? []).map((agent) => [agent.id, agent.name])), projects: projects.data ?? [],
      };
    },
  });

  const view = useMemo(() => {
    if (!q.data) return null;
    const start = range === ALL_TIME ? new Date(0) : rangeStart(range);
    const inRange = (date: string | null | undefined) => !!date && new Date(date) >= start;
    const campaignProject = new Map(q.data.campaigns.map((campaign) => [campaign.id, campaign.project_id]));
    const campaigns = projectId === ALL ? q.data.campaigns : q.data.campaigns.filter((campaign) => campaign.project_id === projectId);
    const calls = q.data.calls.filter((call) => inRange(call.started_at ?? call.created_at)
      && (projectId === ALL || (call.campaign_id && campaignProject.get(call.campaign_id) === projectId)));
    return {
      ...q.data, campaigns, calls,
      deals: q.data.deals.filter((deal) => inRange(deal.created_at)),
      leads: q.data.leads.filter((lead) => inRange(lead.created_at)),
      tasks: q.data.tasks.filter((task) => inRange(task.created_at)),
      days: range === ALL_TIME ? 90 : Math.min(90, Math.max(7, Math.ceil((Date.now() - start.getTime()) / 864e5))),
    };
  }, [q.data, range, projectId]);

  return (
    <div className="animate-rise space-y-5">
      <PageHeader title={title} description={description}>
        {usesProjects && (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-48 rounded-xl bg-card" aria-label="Project"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {q.data?.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={range} onValueChange={(value) => setRange(value as RangeKey)}>
          <SelectTrigger className="w-40 rounded-xl bg-card" aria-label="Date range"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RANGES.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
            <SelectItem value={ALL_TIME}>All time</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>
      {!view ? <Skeleton className="h-96 rounded-2xl" /> : kind === "calls" ? <CallsView v={view} /> : kind === "campaigns" ? <CampaignsView v={view} /> : kind === "sales" ? <SalesView v={view} /> : <TeamView v={view} />}
    </div>
  );
}

type View = {
  deals: R[]; leads: R[]; calls: CallRow[]; tasks: R[]; targets: TargetRow[]; campaigns: CampaignRow[]; members: R[]; profiles: R[];
  agents: Map<string, string>; projects: Array<{ id: string; name: string; contact_count: number }>; days: number;
};

function CallsView({ v }: { v: View }) {
  const kpi = callKpis(v.calls);
  const agents = byAgent(v.calls, v.agents);
  const answers = answerBreakdown(v.calls);
  return (
    <>
      <KpiGrid columns={6} items={[
        { label: "Calls", value: kpi.total.toLocaleString() },
        { label: "Connect rate", value: kpi.connectRate, hint: `${kpi.connected.toLocaleString()} connected` },
        { label: "Avg. talk time", value: duration(kpi.avgDuration) },
        { label: "Talk minutes", value: kpi.talkMinutes.toLocaleString() },
        { label: "Gave answers", value: kpi.answered.toLocaleString(), hint: pctLabel(kpi.answered, kpi.connected) + " of connected" },
        { label: "Positive", value: kpi.positive.toLocaleString(), hint: pctLabel(kpi.positive, kpi.connected) + " of connected" },
      ]} />
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Calls vs connected" className="lg:col-span-2"><TrendBox data={callsOverTime(v.calls, v.days)} xKey="day" series={[{ key: "calls", label: "Calls" }, { key: "connected", label: "Connected" }]} /></ChartCard>
        <ChartCard title="Call funnel"><Funnel steps={callFunnel(v.calls)} /></ChartCard>
        <ChartCard title="Best time to call (connect %)"><BarBox data={bestHours(v.calls).map((slot) => ({ name: slot.name, value: slot.rate }))} format={(value) => `${value}%`} /></ChartCard>
        <ChartCard title="Results"><PieBox data={countBy(v.calls, (call) => call.status.replace(/_/g, " "))} /></ChartCard>
        <ChartCard title="Sentiment"><PieBox data={countBy(v.calls.filter((call) => call.sentiment), (call) => call.sentiment)} /></ChartCard>
      </div>
      {answers.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {answers.map((entry) => <ChartCard key={entry.key} title={`Answers · ${entry.label}`}>{entry.values.length <= 5 ? <PieBox data={entry.values} /> : <BarBox data={entry.values} horizontal />}</ChartCard>)}
        </div>
      )}
      <Table title="Voice agent performance" rows={agents} columns={[
        ["name", "Agent"], ["calls", "Calls"], ["connected", "Connected"], ["rate", "Connect %", (value) => `${value}%`],
        ["avgDuration", "Avg. talk", (value) => duration(Number(value))], ["positive", "Positive"],
      ]} />
    </>
  );
}

function CampaignsView({ v }: { v: View }) {
  const rows = campaignComparison(v.campaigns, v.targets, v.calls);
  const projects = v.projects.map((project) => {
    const ids = new Set(v.campaigns.filter((campaign) => campaign.project_id === project.id).map((campaign) => campaign.id));
    const kpi = callKpis(v.calls.filter((call) => call.campaign_id && ids.has(call.campaign_id)));
    return { id: project.id, name: project.name, contacts: project.contact_count, campaigns: ids.size, calls: kpi.total, rate: pct(kpi.connected, kpi.total), positive: kpi.positive };
  }).filter((project) => project.campaigns > 0).sort((a, b) => b.positive - a.positive);
  const kpi = callKpis(v.calls.filter((call) => call.campaign_id));
  return (
    <>
      <KpiGrid items={[
        { label: "Campaigns", value: rows.length, hint: `${rows.filter((row) => row.status === "running").length} running` },
        { label: "Campaign calls", value: kpi.total.toLocaleString() },
        { label: "Connect rate", value: kpi.connectRate },
        { label: "Positive outcomes", value: kpi.positive.toLocaleString() },
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Connect rate by campaign"><BarBox data={rows.map((row) => ({ name: row.name, value: row.rate }))} horizontal format={(value) => `${value}%`} /></ChartCard>
        <ChartCard title="Positive outcomes by campaign"><BarBox data={rows.map((row) => ({ name: row.name, value: row.positive }))} horizontal /></ChartCard>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
        <p className="border-b px-4 py-3 text-sm font-semibold">Campaign comparison</p>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            {["Campaign", "Status", "Contacts", "Progress", "Calls", "Connected", "Answered", "Positive"].map((label) => <th key={label} className="px-4 py-2.5">{label}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-4 py-2.5"><Link to="/call-campaigns/$campaignId" params={{ campaignId: row.id }} className="font-semibold hover:text-primary">{row.name}</Link></td>
                <td className="px-4 py-2.5"><StatusBadge value={row.status} /></td>
                <td className="px-4 py-2.5 tabular-nums">{row.contacts.toLocaleString()}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.progress}%</td>
                <td className="px-4 py-2.5 tabular-nums">{row.calls.toLocaleString()}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.connected.toLocaleString()} ({row.rate}%)</td>
                <td className="px-4 py-2.5 tabular-nums">{row.answered.toLocaleString()}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.positive.toLocaleString()}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">No campaigns in this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <Table title="Project leaderboard" rows={projects} columns={[
        ["name", "Project"], ["contacts", "Contacts"], ["campaigns", "Campaigns"], ["calls", "Calls"], ["rate", "Connect %", (value) => `${value}%`], ["positive", "Positive"],
      ]} />
    </>
  );
}

function SalesView({ v }: { v: View }) {
  const base = buildAnalytics("sales", { deals: v.deals, leads: v.leads, calls: v.calls, campaigns: v.campaigns, tasks: v.tasks, members: v.members, profiles: v.profiles });
  const won = v.deals.filter((deal) => deal.stage === "won");
  const months = new Map<string, number>();
  for (const deal of won) {
    const key = new Date(deal.updated_at ?? deal.created_at).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    months.set(key, (months.get(key) ?? 0) + Number(deal.value));
  }
  const dealContacts = new Set(v.deals.map((deal) => deal.contact_id).filter(Boolean));
  const wonContacts = new Set(won.map((deal) => deal.contact_id).filter(Boolean));
  const sources = countBy(v.leads, (lead) => lead.source).map((source) => {
    const group = v.leads.filter((lead) => (lead.source || "Unknown") === source.name);
    return { name: source.name, leads: group.length, toDeal: group.filter((lead) => lead.contact_id && dealContacts.has(lead.contact_id)).length, won: group.filter((lead) => lead.contact_id && wonContacts.has(lead.contact_id)).length };
  });
  return (
    <>
      <KpiGrid items={base.kpis.map((kpi) => ({ label: kpi.label, value: kpi.money ? inr(kpi.value) : kpi.value }))} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Pipeline by stage (₹)"><BarBox data={DEAL_STAGES.map((stage) => ({ name: stage.label, value: v.deals.filter((deal) => deal.stage === stage.value).reduce((sum, deal) => sum + Number(deal.value), 0) }))} format={(value) => "₹" + Intl.NumberFormat("en-IN", { notation: "compact" }).format(value)} /></ChartCard>
        <ChartCard title="Deals by stage"><Funnel steps={DEAL_STAGES.filter((stage) => stage.value !== "lost").map((stage) => ({ name: stage.label, value: v.deals.filter((deal) => deal.stage === stage.value).length }))} /></ChartCard>
        <ChartCard title="Revenue won by month (₹)"><BarBox data={[...months.entries()].map(([name, value]) => ({ name, value }))} format={(value) => "₹" + Intl.NumberFormat("en-IN", { notation: "compact" }).format(value)} /></ChartCard>
        <ChartCard title="Leads by source"><PieBox data={countBy(v.leads, (lead) => lead.source)} /></ChartCard>
      </div>
      <Table title="Lead source → deal conversion" rows={sources} columns={[
        ["name", "Source"], ["leads", "Leads"], ["toDeal", "Became deals"], ["won", "Won"],
      ]} footer="Leads are matched to deals through their linked contact." />
    </>
  );
}

function TeamView({ v }: { v: View }) {
  const base = buildAnalytics("team", { deals: v.deals, leads: v.leads, calls: v.calls, campaigns: v.campaigns, tasks: v.tasks, members: v.members, profiles: v.profiles });
  return (
    <>
      <KpiGrid items={base.kpis.map((kpi) => ({ label: kpi.label, value: kpi.money ? inr(kpi.value) : kpi.value }))} />
      <div className="grid gap-4 lg:grid-cols-2">
        {base.charts.map((chart) => <ChartCard key={chart.title} title={chart.title}><BarBox data={chart.data} horizontal /></ChartCard>)}
        <ChartCard title="Calls handled by voice agent"><BarBox data={byAgent(v.calls, v.agents).map((row) => ({ name: row.name, value: row.calls }))} horizontal /></ChartCard>
        <ChartCard title="Open vs done tasks"><PieBox data={countBy(v.tasks, (task) => (task.status === "done" ? "Done" : "Open"))} /></ChartCard>
      </div>
    </>
  );
}

function Table<T extends Record<string, unknown>>({ title, rows, columns, footer }: { title: string; rows: T[]; columns: Array<[keyof T & string, string, ((value: unknown) => string)?]>; footer?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
      <div className="flex items-center border-b px-4 py-3">
        <p className="text-sm font-semibold">{title}</p>
        <Button size="sm" variant="ghost" className="ml-auto" disabled={!rows.length} onClick={() => downloadCsv(`${title.toLowerCase().replace(/\W+/g, "-")}.csv`, rows)}><Download /> CSV</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">{columns.map(([key, label]) => <th key={key} className="px-4 py-2.5">{label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => <tr key={index} className="border-b last:border-0">{columns.map(([key, , format]) => <td key={key} className="px-4 py-2.5 tabular-nums">{format ? format(row[key]) : String(row[key] ?? "—")}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={columns.length} className="py-10 text-center text-muted-foreground">No data in this period.</td></tr>}
        </tbody>
      </table>
      {footer && <p className="border-t px-4 py-2 text-xs text-muted-foreground">{footer}</p>}
    </div>
  );
}
