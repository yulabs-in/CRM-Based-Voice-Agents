import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  good: "bg-success-soft text-success", warn: "bg-warning-soft text-warning", bad: "bg-danger-soft text-destructive",
  info: "bg-accent text-accent-foreground", muted: "bg-muted text-muted-foreground",
};
const map: Record<string, keyof typeof tone> = {
  active: "good", won: "good", done: "good", qualified: "good", converted: "good",
  new: "info", qualification: "info", open: "info", contacted: "info", proposal: "warn", negotiation: "warn",
  high: "bad", lost: "bad", unqualified: "bad", inactive: "muted", medium: "warn", low: "muted", in_progress: "warn",
};

export function StatusBadge({ value }: { value?: unknown }) {
  const v = String(value ?? "");
  if (!v) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", tone[map[v] ?? "muted"])}>{v.replace(/_/g, " ")}</span>;
}
