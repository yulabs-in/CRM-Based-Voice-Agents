import { Link } from "@tanstack/react-router";
import { ReceiptText } from "lucide-react";
import { KpiGrid } from "./charts";
import { inr } from "@/lib/format";
import { daysToRenewal, paymentSummary, renewalWindow, renewalsDue } from "@/lib/sales-ops";
import { usePayments, useSalesOrders } from "@/lib/sales-data";

/** Overview strip: orders, premium, payment status and renewals for the chosen period. */
export function SalesOverview({ start }: { start: Date }) {
  const orders = useSalesOrders();
  const payments = usePayments();
  const ready = !!orders.data && !!payments.data;
  const booked = (orders.data ?? []).filter((o) => o.status !== "cancelled" && new Date(o.created_at) >= start);
  const summary = paymentSummary(orders.data ?? [], payments.data ?? [], start);
  const renewals = renewalsDue(orders.data ?? []).filter((o) => ["week", "month"].includes(renewalWindow(daysToRenewal(o)))).length;
  const link = (to: "/sales-orders" | "/payments" | "/renewals", text: string) => <Link to={to} className="text-primary hover:underline">{text}</Link>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ReceiptText className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Sales & payments</h2>
        <Link to="/reports" className="ml-auto text-xs font-medium text-primary hover:underline">Full reports</Link>
      </div>
      <KpiGrid columns={6} loading={!ready} items={[
        { label: "Orders booked", value: booked.length, hint: link("/sales-orders", `${booked.filter((o) => o.source === "ai_call").length} from AI calls`) },
        { label: "Premium booked", value: inr(booked.reduce((s, o) => s + Number(o.premium_amount), 0)) },
        { label: "Collected", value: inr(summary.collected), hint: link("/payments", "Payments") },
        { label: "Outstanding", value: inr(summary.outstanding) },
        { label: "Overdue", value: inr(summary.overdue), hint: `${summary.overdueCount} order${summary.overdueCount === 1 ? "" : "s"}` },
        { label: "Renewals due", value: renewals, hint: link("/renewals", "next 30 days") },
      ]} />
    </div>
  );
}
