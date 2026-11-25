import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, PhoneCall, RefreshCw, RotateCw } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { KpiGrid } from "@/components/app/charts";
import { EVERYONE, TeamFilter, useTeamScope } from "@/components/app/TeamFilter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { downloadCsv } from "@/lib/csv";
import { inr, shortDate } from "@/lib/format";
import { pageHead } from "@/lib/seo";
import { startSarvamCall } from "@/lib/sarvam.functions";
import { SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";
import {
  PRODUCT_TYPES, daysToRenewal, labelOf, renewalWindow, renewalsDue, type RenewalWindow,
} from "@/lib/sales-ops";
import { isSalesRole, useContactsById, useMembers, useSalesOrders, type SalesOrder, NO_MEMBERS } from "@/lib/sales-data";

export const Route = createFileRoute("/_authenticated/_app/renewals")({
  head: () => pageHead("Renewals", "Policies coming up for renewal, with one-click AI renewal calls."),
  component: RenewalsPage,
});

const TABS: { value: RenewalWindow | "due"; label: string }[] = [
  { value: "due", label: "Next 30 days" }, { value: "week", label: "This week" }, { value: "overdue", label: "Lapsed" }, { value: "quarter", label: "31–90 days" },
];

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const addYear = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

function RenewalsPage() {
  const { org, role } = useOrg();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canAct = isSalesRole(role);
  const [tab, setTab] = useState<RenewalWindow | "due">("due");
  const [team, setTeam] = useState(EVERYONE);
  const [agentId, setAgentId] = useState("");
  const orders = useSalesOrders();
  const members = useMembers();
  const memberList = members.data ?? NO_MEMBERS;
  const inScope = useTeamScope(memberList, team);
  const due = useMemo(() => renewalsDue(orders.data ?? []).filter((o) => inScope(o.owner_id)), [orders.data, inScope]);
  const contacts = useContactsById(due.map((o) => o.contact_id));
  const dial = useServerFn(startSarvamCall);

  const agents = useQuery({
    queryKey: ["call-agents", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("voice_agents").select("id, name, sarvam_agent_id").eq("organization_id", org.id).eq("status", "active").order("created_at");
      if (error) throw error;
      // Renewal calls use call track B of the insurance script, so list the insurance agent first.
      return [...data].sort((a, b) => Number(b.sarvam_agent_id === SARVAM_DEFAULTS.agentId) - Number(a.sarvam_agent_id === SARVAM_DEFAULTS.agentId));
    },
  });
  const agent = agentId || agents.data?.[0]?.id || "";

  const rows = useMemo(() => due
    .map((o) => ({ o, days: daysToRenewal(o)! }))
    .filter(({ days }) => days >= -30)
    .filter(({ days }) => {
      const w = renewalWindow(days);
      return tab === "due" ? w === "week" || w === "month" : w === tab;
    })
    .sort((a, b) => a.days - b.days), [due, tab]);

  const counts = useMemo(() => {
    const windows = due.map((o) => renewalWindow(daysToRenewal(o)));
    const premium = due.filter((o) => ["week", "month"].includes(renewalWindow(daysToRenewal(o)))).reduce((s, o) => s + Number(o.premium_amount), 0);
    return { week: windows.filter((w) => w === "week").length, month: windows.filter((w) => w === "week" || w === "month").length, overdue: windows.filter((w) => w === "overdue").length, premium };
  }, [due]);

  /** AI renewal call: tells the agent this is a renewal (call track B) with the policy details, then dials. */
  const call = useMutation({
    mutationFn: async (order: SalesOrder) => {
      const contact = order.contact_id ? contacts.data?.get(order.contact_id) : undefined;
      if (!contact?.phone) throw new Error("This client has no phone number saved");
      if (!agent) throw new Error("Add an active voice agent first");
      const custom = {
        ...(contact.custom_fields ?? {}), call_track: "B", interest: labelOf(PRODUCT_TYPES, order.product_type).toLowerCase(),
        current_insurer: order.insurer ?? "", renewal_date: shortDate(order.policy_end_date),
      };
      const { error } = await supabase.from("contacts").update({ custom_fields: custom as never }).eq("id", contact.id);
      if (error) throw error;
      return dial({ data: { organizationId: org.id, agentId: agent, phone: contact.phone, contactId: contact.id, consentConfirmed: true, isTest: false } });
    },
    onSuccess: () => { toast.success("Renewal call started — results land on the order's client when it ends"); void qc.invalidateQueries({ queryKey: ["calls"] }); },
    onError: (e) => toast.error(e.message),
  });

  /** Creates the next year's order as a draft, linked to this one, and opens it. */
  const renew = useMutation({
    mutationFn: async (order: SalesOrder) => {
      const start = order.policy_end_date ? addDays(order.policy_end_date, 1) : null;
      const { data, error } = await supabase.from("sales_orders").insert({
        organization_id: org.id, contact_id: order.contact_id, deal_id: order.deal_id, owner_id: order.owner_id, product_type: order.product_type,
        plan_name: order.plan_name, insurer: order.insurer, premium_amount: order.premium_amount, sum_insured: order.sum_insured,
        payment_frequency: order.payment_frequency, payment_due_date: order.policy_end_date, status: "draft", renewed_from_order_id: order.id,
        policy_start_date: start, policy_end_date: start ? addYear(start) : null, order_number: "",
        notes: `Renewal of ${order.order_number}${order.policy_number ? ` (policy ${order.policy_number})` : ""}.`,
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success("Renewal order created as a draft");
      void qc.invalidateQueries({ queryKey: ["sales_orders"] });
      void nav({ to: "/sales-orders", search: { order: id } });
    },
    onError: (e) => toast.error(e.message),
  });

  const name = (o: SalesOrder) => (o.contact_id && contacts.data?.get(o.contact_id)?.name) || "No client linked";
  const owner = (id: string | null) => memberList.find((m) => m.user_id === id)?.name ?? "Unassigned";

  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Renewals" description="Issued policies ending soon. Reminder tasks are created automatically 30, 15, 7 and 1 day before the end date.">
        <TeamFilter members={memberList} value={team} onChange={setTeam} />
        {canAct && (agents.data?.length ?? 0) > 1 && (
          <Select value={agent} onValueChange={setAgentId}>
            <SelectTrigger className="w-52 rounded-xl bg-card" aria-label="Voice agent for renewal calls"><SelectValue placeholder="Voice agent" /></SelectTrigger>
            <SelectContent>{agents.data!.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Button variant="outline" className="bg-card" disabled={!rows.length} onClick={() => downloadCsv("renewals.csv", rows.map(({ o, days }) => ({
          order: o.order_number, client: name(o), product: labelOf(PRODUCT_TYPES, o.product_type), insurer: o.insurer ?? "", policy_number: o.policy_number ?? "",
          policy_end: o.policy_end_date, days_left: days, premium: o.premium_amount, owner: owner(o.owner_id),
        })))}><Download /> Export</Button>
      </PageHeader>

      <KpiGrid loading={orders.isLoading} items={[
        { label: "Due this week", value: counts.week },
        { label: "Due in 30 days", value: counts.month },
        { label: "Premium up for renewal", value: inr(counts.premium), hint: "next 30 days" },
        { label: "Lapsed", value: counts.overdue, hint: "ended, not renewed yet" },
      ]} />

      <div className="rounded-2xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}><TabsList>{TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList></Tabs>
          <span className="ml-auto text-xs text-muted-foreground">{rows.length} polic{rows.length === 1 ? "y" : "ies"}</span>
        </div>
        {orders.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <div className="dot-canvas m-3 rounded-xl border border-dashed py-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><RefreshCw /></span>
            <p className="mt-3 font-semibold">No renewals in this window</p>
            <p className="mt-1 text-sm text-muted-foreground">Issued orders with a policy end date show up here. <Link to="/sales-orders" className="text-primary">Open sales orders</Link></p>
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map(({ o, days }) => {
              const w = renewalWindow(days);
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{name(o)} <Link to="/sales-orders" search={{ order: o.id }} className="ml-1 text-xs font-medium text-primary hover:underline">{o.order_number}</Link></p>
                    <p className="text-xs text-muted-foreground">
                      {labelOf(PRODUCT_TYPES, o.product_type)}{o.insurer ? ` · ${o.insurer}` : ""}{o.policy_number ? ` · ${o.policy_number}` : ""} · {owner(o.owner_id)}
                    </p>
                  </div>
                  <div className="w-36 text-right">
                    <p className="font-semibold">{shortDate(o.policy_end_date)}</p>
                    <p className={days < 0 || days <= 7 ? "text-xs font-semibold text-destructive" : "text-xs text-muted-foreground"}>
                      {days < 0 ? `Lapsed ${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "Ends today" : `In ${days} day${days === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <span className="w-28 text-right font-semibold tabular-nums">{Number(o.premium_amount) > 0 ? inr(o.premium_amount) : "—"}</span>
                  <StatusBadge value={w === "overdue" ? "lapsed" : w === "week" ? "high" : "pending"} />
                  {canAct && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={call.isPending}
                        onClick={() => confirm(`Place an AI renewal call to ${name(o)} now? Only call clients who haven't asked not to be contacted.`) && call.mutate(o)}>
                        {call.isPending && call.variables?.id === o.id ? <Loader2 className="animate-spin" /> : <PhoneCall />} AI call
                      </Button>
                      <Button size="sm" variant="hero" disabled={renew.isPending} onClick={() => renew.mutate(o)}>
                        {renew.isPending && renew.variables?.id === o.id ? <Loader2 className="animate-spin" /> : <RotateCw />} Renew
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Renew creates next year's order as a draft linked to this one and stops further reminders for this policy. AI call tells the agent it's a renewal (with insurer and end date) before dialling.</p>
    </div>
  );
}
