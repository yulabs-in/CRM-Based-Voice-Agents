import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/PageHeader";
import { useOrg } from "@/lib/org";
import { DEAL_STAGES, inr } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { rangeStart, RANGES, type RangeKey } from "@/lib/ranges";

export const Route = createFileRoute("/_authenticated/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — Yulabs CRM" },
      { name: "description", content: "Your sales, leads and activity at a glance." },
      { property: "og:title", content: "Overview — Yulabs CRM" },
      { property: "og:description", content: "Your sales, leads and activity at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Dashboard() {
  const { org } = useOrg();
  const [range, setRange] = useState<RangeKey>("30d");
  const stats = useQuery({
    queryKey: ["stats", org.id],
    queryFn: async () => {
      const q = (t: "contacts" | "leads" | "deals" | "tasks", cols: string) => supabase.from(t).select(cols).eq("organization_id", org.id).limit(5000);
      const [c, l, d, t] = await Promise.all([q("contacts", "id,created_at"), q("leads", "id,created_at,status,source"), q("deals", "id,created_at,stage,value"), q("tasks", "id,due_at,status")]);
      for (const r of [c, l, d, t]) if (r.error) throw r.error;
      return { contacts: c.data as unknown as { created_at: string }[], leads: l.data as unknown as { created_at: string; status: string; source: string | null }[], deals: d.data as unknown as { created_at: string; stage: string; value: number }[], tasks: t.data as unknown as { due_at: string | null; status: string }[] };
    },
  });

  const view = useMemo(() => {
    if (!stats.data) return null;
    const start = rangeStart(range);
    const inR = (x: { created_at: string }) => new Date(x.created_at) >= start;
    const { contacts, leads, deals, tasks } = stats.data;
    const active = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
    const won = deals.filter((d) => d.stage === "won");
    const closed = deals.filter((d) => d.stage === "won" || d.stage === "lost").length;
    const days = Math.min(90, Math.max(7, Math.ceil((Date.now() - start.getTime()) / 864e5)));
    const series = Array.from({ length: days }, (_, i) => {
      const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - (days - 1 - i));
      const k = day.toDateString();
      return { day: day.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), leads: leads.filter((x) => new Date(x.created_at).toDateString() === k).length, contacts: contacts.filter((x) => new Date(x.created_at).toDateString() === k).length };
    });
    const sources = Object.entries(leads.reduce<Record<string, number>>((a, x) => { const s = x.source ?? "Unknown"; a[s] = (a[s] ?? 0) + 1; return a; }, {})).map(([name, value]) => ({ name, value }));
    const stages = DEAL_STAGES.map((s) => ({ name: s.label, value: deals.filter((d) => d.stage === s.value).reduce((a, d) => a + Number(d.value), 0), count: deals.filter((d) => d.stage === s.value).length }));
    return {
      kpis: [
        { label: "Total Contacts", value: contacts.length },
        { label: "Total Leads", value: leads.length },
        { label: "New Leads", value: leads.filter(inR).length, hint: RANGES.find((r) => r.key === range)!.label },
        { label: "Active Deals", value: active.length },
        { label: "Revenue Pipeline", value: inr(active.reduce((a, d) => a + Number(d.value), 0)) },
        { label: "Won Deals", value: won.length, hint: inr(won.reduce((a, d) => a + Number(d.value), 0)) },
        { label: "Conversion Rate", value: closed ? Math.round((won.length / closed) * 100) + "%" : "—", hint: "won ÷ closed deals" },
        { label: "Follow-ups Due", value: tasks.filter((t) => t.status !== "done" && t.due_at && new Date(t.due_at) <= new Date(Date.now() + 864e5)).length, hint: "next 24h & overdue" },
      ],
      series, sources, stages,
    };
  }, [stats.data, range]);

  return (
    <div className="animate-rise space-y-6">
      <PageHeader title={`Welcome to ${org.name}`} description="Here's what's happening across your workspace.">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-40 rounded-xl bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>{RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" className="bg-card" disabled={!view} onClick={() => view && downloadCsv("overview.csv", view.kpis.map(({ label, value }) => ({ metric: label, value })))}><Download /> Export</Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(view?.kpis ?? Array.from({ length: 8 }, () => null)).map((k, i) => (
          <div key={i} className="rounded-2xl border bg-card p-4 shadow-soft">
            {k ? (<>
              <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{k.value}</p>
              {k.hint && <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>}
            </>) : <Skeleton className="h-16" />}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Leads & contacts over time" className="lg:col-span-2">
          {view ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={view.series}>
                <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={28} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }} />
                <Area type="monotone" dataKey="leads" stroke="var(--chart-1)" strokeWidth={2} fill="url(#g1)" />
                <Area type="monotone" dataKey="contacts" stroke="var(--chart-2)" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Skeleton className="h-64" />}
        </Card>
        <Card title="Lead sources">
          {view && view.sources.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart><Pie data={view.sources} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                {view.sources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Tooltip contentStyle={{ borderRadius: 12 }} /></PieChart>
            </ResponsiveContainer>
          ) : view ? <Empty /> : <Skeleton className="h-64" />}
        </Card>
        <Card title="Revenue by pipeline stage" className="lg:col-span-3">
          {view ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={view.stages}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => "₹" + Intl.NumberFormat("en-IN", { notation: "compact" }).format(v)} />
                <Tooltip formatter={(v) => inr(v)} contentStyle={{ borderRadius: 12 }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="var(--chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          ) : <Skeleton className="h-60" />}
        </Card>
      </div>
      <p className="text-center text-xs text-muted-foreground">Call, campaign and agent charts appear here once voice agents are connected.</p>
    </div>
  );
}

function Card({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return <div className={"rounded-2xl border bg-card p-5 shadow-soft " + (className ?? "")}><p className="mb-4 flex items-center gap-2 text-sm font-semibold"><TrendingUp className="size-4 text-primary" />{title}</p>{children}</div>;
}
function Empty() {
  return <div className="dot-canvas grid h-64 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">No data yet</div>;
}
