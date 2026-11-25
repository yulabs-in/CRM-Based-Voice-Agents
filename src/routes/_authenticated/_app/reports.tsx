import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { BarBox, ChartCard, EmptyChart, KpiGrid, PieBox, TrendBox } from "@/components/app/charts";
import { EVERYONE, TeamFilter, useTeamScope } from "@/components/app/TeamFilter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { ROLE_LABELS, useOrg } from "@/lib/org";
import { downloadCsv } from "@/lib/csv";
import { fetchAll } from "@/lib/fetch-all";
import { inr } from "@/lib/format";
import { rangeStart, RANGES, type RangeKey } from "@/lib/ranges";
import { pageHead } from "@/lib/seo";
import { asAnswers, humanize } from "@/lib/sarvam-call";
import { byAgent, callKpis, callsOverTime, duration, pctLabel, type CallRow } from "@/lib/call-insights";
import {
  KYC_STATUSES, ORDER_STATUSES, PAYMENT_MODES, PRODUCT_TYPES, groupSum, labelOf, lastMonths, leaderboard, paymentSummary,
} from "@/lib/sales-ops";
import { isSalesRole, useKyc, useMembers, usePayments, useSalesOrders, NO_MEMBERS } from "@/lib/sales-data";

export const Route = createFileRoute("/_authenticated/_app/reports")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({ tab: typeof s.tab === "string" ? s.tab : undefined }),
  head: () => pageHead("Reports", "Sales, payments, calls, KYC and team reports in one place."),
  component: ReportsPage,
});

