import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, ReceiptText } from "lucide-react";
import { EntityPage, useRefs, type Row } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { OrderSheet } from "@/components/app/OrderSheet";
import { EVERYONE, TeamFilter, useTeamScope } from "@/components/app/TeamFilter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inr, shortDate } from "@/lib/format";
import { pageHead } from "@/lib/seo";
import { ORDER_STATUSES, PAYMENT_FREQUENCIES, PRODUCT_TYPES, labelOf, paymentState } from "@/lib/sales-ops";
import { useKyc, useMembers, usePayments, useSalesOrders, type SalesOrder, NO_MEMBERS } from "@/lib/sales-data";

export const Route = createFileRoute("/_authenticated/_app/sales-orders")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean; order?: string } => ({
    new: s.new === true || s.new === "true" ? true : undefined,
    order: typeof s.order === "string" ? s.order : undefined,
  }),
  head: () => pageHead("Sales Orders", "Policy orders, premiums and their payment status."),
  component: Page,
});

const TABS = [{ value: "open", label: "Open" }, { value: "draft", label: "Drafts" }, { value: "issued", label: "Issued" }, { value: "all", label: "All" }];

function Page() {
  const s = Route.useSearch();
  const nav = useNavigate();
  const [tab, setTab] = useState("open");
  const [team, setTeam] = useState(EVERYONE);
  const members = useMembers();
  const memberList = members.data ?? NO_MEMBERS;
  const inScope = useTeamScope(memberList, team);
  const names = useMemo(() => new Map(memberList.map((m) => [m.user_id, m.name])), [memberList]);
  const orders = useSalesOrders();
  const payments = usePayments();
  const kyc = useKyc();
  const refs = useRefs(["contacts"]);
  const selected = (orders.data ?? []).find((o) => o.id === s.order) ?? null;
  const open = (id?: string) => nav({ to: "/sales-orders", search: id ? { order: id } : {} });

  const rowFilter = (r: Row) => {
    const status = String(r.status);
    const tabOk = tab === "all" || (tab === "open" ? status === "draft" || status === "confirmed" : status === tab);
    return tabOk && inScope(r.owner_id as string | null);
  };

  return (
    <>
      <EntityPage table="sales_orders" title="Sales Orders" singular="Order" icon={ReceiptText}
        description="Policy orders from your team and from AI calls, with premium and payment status."
        openNew={s.new} onCloseNew={() => nav({ to: "/sales-orders", search: {} })}
        searchKeys={["order_number", "plan_name", "insurer", "policy_number", "product_type"]}
        onRowClick={(r) => open(r.id)}
        rowFilter={rowFilter}
        emptyHint="Orders appear here when a customer says yes on an AI call, or add one yourself."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={tab} onValueChange={setTab}><TabsList>{TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList></Tabs>
            <TeamFilter members={memberList} value={team} onChange={setTeam} />
          </div>
        }
        fields={[
          { key: "contact_id", label: "Client", type: "ref", refTable: "contacts", full: true },
          { key: "product_type", label: "Product", type: "select", options: PRODUCT_TYPES },
          { key: "status", label: "Status", type: "select", options: ORDER_STATUSES },
          { key: "plan_name", label: "Plan" }, { key: "insurer", label: "Insurer" },
          { key: "premium_amount", label: "Premium (₹)", type: "number" }, { key: "sum_insured", label: "Sum insured (₹)", type: "number" },
          { key: "payment_frequency", label: "Payment frequency", type: "select", options: PAYMENT_FREQUENCIES },
          { key: "payment_due_date", label: "Payment due", type: "date" },
          { key: "policy_number", label: "Policy number" },
          { key: "policy_start_date", label: "Policy start", type: "date" }, { key: "policy_end_date", label: "Policy end (renewal date)", type: "date" },
          { key: "notes", label: "Notes", type: "textarea" },
        ]}
        defaults={{ status: "draft", product_type: "health", payment_frequency: "yearly", premium_amount: 0 }}
        columns={[
          { key: "order_number", label: "Order", render: (r) => (
            <span className="inline-flex items-center gap-1.5 font-semibold">{String(r.order_number)}{r.source === "ai_call" && <Bot className="size-3.5 text-primary" aria-label="From AI call" />}</span>
          ) },
          { key: "contact_id", label: "Client", render: (r, refMap) => refMap.contacts?.get(String(r.contact_id)) ?? "—" },
          { key: "product_type", label: "Product", render: (r) => <span>{labelOf(PRODUCT_TYPES, r.product_type)}{r.insurer ? <span className="text-muted-foreground"> · {String(r.insurer)}</span> : null}</span> },
          { key: "premium_amount", label: "Premium", render: (r) => Number(r.premium_amount) > 0 ? <span className="font-semibold">{inr(r.premium_amount)}</span> : <span className="text-muted-foreground">Not set</span> },
          { key: "payment", label: "Payment", render: (r) => {
            const state = paymentState(r as unknown as SalesOrder);
            return <StatusBadge value={state === "partial" ? "partly_paid" : state} />;
          } },
          { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          { key: "owner_id", label: "Owner", render: (r) => names.get(String(r.owner_id)) ?? <span className="text-muted-foreground">Unassigned</span> },
          { key: "policy_end_date", label: "Renews", render: (r) => shortDate(r.policy_end_date) },
        ]}
      />
      <OrderSheet
        order={selected}
        payments={payments.data ?? []}
        members={memberList}
        kyc={(kyc.data ?? []).find((k) => k.contact_id === selected?.contact_id) ?? null}
        contactName={(selected?.contact_id && refs.data?.contacts?.get(selected.contact_id)) || "No client linked"}
        onClose={() => open()}
      />
    </>
  );
}
