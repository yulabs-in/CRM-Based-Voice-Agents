import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Point } from "@/lib/call-insights";

export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const tooltipStyle = { borderRadius: 12, border: "1px solid var(--border)" };

export type Kpi = { label: string; value: ReactNode; hint?: ReactNode };

export function KpiGrid({ items, loading, columns = 4 }: { items: Kpi[]; loading?: boolean; columns?: 3 | 4 | 6 }) {
  const grid = columns === 6 ? "lg:grid-cols-6" : columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return (
    <div className={`grid grid-cols-2 gap-3 ${grid}`}>
      {(loading ? Array.from({ length: columns }, () => null) : items).map((kpi, index) => (
        <div key={kpi?.label ?? index} className="rounded-2xl border bg-card p-4 shadow-soft">
          {kpi ? (
            <>
              <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{kpi.value}</p>
              {kpi.hint && <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>}
            </>
          ) : <Skeleton className="h-16" />}
        </div>
      ))}
    </div>
  );
}

export function ChartCard({ title, className, children, action }: { title: string; className?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`rounded-2xl border bg-card p-5 shadow-soft ${className ?? ""}`}>
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="size-4 text-primary" />
        <p className="text-sm font-semibold">{title}</p>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function EmptyChart({ height = 240, text = "No data yet" }: { height?: number; text?: string }) {
  return <div className="dot-canvas grid place-items-center rounded-xl border border-dashed text-sm text-muted-foreground" style={{ height }}>{text}</div>;
}

export function BarBox({ data, height = 240, horizontal, format, color = CHART_COLORS[0] }: { data: Point[]; height?: number; horizontal?: boolean; format?: (value: number) => string; color?: string }) {
  if (!data.length) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {horizontal ? (
        <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid stroke="var(--border)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={axis} tickLine={false} axisLine={false} tickFormatter={format} />
          <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={120} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => (format ? format(Number(value)) : value)} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={color} />
        </BarChart>
      ) : (
        <BarChart data={data}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={44} tickFormatter={format} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => (format ? format(Number(value)) : value)} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={color} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export function PieBox({ data, height = 240 }: { data: Point[]; height?: number }) {
  if (!data.length) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%" paddingAngle={2}>
          {data.map((point, index) => <Cell key={point.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TrendBox<T extends Record<string, unknown>>({ data, xKey, series, height = 260 }: { data: T[]; xKey: keyof T & string; series: Array<{ key: keyof T & string; label: string }>; height?: number }) {
  if (!data.length) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          {series.map((item, index) => (
            <linearGradient key={item.key} id={`trend-${item.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={32} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        {series.map((item, index) => (
          <Area key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2} fill={`url(#trend-${item.key})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal funnel: each step's bar width relative to the first step, with step-to-step conversion. */
export function Funnel({ steps }: { steps: Point[] }) {
  const top = steps[0]?.value ?? 0;
  if (!top) return <EmptyChart height={180} text="No calls yet" />;
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const previous = index ? steps[index - 1]!.value : step.value;
        return (
          <li key={step.name}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium">{step.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {step.value.toLocaleString()}
                {index > 0 && <span className="ml-2 text-xs">({previous ? Math.round((step.value / previous) * 100) : 0}% of previous)</span>}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (step.value / top) * 100)}%`, background: CHART_COLORS[index % CHART_COLORS.length] }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