const ALL_TIME = "all";
type Range = RangeKey | typeof ALL_TIME;
const TABS = ["sales", "payments", "calls", "kyc", "team"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { sales: "Sales", payments: "Payments", calls: "Calls", kyc: "KYC", team: "Team" };

function ReportsPage() {
  const { org, role } = useOrg();
  const search = Route.useSearch();
  const tab: Tab = (TABS as readonly string[]).includes(search.tab ?? "") ? (search.tab as Tab) : "sales";
  const nav = Route.useNavigate();
  const [range, setRange] = useState<Range>("30d");
  const [team, setTeam] = useState(EVERYONE);
  const orders = useSalesOrders();
  const payments = usePayments();
  const kyc = useKyc();
  const members = useMembers();
  const memberList = members.data ?? NO_MEMBERS;
  const inScope = useTeamScope(memberList, team);
  const calls = useQuery({
    queryKey: ["calls", org.id, "reports"],
    queryFn: async () => {
      const [rows, agents] = await Promise.all([
        fetchAll<CallRow>((f, t) => supabase.from("calls").select("id, status, duration_seconds, sentiment, outcome, campaign_id, agent_id, contact_id, started_at, created_at, answers").eq("organization_id", org.id).range(f, t) as never, 200000),
        supabase.from("voice_agents").select("id, name").eq("organization_id", org.id),
      ]);
      return { rows, agents: new Map((agents.data ?? []).map((a) => [a.id, a.name])) };
    },
  });

  const since = range === ALL_TIME ? null : rangeStart(range);
  const inRange = (date: string | null | undefined) => !!date && (!since || new Date(date.length === 10 ? `${date}T00:00:00` : date) >= since);
  const rangeLabel = range === ALL_TIME ? "All time" : RANGES.find((r) => r.key === range)!.label;

  const sales = useMemo(() => {
    if (!orders.data || !payments.data) return null;
    const scoped = orders.data.filter((o) => inScope(o.owner_id));
    const booked = scoped.filter((o) => o.status !== "cancelled" && inRange(o.created_at));
    const ids = new Set(scoped.map((o) => o.id));
    const scopedPayments = payments.data.filter((p) => ids.has(p.sales_order_id));
    const months = lastMonths(6);
    const premiumOf = (rows: typeof booked) => rows.reduce((s, o) => s + Number(o.premium_amount), 0);
    return {
      booked, scoped, scopedPayments,
      premium: premiumOf(booked),
      issued: booked.filter((o) => o.status === "issued").length,
      fromCalls: booked.filter((o) => o.source === "ai_call").length,
      byMonth: months.map((m) => {
        const rows = scoped.filter((o) => o.status !== "cancelled" && o.created_at.startsWith(m.key));
        return { month: m.label, orders: rows.length, issued: rows.filter((o) => o.status === "issued").length };
      }),
      premiumByProduct: groupSum(booked, (o) => labelOf(PRODUCT_TYPES, o.product_type), (o) => Number(o.premium_amount)),
      byStatus: groupSum(scoped.filter((o) => inRange(o.created_at)), (o) => labelOf(ORDER_STATUSES, o.status)),
      byInsurer: groupSum(booked.filter((o) => o.insurer), (o) => o.insurer!, (o) => Number(o.premium_amount)).slice(0, 8),
      payments: paymentSummary(scoped, scopedPayments, since),
      byMode: groupSum(scopedPayments.filter((p) => p.status === "received" && inRange(p.paid_on)), (p) => labelOf(PAYMENT_MODES, p.mode), (p) => Number(p.amount)),
      collectedByMonth: months.map((m) => ({
        name: m.label, value: scopedPayments.filter((p) => p.status === "received" && p.paid_on.startsWith(m.key)).reduce((s, p) => s + Number(p.amount), 0),
      })),
    };
  }, [orders.data, payments.data, inScope, since?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const callView = useMemo(() => {
    if (!calls.data || !orders.data) return null;
    const rows = calls.data.rows.filter((c) => inRange(c.started_at ?? c.created_at));
    const kpi = callKpis(rows);
    const callIds = new Set(rows.map((c) => c.id));
    const ordersFromCalls = orders.data.filter((o) => o.call_id && callIds.has(o.call_id)).length;
    const kycFromCalls = (kyc.data ?? []).filter((k) => k.call_id && callIds.has(k.call_id)).length;
    const days = since ? Math.min(90, Math.max(7, Math.ceil((Date.now() - since.getTime()) / 864e5))) : 90;
    return {
      kpi, ordersFromCalls, kycFromCalls,
      dispositions: groupSum(rows.filter((c) => c.status === "completed"), (c) => humanize(asAnswers(c.answers).disposition || c.outcome || "No disposition")),
      overTime: callsOverTime(rows, days),
      agents: byAgent(rows, calls.data.agents),
    };
  }, [calls.data, orders.data, kyc.data, since?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const kycView = useMemo(() => {
    if (!kyc.data) return null;
    const rows = kyc.data.filter((k) => inRange(k.updated_at));
    return {
      total: rows.length,
      fromCalls: rows.filter((k) => k.source === "ai_call").length,
      verified: rows.filter((k) => k.status === "verified").length,
      review: rows.filter((k) => k.status === "collected").length,
      byStatus: groupSum(rows, (k) => labelOf(KYC_STATUSES, k.status)),
      completeness: [
        ["Date of birth", "date_of_birth"], ["Email", "email"], ["Address", "address_line"], ["Pincode", "pincode"], ["Nominee", "nominee_name"], ["PAN", "pan_masked"],
      ].map(([label, key]) => ({ name: label, value: rows.filter((k) => !!k[key as keyof typeof k]).length })),
    };
  }, [kyc.data, since?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const board = useMemo(() => {
    if (!orders.data || !payments.data || !memberList.length) return [];
    const scopedOrders = orders.data.filter((o) => inRange(o.created_at));
    const scopedPayments = payments.data.filter((p) => inRange(p.paid_on));
    return leaderboard(memberList, scopedOrders, scopedPayments).filter((m) => inScope(m.user_id));
  }, [orders.data, payments.data, memberList, inScope, since?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  function exportTab() {
    if (tab === "sales" && sales) downloadCsv("sales-report.csv", sales.booked.map((o) => ({
      order: o.order_number, created: o.created_at.slice(0, 10), status: o.status, product: labelOf(PRODUCT_TYPES, o.product_type), insurer: o.insurer ?? "",
      premium: o.premium_amount, paid: o.amount_paid, source: o.source, owner: memberList.find((m) => m.user_id === o.owner_id)?.name ?? "Unassigned",
    })));
    if (tab === "payments" && sales) downloadCsv("payments-report.csv", sales.scopedPayments.filter((p) => inRange(p.paid_on)).map((p) => ({
      paid_on: p.paid_on, order: sales.scoped.find((o) => o.id === p.sales_order_id)?.order_number ?? "", amount: p.amount, mode: p.mode, status: p.status, reference: p.reference ?? "",
    })));
    if (tab === "calls" && callView) downloadCsv("calls-report.csv", callView.agents.map((a) => ({ agent: a.name, calls: a.calls, connected: a.connected, connect_rate: `${a.rate}%`, avg_talk_seconds: a.avgDuration, positive: a.positive })));
    if (tab === "kyc" && kycView) downloadCsv("kyc-report.csv", kycView.byStatus.map((r) => ({ status: r.name, records: r.value })));
    if (tab === "team") downloadCsv("team-report.csv", board.map((m) => ({
      person: m.name, role: ROLE_LABELS[m.role], level: m.depth, orders: m.own.orders, issued: m.own.issued, premium: m.own.premium, collected: m.own.collected,
      team_size: m.team.size, team_orders: m.team.orders, team_premium: m.team.premium, team_collected: m.team.collected,
    })));
  }

  const loading = <Skeleton className="h-60 rounded-2xl" />;

  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Reports" description="Sales, payments, calls, KYC and team performance. Pick a period and a team; export any tab as CSV.">
        <TeamFilter members={memberList} value={team} onChange={setTeam} />
        <Select value={range} onValueChange={(v) => setRange(v as Range)}>
          <SelectTrigger className="w-40 rounded-xl bg-card" aria-label="Date range"><SelectValue /></SelectTrigger>
          <SelectContent>{RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}<SelectItem value={ALL_TIME}>All time</SelectItem></SelectContent>
        </Select>
        <Button variant="outline" className="bg-card" onClick={exportTab}><Download /> Export {TAB_LABEL[tab].toLowerCase()}</Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => nav({ search: { tab: v } })}>
        <TabsList>{TABS.map((t) => <TabsTrigger key={t} value={t}>{TAB_LABEL[t]}</TabsTrigger>)}</TabsList>

        <TabsContent value="sales" className="mt-5 space-y-4">
          <KpiGrid loading={!sales} items={sales ? [
            { label: "Orders booked", value: sales.booked.length, hint: rangeLabel },
            { label: "Premium booked", value: inr(sales.premium) },
            { label: "Policies issued", value: sales.issued, hint: pctLabel(sales.issued, sales.booked.length) + " of orders" },
            { label: "From AI calls", value: sales.fromCalls, hint: pctLabel(sales.fromCalls, sales.booked.length) + " of orders" },
          ] : []} />
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Orders per month" className="lg:col-span-2">{sales ? <TrendBox data={sales.byMonth} xKey="month" series={[{ key: "orders", label: "Orders" }, { key: "issued", label: "Issued" }]} /> : loading}</ChartCard>
            <ChartCard title="Orders by status">{sales ? (sales.byStatus.length ? <PieBox data={sales.byStatus} /> : <EmptyChart />) : loading}</ChartCard>
            <ChartCard title="Premium by product (₹)">{sales ? (sales.premiumByProduct.length ? <BarBox data={sales.premiumByProduct} format={(v) => inr(v)} /> : <EmptyChart />) : loading}</ChartCard>
            <ChartCard title="Premium by insurer (₹)" className="lg:col-span-2">{sales ? (sales.byInsurer.length ? <BarBox data={sales.byInsurer} horizontal format={(v) => inr(v)} /> : <EmptyChart text="No insurer recorded on orders yet" />) : loading}</ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-5 space-y-4">
          <KpiGrid loading={!sales} items={sales ? [
            { label: "Collected", value: inr(sales.payments.collected), hint: rangeLabel },
            { label: "Outstanding", value: inr(sales.payments.outstanding) },
            { label: "Overdue", value: inr(sales.payments.overdue), hint: `${sales.payments.overdueCount} orders` },
            { label: "Collection rate", value: pctLabel(sales.payments.collected, sales.payments.collected + sales.payments.outstanding), hint: "collected ÷ (collected + outstanding)" },
          ] : []} />
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Collected per month (₹)" className="lg:col-span-2">{sales ? <BarBox data={sales.collectedByMonth} format={(v) => inr(v)} /> : loading}</ChartCard>
            <ChartCard title="By payment mode">{sales ? (sales.byMode.length ? <PieBox data={sales.byMode} /> : <EmptyChart />) : loading}</ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="calls" className="mt-5 space-y-4">
          <p className="text-xs text-muted-foreground">AI calls aren't owned by a person, so the team filter doesn't apply here.</p>
          <KpiGrid columns={6} loading={!callView} items={callView ? [
            { label: "Calls placed", value: callView.kpi.total.toLocaleString(), hint: rangeLabel },
            { label: "Connect rate", value: callView.kpi.connectRate },
            { label: "Avg. talk time", value: duration(callView.kpi.avgDuration) },
            { label: "Positive outcomes", value: callView.kpi.positive },
            { label: "Orders from calls", value: callView.ordersFromCalls },
            { label: "KYC from calls", value: callView.kycFromCalls },
          ] : []} />
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Calls vs connected" className="lg:col-span-2">{callView ? <TrendBox data={callView.overTime} xKey="day" series={[{ key: "calls", label: "Calls" }, { key: "connected", label: "Connected" }]} /> : loading}</ChartCard>
            <ChartCard title="Call outcomes">{callView ? (callView.dispositions.length ? <PieBox data={callView.dispositions.slice(0, 8)} /> : <EmptyChart />) : loading}</ChartCard>
          </div>
          {callView && callView.agents.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5">Voice agent</th><th className="px-4 py-2.5 text-right">Calls</th><th className="px-4 py-2.5 text-right">Connected</th>
                  <th className="px-4 py-2.5 text-right">Connect rate</th><th className="px-4 py-2.5 text-right">Avg. talk</th><th className="px-4 py-2.5 text-right">Positive</th>
                </tr></thead>
                <tbody>{callView.agents.map((a) => (
                  <tr key={a.name} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{a.name}</td><td className="px-4 py-3 text-right tabular-nums">{a.calls}</td><td className="px-4 py-3 text-right tabular-nums">{a.connected}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{a.rate}%</td><td className="px-4 py-3 text-right tabular-nums">{duration(a.avgDuration)}</td><td className="px-4 py-3 text-right tabular-nums">{a.positive}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="kyc" className="mt-5 space-y-4">
          {!isSalesRole(role) ? <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">KYC reports are limited to the sales team.</p> : (
            <>
              <KpiGrid loading={!kycView} items={kycView ? [
                { label: "KYC records", value: kycView.total, hint: `updated · ${rangeLabel}` },
                { label: "From AI calls", value: kycView.fromCalls, hint: pctLabel(kycView.fromCalls, kycView.total) },
                { label: "Needs review", value: kycView.review },
                { label: "Verified", value: kycView.verified, hint: pctLabel(kycView.verified, kycView.total) },
              ] : []} />
              <div className="grid gap-4 lg:grid-cols-3">
                <ChartCard title="By status">{kycView ? (kycView.byStatus.length ? <PieBox data={kycView.byStatus} /> : <EmptyChart />) : loading}</ChartCard>
                <ChartCard title="How complete are the records?" className="lg:col-span-2">{kycView ? (kycView.total ? <BarBox data={kycView.completeness} /> : <EmptyChart />) : loading}</ChartCard>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-5 space-y-3">
          <p className="text-xs text-muted-foreground">Own = orders the person owns. Team = them plus everyone who reports to them (set reporting lines on Team Management). Cancelled orders don't count. Period: {rangeLabel}.</p>
          {!members.data || !orders.data ? loading : board.length === 0 ? <EmptyChart text="No team members in this view" /> : (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5">Person</th><th className="px-4 py-2.5 text-right">Orders</th><th className="px-4 py-2.5 text-right">Issued</th>
                  <th className="px-4 py-2.5 text-right">Premium</th><th className="px-4 py-2.5 text-right">Collected</th>
                  <th className="border-l px-4 py-2.5 text-right">Team orders</th><th className="px-4 py-2.5 text-right">Team premium</th><th className="px-4 py-2.5 text-right">Team collected</th>
                </tr></thead>
                <tbody>{board.map((m) => (
                  <tr key={m.user_id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div style={{ paddingLeft: m.depth * 20 }} className="flex items-center gap-2">
                        {m.depth > 0 && <span className="text-muted-foreground" aria-hidden>└</span>}
                        <div><p className="font-medium">{m.name}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}{m.team.size > 1 ? ` · team of ${m.team.size}` : ""}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.own.orders}</td><td className="px-4 py-3 text-right tabular-nums">{m.own.issued}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(m.own.premium)}</td><td className="px-4 py-3 text-right tabular-nums">{inr(m.own.collected)}</td>
                    <td className="border-l px-4 py-3 text-right font-semibold tabular-nums">{m.team.size > 1 ? m.team.orders : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{m.team.size > 1 ? inr(m.team.premium) : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{m.team.size > 1 ? inr(m.team.collected) : "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
