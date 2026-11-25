import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { BarBox, ChartCard, EmptyChart, KpiGrid, PieBox } from "@/components/app/charts";
import { EVERYONE, TeamFilter, useTeamScope } from "@/components/app/TeamFilter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadCsv } from "@/lib/csv";
import { inr, shortDate } from "@/lib/format";
import { rangeStart, RANGES, type RangeKey } from "@/lib/ranges";
import { pageHead } from "@/lib/seo";
import {
  PAYMENT_MODES, PAYMENT_STATE_LABEL, balanceDue, groupSum, labelOf, lastMonths, paymentState, paymentSummary, type PaymentState,
} from "@/lib/sales-ops";
import { useContactsById, useMembers, usePayments, useSalesOrders, NO_MEMBERS } from "@/lib/sales-data";

export const Route = createFileRoute("/_authenticated/_app/payments")({
  head: () => pageHead("Payments", "What's been collected, what's due and what's overdue."),
  component: PaymentsPage,
});

const ALL_TIME = "all";
const QUEUE_TABS: { value: "due" | PaymentState; label: string }[] = [
  { value: "due", label: "All due" }, { value: "overdue", label: "Overdue" }, { value: "partial", label: "Partly paid" }, { value: "pending", label: "Pending" },
];
const SEVERITY: Record<PaymentState, number> = { overdue: 0, partial: 1, pending: 2, not_set: 3, paid: 4, cancelled: 5 };

