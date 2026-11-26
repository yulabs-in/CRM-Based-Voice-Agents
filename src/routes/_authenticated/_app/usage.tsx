import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpDown, Download, Settings } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/app/PageHeader";
import { CHART_COLORS, ChartCard, EmptyChart, KpiGrid, type Kpi } from "@/components/app/charts";
import { isAdmin, useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";
import { getUsageDashboard } from "@/lib/usage.functions";
import {
  currentIstMonth,
  estimateCost,
  formatDurationMmSs,
  formatInr,
  istDateRange,
  istMonthRange,
  minutesForSummaryRow,
  toCsv,
  type UsageCsvRow,
} from "@/lib/usage";

export const Route = createFileRoute("/_authenticated/_app/usage")({
  head: () => pageHead("Usage & Cost", "Daily calling minutes, per-agent & campaign spend, and monthly budget."),
  component: UsagePage,
});

type SortField = "name" | "attempts" | "connected" | "minutes" | "avgSeconds" | "cost";

interface BreakdownRow {
  id: string;
  name: string;
  attempts: number;
  connected: number;
  minutes: number;
  avgSeconds: number;
  cost: number;
}

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const tooltipStyle = { borderRadius: 12, border: "1px solid var(--border)" };

function sortRows(rows: BreakdownRow[], field: SortField, asc: boolean): BreakdownRow[] {
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (field === "name") return a.name.localeCompare(b.name) * dir;
    return (a[field] - b[field]) * dir;
  });
}

