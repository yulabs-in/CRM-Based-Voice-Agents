import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, X } from "lucide-react";
import { useOrg } from "@/lib/org";
import { getOrgBudgetStatus } from "@/lib/usage.functions";
import { formatInr } from "@/lib/usage";

const BANNER_ROLES = new Set(["owner", "admin", "sales_manager"]);

function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function BudgetBanner() {
  const { org, role } = useOrg();
  const fetchBudget = useServerFn(getOrgBudgetStatus);
  const canSeeBanner = BANNER_ROLES.has(role);
  const storageKey = `yulabs.budgetBannerDismissed.${org.id}`;
  const today = todayIst();

  const [dismissedDay, setDismissedDay] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const query = useQuery({
    queryKey: ["budget-status", org.id],
    enabled: canSeeBanner,
    staleTime: 60_000,
    queryFn: () => fetchBudget({ data: { organizationId: org.id } }),
  });

  const status = query.data;
  if (!canSeeBanner || dismissedDay === today || !status || !status.budget || status.level === "ok") {
    return null;
  }

  const exceeded = status.level === "exceeded";

  function dismiss() {
    setDismissedDay(today);
    try {
      localStorage.setItem(storageKey, today);
    } catch {
      // ignore storage errors
    }
  }

  return (
    <div
      role="alert"
      className={`mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
        exceeded
          ? "border-destructive/30 bg-danger-soft text-destructive"
          : "border-warning/30 bg-warning-soft text-warning"
      }`}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1">
        You&apos;ve used <span className="font-semibold">{Math.round(status.percent)}%</span> of this month&apos;s calling budget (
        <span className="font-semibold">{formatInr(status.spent)}</span> of{" "}
        <span className="font-semibold">{formatInr(status.budget)}</span>).{" "}
        <Link to="/usage" className="underline underline-offset-2 font-medium">
          View usage
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss budget warning for today"
        className="rounded-lg p-1 opacity-70 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