function PaymentsPage() {
  const [range, setRange] = useState<RangeKey | typeof ALL_TIME>("month");
  const [team, setTeam] = useState(EVERYONE);
  const [queue, setQueue] = useState<"due" | PaymentState>("due");
  const orders = useSalesOrders();
  const payments = usePayments();
  const members = useMembers();
  const memberList = members.data ?? NO_MEMBERS;
  const inScope = useTeamScope(memberList, team);
  const contacts = useContactsById((orders.data ?? []).map((o) => o.contact_id));

  const view = useMemo(() => {
    if (!orders.data || !payments.data) return null;
    const scoped = orders.data.filter((o) => inScope(o.owner_id));
    const ids = new Set(scoped.map((o) => o.id));
    const scopedPayments = payments.data.filter((p) => ids.has(p.sales_order_id));
    const since = range === ALL_TIME ? null : rangeStart(range);
    const inRange = scopedPayments.filter((p) => !since || new Date(`${p.paid_on}T00:00:00`) >= since);
    const summary = paymentSummary(scoped, scopedPayments, since);
    const received = (rows: typeof scopedPayments) => rows.filter((p) => p.status === "received");
    const months = lastMonths(6);
    const byMonth = months.map((m) => ({
      name: m.label,
      value: received(scopedPayments).filter((p) => p.paid_on.startsWith(m.key)).reduce((sum, p) => sum + Number(p.amount), 0),
    }));
    const live = scoped.filter((o) => o.status === "confirmed" || o.status === "issued");
    const due = live
      .map((o) => ({ o, state: paymentState(o) }))
      .filter(({ state }) => state === "overdue" || state === "partial" || state === "pending")
      .sort((a, b) => SEVERITY[a.state] - SEVERITY[b.state] || String(a.o.payment_due_date ?? "9999").localeCompare(String(b.o.payment_due_date ?? "9999")));
    const notSet = live.filter((o) => paymentState(o) === "not_set").length;
    return {
      summary, byMonth, due, notSet,
      byMode: groupSum(received(inRange), (p) => labelOf(PAYMENT_MODES, p.mode), (p) => Number(p.amount)),
      recent: inRange.slice(0, 15),
      orderById: new Map(scoped.map((o) => [o.id, o])),
    };
  }, [orders.data, payments.data, inScope, range]);

  const name = (contactId: string | null) => (contactId && contacts.data?.get(contactId)?.name) || "No client linked";
  const owner = (id: string | null) => memberList.find((m) => m.user_id === id)?.name ?? "Unassigned";
  const queueRows = (view?.due ?? []).filter(({ state }) => queue === "due" || state === queue);
  const rangeLabel = range === ALL_TIME ? "All time" : RANGES.find((r) => r.key === range)!.label;

  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Payments" description="What's been collected, what's still due and what's overdue — from the payments your team records on each order.">
        <TeamFilter members={memberList} value={team} onChange={setTeam} />
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey | typeof ALL_TIME)}>
          <SelectTrigger className="w-40 rounded-xl bg-card" aria-label="Date range"><SelectValue /></SelectTrigger>
          <SelectContent>{RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}<SelectItem value={ALL_TIME}>All time</SelectItem></SelectContent>
        </Select>
        <Button variant="outline" className="bg-card" disabled={!view?.due.length} onClick={() => view && downloadCsv("payments-due.csv", view.due.map(({ o, state }) => ({
          order: o.order_number, client: name(o.contact_id), owner: owner(o.owner_id), premium: o.premium_amount, paid: o.amount_paid,
          balance: balanceDue(o), status: PAYMENT_STATE_LABEL[state], due_date: o.payment_due_date ?? "",
        })))}><Download /> Export due list</Button>
      </PageHeader>

      <KpiGrid loading={!view} items={view ? [
        { label: "Collected", value: inr(view.summary.collected), hint: rangeLabel },
        { label: "Outstanding", value: inr(view.summary.outstanding), hint: "confirmed & issued orders" },
        { label: "Overdue", value: inr(view.summary.overdue), hint: `${view.summary.overdueCount} order${view.summary.overdueCount === 1 ? "" : "s"} past due date` },
        { label: "Fully paid", value: view.summary.paidCount, hint: `${view.summary.partialCount} partly paid` },
      ] : []} />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Collected per month (₹)" className="lg:col-span-2">
          {view ? (view.byMonth.some((m) => m.value > 0) ? <BarBox data={view.byMonth} format={(v) => inr(v)} /> : <EmptyChart text="No payments recorded yet" />) : <Skeleton className="h-60" />}
        </ChartCard>
        <ChartCard title={`By payment mode · ${rangeLabel}`}>
          {view ? (view.byMode.length ? <PieBox data={view.byMode} /> : <EmptyChart />) : <Skeleton className="h-60" />}
        </ChartCard>
      </div>

      <div className="rounded-2xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <p className="text-sm font-semibold">Needs payment</p>
          <Tabs value={queue} onValueChange={(v) => setQueue(v as typeof queue)}>
            <TabsList>{QUEUE_TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList>
          </Tabs>
          {!!view?.notSet && <span className="ml-auto text-xs text-muted-foreground">{view.notSet} order{view.notSet === 1 ? " has" : "s have"} no premium set yet</span>}
        </div>
        {!view ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : queueRows.length === 0 ? (
          <div className="dot-canvas m-3 rounded-xl border border-dashed py-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><Wallet /></span>
            <p className="mt-3 font-semibold">Nothing due here</p>
            <p className="mt-1 text-sm text-muted-foreground">Confirmed and issued orders with a balance show up here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Order</th><th className="px-4 py-2.5 font-semibold">Client</th><th className="px-4 py-2.5 font-semibold">Owner</th>
                <th className="px-4 py-2.5 text-right font-semibold">Balance</th><th className="px-4 py-2.5 font-semibold">Due</th><th className="px-4 py-2.5 font-semibold">Status</th>
              </tr></thead>
              <tbody>
                {queueRows.map(({ o, state }) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/60">
                    <td className="px-4 py-3"><Link to="/sales-orders" search={{ order: o.id }} className="font-semibold text-primary hover:underline">{o.order_number}</Link></td>
                    <td className="px-4 py-3">{name(o.contact_id)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{owner(o.owner_id)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{inr(balanceDue(o))}<span className="block text-xs font-normal text-muted-foreground">of {inr(o.premium_amount)}</span></td>
                    <td className="px-4 py-3">{shortDate(o.payment_due_date)}</td>
                    <td className="px-4 py-3"><StatusBadge value={state === "partial" ? "partly_paid" : state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-card shadow-soft">
        <p className="border-b px-4 py-3 text-sm font-semibold">Recent payments · {rangeLabel}</p>
        {view && view.recent.length ? (
          <ul className="divide-y">
            {view.recent.map((p) => {
              const o = view.orderById.get(p.sales_order_id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-24 shrink-0 text-muted-foreground">{shortDate(p.paid_on)}</span>
                  <span className="min-w-0 flex-1 truncate">{o ? <Link to="/sales-orders" search={{ order: o.id }} className="font-medium hover:text-primary">{o.order_number}</Link> : "—"} · {name(o?.contact_id ?? null)}</span>
                  <span className="text-muted-foreground">{labelOf(PAYMENT_MODES, p.mode)}</span>
                  <span className="w-28 text-right font-semibold tabular-nums">{p.status === "refunded" ? "−" : ""}{inr(p.amount)}</span>
                  <StatusBadge value={p.status} />
                </li>
              );
            })}
          </ul>
        ) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">{view ? "No payments in this period." : "Loading…"}</p>}
      </div>
    </div>
  );
}
