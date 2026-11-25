import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Loader2, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "./StatusBadge";
import { canDelete, useOrg } from "@/lib/org";
import { inr, shortDate } from "@/lib/format";
import {
  KYC_STATUSES, PAYMENT_FREQUENCIES, PAYMENT_MODES, PAYMENT_STATE_LABEL, PRODUCT_TYPES, balanceDue, daysToRenewal, labelOf, paymentState,
} from "@/lib/sales-ops";
import { isSalesRole, type Kyc, type Member, type Payment, type SalesOrder } from "@/lib/sales-data";

const NONE = "__none";
const today = () => new Date().toISOString().slice(0, 10);

/** Side panel for one sales order: summary, payment progress, payments, record a payment, owner. */
export function OrderSheet({ order, payments, members, kyc, contactName, onClose }: {
  order: SalesOrder | null; payments: Payment[]; members: Member[]; kyc: Kyc | null; contactName: string; onClose: () => void;
}) {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const canEdit = isSalesRole(role);
  const refresh = () => {
    for (const key of ["sales_orders", "payments", "sales", "stats"]) void qc.invalidateQueries({ queryKey: [key] });
  };

  const setOwner = useMutation({
    mutationFn: async (ownerId: string | null) => {
      const { error } = await supabase.from("sales_orders").update({ owner_id: ownerId }).eq("id", order!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Owner updated"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const setPaymentStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("payments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment updated"); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const removePayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment deleted"); refresh(); },
    onError: (e) => toast.error(e.message),
  });

  if (!order) return <Sheet open={false} onOpenChange={() => onClose()}><SheetContent /></Sheet>;
  const state = paymentState(order);
  const premium = Number(order.premium_amount);
  const paidPct = premium > 0 ? Math.min(100, Math.round((Number(order.amount_paid) / premium) * 100)) : 0;
  const days = daysToRenewal(order);
  const orderPayments = payments.filter((p) => p.sales_order_id === order.id);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {order.order_number} <StatusBadge value={order.status} />
            {order.source === "ai_call" && <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground"><Bot className="size-3" /> From AI call</span>}
          </SheetTitle>
          <SheetDescription>{contactName} · {labelOf(PRODUCT_TYPES, order.product_type)}{order.insurer ? ` · ${order.insurer}` : ""}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6 px-1">
          <section className="rounded-2xl border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">Payment</p>
              <StatusBadge value={state === "partial" ? "partly_paid" : state} />
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight">{inr(order.amount_paid)} <span className="text-sm font-medium text-muted-foreground">of {premium > 0 ? inr(premium) : "premium not set"}</span></p>
            <Progress value={paidPct} className="mt-3 h-2" aria-label={`${paidPct}% paid`} />
            <p className="mt-2 text-xs text-muted-foreground">
              {PAYMENT_STATE_LABEL[state]}
              {balanceDue(order) > 0 && ` · ${inr(balanceDue(order))} due`}
              {order.payment_due_date && ` · due ${shortDate(order.payment_due_date)}`}
              {` · ${labelOf(PAYMENT_FREQUENCIES, order.payment_frequency)}`}
            </p>
          </section>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Item label="Plan" value={order.plan_name} />
            <Item label="Sum insured" value={order.sum_insured ? inr(order.sum_insured) : null} />
            <Item label="Policy number" value={order.policy_number} />
            <Item label="Policy period" value={order.policy_start_date || order.policy_end_date ? `${shortDate(order.policy_start_date)} – ${shortDate(order.policy_end_date)}` : null} />
            <Item label="Renewal" value={days === null ? null : days < 0 ? `Lapsed ${-days} days ago` : `In ${days} days`} />
            <Item label="Created" value={shortDate(order.created_at)} />
          </dl>

          <section className="space-y-2">
            <Label>Owner</Label>
            <Select value={order.owner_id ?? NONE} disabled={!canEdit || setOwner.isPending} onValueChange={(v) => setOwner.mutate(v === NONE ? null : v)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </section>

          <section className="flex items-center gap-3 rounded-2xl border p-3 text-sm">
            <ShieldCheck className="size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Client KYC</p>
              <p className="text-xs text-muted-foreground">{kyc ? `${kyc.status === "collected" ? "Collected, needs review" : labelOf(KYC_STATUSES, kyc.status)}${kyc.source === "ai_call" ? " · from AI call" : ""}` : "Not collected yet"}</p>
            </div>
            {kyc && <StatusBadge value={kyc.status} />}
            <Button asChild variant="outline" size="sm"><Link to="/kyc">Open KYC</Link></Button>
          </section>

          {order.notes && (
            <section>
              <p className="text-sm font-semibold">Notes</p>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{order.notes}</p>
            </section>
          )}

          <section>
            <p className="text-sm font-semibold">Payments ({orderPayments.length})</p>
            {orderPayments.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="mt-2 divide-y rounded-xl border">
                {orderPayments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{inr(p.amount)} <span className="font-normal text-muted-foreground">· {labelOf(PAYMENT_MODES, p.mode)} · {shortDate(p.paid_on)}</span></p>
                      {p.reference && <p className="truncate text-xs text-muted-foreground">Ref {p.reference}</p>}
                    </div>
                    <StatusBadge value={p.status} />
                    {canEdit && p.status === "received" && (
                      <Button variant="ghost" size="icon" aria-label="Mark refunded" title="Mark refunded" onClick={() => confirm("Mark this payment as refunded?") && setPaymentStatus.mutate({ id: p.id, status: "refunded" })}><RotateCcw /></Button>
                    )}
                    {canDelete(role) && (
                      <Button variant="ghost" size="icon" aria-label="Delete payment" title="Delete payment" onClick={() => confirm("Delete this payment record?") && removePayment.mutate(p.id)}><Trash2 /></Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canEdit && order.status !== "cancelled" && <RecordPayment orgId={org.id} order={order} onSaved={refresh} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Item({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{value || "—"}</dd></div>;
}

/** Record a payment the client made (UPI, card, cheque…). Only the transaction reference is stored, never card or bank numbers. */
export function RecordPayment({ orgId, order, onSaved }: { orgId: string; order: SalesOrder; onSaved: () => void }) {
  const due = balanceDue(order);
  const [form, setForm] = useState({ amount: due > 0 ? String(due) : "", paid_on: today(), mode: "upi", reference: "" });
  const save = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      if (!(amount > 0)) throw new Error("Enter an amount above zero");
      const { error } = await supabase.from("payments").insert({
        organization_id: orgId, sales_order_id: order.id, amount, paid_on: form.paid_on, mode: form.mode, reference: form.reference.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment recorded"); setForm((f) => ({ ...f, amount: "", reference: "" })); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }} className="space-y-3 rounded-2xl border bg-muted/30 p-4">
      <p className="text-sm font-semibold">Record a payment</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="pay-amount">Amount (₹)</Label><Input id="pay-amount" type="number" min={1} step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-xl" /></div>
        <div className="space-y-1.5"><Label htmlFor="pay-date">Paid on</Label><Input id="pay-date" type="date" required max={today()} value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} className="rounded-xl" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-mode">Mode</Label>
          <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
            <SelectTrigger id="pay-mode" className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="pay-ref">Reference (UTR / txn id)</Label><Input id="pay-ref" maxLength={80} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="rounded-xl" placeholder="Optional" /></div>
      </div>
      <p className="text-xs text-muted-foreground">Never enter card numbers, bank account numbers or OTPs here.</p>
      <Button type="submit" variant="hero" disabled={save.isPending}>{save.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Record payment</Button>
    </form>
  );
}
