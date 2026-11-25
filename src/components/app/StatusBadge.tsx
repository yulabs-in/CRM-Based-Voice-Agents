import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  good: "bg-success-soft text-success", warn: "bg-warning-soft text-warning", bad: "bg-danger-soft text-destructive",
  info: "bg-accent text-accent-foreground", muted: "bg-muted text-muted-foreground",
};
const map: Record<string, keyof typeof tone> = {
  active: "good", won: "good", done: "good", qualified: "good", converted: "good", completed: "good", positive: "good", running: "good", connected: "good",
  new: "info", qualification: "info", open: "info", contacted: "info", queued: "info", scheduled: "info", pending: "info", processing: "info", outbound: "info", inbound: "info", calling: "info",
  proposal: "warn", negotiation: "warn", medium: "warn", in_progress: "warn", retrying: "warn", paused: "warn", no_answer: "warn", busy: "warn", neutral: "warn", launching: "warn",
  high: "bad", lost: "bad", unqualified: "bad", failed: "bad", negative: "bad", cancelled: "bad",
  inactive: "muted", low: "muted", draft: "muted", archived: "muted", excluded: "muted", ended: "muted",
  // sales orders, payments, KYC
  issued: "good", paid: "good", verified: "good", received: "good", confirmed: "info", collected: "info",
  partial: "warn", partly_paid: "warn", refunded: "warn", overdue: "bad", rejected: "bad", lapsed: "bad", not_set: "muted",
};

export function StatusBadge({ value }: { value?: unknown }) {
  const v = String(value ?? "");
  if (!v) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", tone[map[v] ?? "muted"])}>{v.replace(/_/g, " ")}</span>;
}