function BreakdownTable({
  title,
  rows,
  canSeeCosts,
}: {
  title: string;
  rows: BreakdownRow[];
  canSeeCosts: boolean;
}) {
  const [sortField, setSortField] = useState<SortField>("minutes");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => sortRows(rows, sortField, asc), [rows, sortField, asc]);

  function toggleSort(field: SortField) {
    if (sortField === field) setAsc((prev) => !prev);
    else {
      setSortField(field);
      setAsc(field === "name");
    }
  }

  const headBtn = (label: string, field: SortField, right = false) => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      className={`inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground ${right ? "ml-auto" : ""}`}
    >
      {label}
      <ArrowUpDown className="size-3" />
    </button>
  );

  return (
    <div className="rounded-2xl border bg-card shadow-soft">
      <div className="border-b px-5 py-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-xs">
              <th className="px-4 py-2.5 text-left">{headBtn("Name", "name")}</th>
              <th className="px-4 py-2.5 text-right">{headBtn("Attempts", "attempts", true)}</th>
              <th className="px-4 py-2.5 text-right">{headBtn("Connected", "connected", true)}</th>
              <th className="px-4 py-2.5 text-right">{headBtn("Minutes", "minutes", true)}</th>
              <th className="px-4 py-2.5 text-right">{headBtn("Avg length", "avgSeconds", true)}</th>
              {canSeeCosts && <th className="px-4 py-2.5 text-right">{headBtn("Est. cost", "cost", true)}</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={canSeeCosts ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                  No calls recorded in this period.
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-medium">{row.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.attempts.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.connected.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{(Math.round(row.minutes * 100) / 100).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatDurationMmSs(row.avgSeconds)}</td>
                  {canSeeCosts && <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatInr(row.cost)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsagePage() {
  const { org, role } = useOrg();
  const admin = isAdmin(role);
  const fetchDashboard = useServerFn(getUsageDashboard);

  const defaultMonth = currentIstMonth();
  const [mode, setMode] = useState<"month" | "custom">("month");
  const [month, setMonth] = useState(defaultMonth);
  const [fromDay, setFromDay] = useState(`${defaultMonth}-01`);
  const [toDay, setToDay] = useState(`${defaultMonth}-28`);

  const range = useMemo(() => {
    if (mode === "month") return istMonthRange(month);
    return istDateRange(fromDay, toDay);
  }, [mode, month, fromDay, toDay]);

  const query = useQuery({
    queryKey: ["usage-dashboard", org.id, range.fromIso, range.toIso],
    queryFn: () =>
      fetchDashboard({
        data: {
          organizationId: org.id,
          fromIso: range.fromIso,
          toIso: range.toIso,
        },
      }),
  });

  const data = query.data;
  const canSeeCosts = data?.canSeeCosts ?? false;
  const settings = data?.settings;
  const rounding = settings?.rounding ?? "per_call_minute";

  const agentNames = useMemo(() => new Map((data?.agents ?? []).map((a) => [a.id, a.name])), [data]);
  const campaignNames = useMemo(() => new Map((data?.campaigns ?? []).map((c) => [c.id, c.name])), [data]);

  const computed = useMemo(() => {
    const rows = data?.rows ?? [];
    let totalAttempts = 0;
    let totalConnected = 0;
    let totalSeconds = 0;
    let totalMinutes = 0;

    const agentMap = new Map<string, { name: string; attempts: number; connected: number; seconds: number; minutes: number }>();
    const campaignMap = new Map<string, { name: string; attempts: number; connected: number; seconds: number; minutes: number }>();
    const dayAgentMinutes = new Map<string, Record<string, number>>();
    const daySpend = new Map<string, number>();
    const activeAgents = new Set<string>();

    for (const row of rows) {
      const mins = minutesForSummaryRow(row, rounding);
      const rowCost = canSeeCosts && settings
        ? estimateCost({
            minutes: mins,
            attempts: row.attempts,
            costPerMinute: settings.cost_per_minute,
            costPerAttempt: settings.cost_per_attempt,
          })
        : 0;

      totalAttempts += row.attempts;
      totalConnected += row.connected;
      totalSeconds += row.seconds;
      totalMinutes += mins;

      const agentKey = row.agent_id ?? "__unassigned";
      const agentLabel = row.agent_id ? (agentNames.get(row.agent_id) ?? "Unknown agent") : "Unassigned";
      activeAgents.add(agentLabel);
      const aAcc = agentMap.get(agentKey) ?? { name: agentLabel, attempts: 0, connected: 0, seconds: 0, minutes: 0 };
      aAcc.attempts += row.attempts;
      aAcc.connected += row.connected;
      aAcc.seconds += row.seconds;
      aAcc.minutes += mins;
      agentMap.set(agentKey, aAcc);

      const campKey = row.campaign_id ?? "__direct";
      const campLabel = row.campaign_id ? (campaignNames.get(row.campaign_id) ?? "Unknown campaign") : "Direct / Test calls";
      const cAcc = campaignMap.get(campKey) ?? { name: campLabel, attempts: 0, connected: 0, seconds: 0, minutes: 0 };
      cAcc.attempts += row.attempts;
      cAcc.connected += row.connected;
      cAcc.seconds += row.seconds;
      cAcc.minutes += mins;
      campaignMap.set(campKey, cAcc);

      const dMap = dayAgentMinutes.get(row.day) ?? {};
      dMap[agentLabel] = (dMap[agentLabel] ?? 0) + mins;
      dayAgentMinutes.set(row.day, dMap);

      daySpend.set(row.day, (daySpend.get(row.day) ?? 0) + rowCost);
    }

    const totalCost = canSeeCosts && settings
      ? estimateCost({
          minutes: totalMinutes,
          attempts: totalAttempts,
          costPerMinute: settings.cost_per_minute,
          costPerAttempt: settings.cost_per_attempt,
        })
      : 0;

    const sortedDays = [...dayAgentMinutes.keys()].sort();
    const dailySeries = sortedDays.map((day) => ({
      day: day.slice(5),
      ...(dayAgentMinutes.get(day) ?? {}),
    }));

    let cumulative = 0;
    const spendSeries = sortedDays.map((day) => {
      cumulative = Math.round((cumulative + (daySpend.get(day) ?? 0)) * 100) / 100;
      return { day: day.slice(5), spend: cumulative };
    });

    const toBreakdown = (map: Map<string, { name: string; attempts: number; connected: number; seconds: number; minutes: number }>): BreakdownRow[] =>
      [...map.entries()].map(([id, item]) => ({
        id,
        name: item.name,
        attempts: item.attempts,
        connected: item.connected,
        minutes: item.minutes,
        avgSeconds: item.connected > 0 ? item.seconds / item.connected : 0,
        cost: canSeeCosts && settings
          ? estimateCost({
              minutes: item.minutes,
              attempts: item.attempts,
              costPerMinute: settings.cost_per_minute,
              costPerAttempt: settings.cost_per_attempt,
            })
          : 0,
      }));

    return {
      totalAttempts,
      totalConnected,
      connectedPct: totalAttempts > 0 ? Math.round((totalConnected / totalAttempts) * 100) : 0,
      avgConnectedSeconds: totalConnected > 0 ? totalSeconds / totalConnected : 0,
      totalMinutes,
      totalCost,
      agentKeys: [...activeAgents],
      dailySeries,
      spendSeries,
      agentRows: toBreakdown(agentMap),
      campaignRows: toBreakdown(campaignMap),
    };
  }, [data, rounding, canSeeCosts, settings, agentNames, campaignNames]);

  function exportCsv() {
    if (!data) return;
    const csvRows: UsageCsvRow[] = data.rows.map((row) => {
      const mins = minutesForSummaryRow(row, rounding);
      const cost = canSeeCosts && settings
        ? estimateCost({
            minutes: mins,
            attempts: row.attempts,
            costPerMinute: settings.cost_per_minute,
            costPerAttempt: settings.cost_per_attempt,
          })
        : 0;
      return {
        date: row.day,
        agent: row.agent_id ? (agentNames.get(row.agent_id) ?? "Unknown agent") : "Unassigned",
        campaign: row.campaign_id ? (campaignNames.get(row.campaign_id) ?? "Unknown campaign") : "Direct / Test calls",
        attempts: row.attempts,
        connected: row.connected,
        minutes: mins,
        estimated_cost_inr: cost,
      };
    });
    const content = toCsv(csvRows);
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = mode === "month" ? `usage-${month}.csv` : `usage-${fromDay}_to_${toDay}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const budget = data?.budgetStatus;
  const kpis: Kpi[] = [
    {
      label: "Total minutes",
      value: (Math.round(computed.totalMinutes * 100) / 100).toLocaleString(),
      hint: rounding === "per_call_minute" ? "Rounded up per call" : "Exact duration",
    },
    ...(canSeeCosts
      ? [
          {
            label: "Estimated spend",
            value: formatInr(computed.totalCost),
            hint: settings ? `${formatInr(settings.cost_per_minute)}/min` : undefined,
          },
        ]
      : []),
    { label: "Attempts", value: computed.totalAttempts.toLocaleString() },
    { label: "Connected", value: `${computed.connectedPct}%`, hint: `${computed.totalConnected.toLocaleString()} calls` },
    { label: "Avg call length", value: formatDurationMmSs(computed.avgConnectedSeconds), hint: "Connected calls" },
    ...(canSeeCosts && budget?.budget
      ? [
          {
            label: "Monthly budget used",
            value: `${budget.percent}%`,
            hint: (
              <div className="mt-1 space-y-1">
                <Progress value={Math.min(100, budget.percent)} className="h-1.5" />
                <span>
                  {formatInr(budget.spent)} of {formatInr(budget.budget)}
                </span>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        title="Usage & Cost"
        description="Track calling minutes, per-agent & campaign spend, and monthly budget in IST."
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border bg-muted/40 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setMode("month")}
              className={`rounded-lg px-2.5 py-1.5 ${mode === "month" ? "bg-card text-foreground shadow-soft" : "text-muted-foreground"}`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`rounded-lg px-2.5 py-1.5 ${mode === "custom" ? "bg-card text-foreground shadow-soft" : "text-muted-foreground"}`}
            >
              Custom
            </button>
          </div>

          {mode === "month" ? (
            <div className="flex items-center gap-1.5">
              <Label htmlFor="usage-month" className="sr-only">
                Month
              </Label>
              <Input
                id="usage-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value || defaultMonth)}
                className="h-9 w-40 rounded-xl bg-card"
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                aria-label="From date"
                value={fromDay}
                onChange={(e) => setFromDay(e.target.value)}
                className="h-9 w-36 rounded-xl bg-card"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="To date"
                value={toDay}
                onChange={(e) => setToDay(e.target.value)}
                className="h-9 w-36 rounded-xl bg-card"
              />
            </div>
          )}

          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.rows.length}>
            <Download className="size-4" />
            Export CSV
          </Button>
          {admin && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/settings" hash="usage">
                <Settings className="size-4" />
                Rates & budget
              </Link>
            </Button>
          )}
        </div>
      </PageHeader>

      <KpiGrid items={kpis} loading={query.isLoading} columns={kpis.length >= 6 ? 6 : 4} />

      <div className={`grid gap-4 ${canSeeCosts ? "lg:grid-cols-2" : ""}`}>
        <ChartCard title="Minutes per day (by agent)">
          {computed.dailySeries.length === 0 ? (
            <EmptyChart height={260} />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={computed.dailySeries}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                {computed.agentKeys.map((agentName, index) => (
                  <Bar
                    key={agentName}
                    dataKey={agentName}
                    stackId="minutes"
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    radius={index === computed.agentKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {canSeeCosts && (
          <ChartCard title="Cumulative spend vs monthly budget">
            {computed.spendSeries.length === 0 ? (
              <EmptyChart height={260} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={computed.spendSeries}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatInr(Number(v))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="spend"
                    name="Cumulative spend"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2.5}
                    dot={false}
                  />
                  {settings?.monthly_budget ? (
                    <ReferenceLine
                      y={settings.monthly_budget}
                      stroke="var(--destructive)"
                      strokeDasharray="6 4"
                      label={{ value: "Budget", fill: "var(--destructive)", fontSize: 11, position: "insideTopRight" }}
                    />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable title="By voice agent" rows={computed.agentRows} canSeeCosts={canSeeCosts} />
        <BreakdownTable title="By campaign" rows={computed.campaignRows} canSeeCosts={canSeeCosts} />
      </div>
    </div>
  );
}
