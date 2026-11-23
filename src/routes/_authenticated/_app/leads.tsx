import { useCallback, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { shortDate } from "@/lib/format";
import { asAnswers, humanize } from "@/lib/sarvam-call";
import { cn } from "@/lib/utils";

const LEAD_STATUSES = ["new", "contacted", "qualified", "unqualified", "converted"];
/** People who said yes on a call (or were marked so by hand). */
const INTERESTED = new Set(["qualified", "converted"]);
/** Extra details the agent collected, shown under "Interested in". */
const DETAIL_KEYS = ["vehicle_model", "family_size", "current_insurer", "renewal_date", "trading_style", "experience_level", "consultation_mode", "preferred_language"];

type Row = Record<string, unknown> & { last_call?: { answers?: unknown; summary?: string | null; created_at?: string } | null };

export const Route = createFileRoute("/_authenticated/_app/leads")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => ({ new: s.new === true || s.new === "true" ? true : undefined }),
  head: () => ({
    meta: [
      { title: "Leads — Yulabs CRM" },
      { name: "description", content: "People interested in your services, straight from your AI calls." },
      { property: "og:title", content: "Leads — Yulabs CRM" },
      { property: "og:description", content: "People interested in your services, straight from your AI calls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const answersOf = (r: Row) => asAnswers(r.last_call?.answers);

function Page() {
  const s = Route.useSearch();
  const nav = useNavigate();
  const [view, setView] = useState<"interested" | "all">("interested");
  const rowFilter = useCallback((r: Record<string, unknown>) => view === "all" || INTERESTED.has(String(r.status)), [view]);

  return (
    <EntityPage table="leads" title="Leads" singular="Lead" icon={UserPlus}
      description="People interested in your services — added and updated from what they said on your AI calls."
      select="*, last_call:calls!leads_last_call_id_fkey(answers, summary, created_at)"
      order="updated_at"
      rowFilter={rowFilter}
      emptyHint={view === "interested" ? "When a caller says they're interested, they appear here automatically." : undefined}
      toolbar={
        <div className="flex rounded-xl border bg-muted/40 p-0.5 text-xs font-medium" role="tablist" aria-label="Lead view">
          {([["interested", "Interested"], ["all", "All"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}
              className={cn("rounded-lg px-3 py-1.5 transition-colors", view === value ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      }
      openNew={s.new} onCloseNew={() => nav({ to: "/leads", search: {} })}
      searchKeys={["name", "email", "phone", "company_name", "source"]}
      fields={[
        { key: "name", label: "Name", required: true }, { key: "company_name", label: "Company" },
        { key: "email", label: "Email", type: "email" }, { key: "phone", label: "Phone" },
        { key: "status", label: "Status", type: "select", options: LEAD_STATUSES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
        { key: "source", label: "Source", type: "select", options: ["AI call", "Website", "Referral", "Voice campaign", "Inbound call", "Ads", "Other"].map((v) => ({ value: v, label: v })) },
        { key: "score", label: "Score (0-100)", type: "number" }, { key: "value", label: "Estimated value (₹)", type: "number" },
      ]}
      defaults={{ status: "new", score: 0, value: 0 }}
      columns={[
        { key: "name", label: "Lead", render: (r) => (
          <div>
            <p className="font-semibold">{String(r.name)}</p>
            <p className="text-xs text-muted-foreground">{String(r.phone ?? r.email ?? r.company_name ?? "")}</p>
          </div>
        ) },
        { key: "interest", label: "Interested in", render: (r) => {
          const a = answersOf(r as Row);
          const product = a.insurance_type ? `${humanize(a.insurance_type)} insurance` : a.service_interest || a.market_interest || a.interest;
          const details = DETAIL_KEYS.filter((k) => a[k]).map((k) => `${humanize(k)}: ${a[k]}`);
          if (!product && !details.length) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="max-w-[14rem] space-y-1">
              {product && <span className="inline-flex rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">{humanize(product)}</span>}
              {details.length > 0 && <p className="text-xs text-muted-foreground">{details.join(" · ")}</p>}
            </div>
          );
        } },
        { key: "next", label: "Next step", render: (r) => {
          const a = answersOf(r as Row);
          if (!a.next_action && !a.follow_up_time) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="max-w-[16rem]">
              {a.follow_up_time && <p className="text-xs font-semibold text-primary">{a.follow_up_time}</p>}
              {a.next_action && <p className="line-clamp-2 text-xs text-muted-foreground" title={a.next_action}>{a.next_action}</p>}
            </div>
          );
        } },
        { key: "summary", label: "What they said", render: (r) => {
          const summary = answersOf(r as Row).summary || (r as Row).last_call?.summary;
          return summary
            ? <p className="line-clamp-2 max-w-[20rem] text-xs" title={summary}>{summary}</p>
            : <span className="text-muted-foreground">—</span>;
        } },
        { key: "score", label: "Score", render: (r) => <div className="flex items-center gap-2"><div className="h-1.5 w-16 rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-primary" style={{ width: Math.min(100, Number(r.score)) + "%" }} /></div><span className="text-xs">{String(r.score)}</span></div> },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
        { key: "updated_at", label: "Last call", render: (r) => shortDate((r as Row).last_call?.created_at ?? r.updated_at) },
      ]}
    />
  );
}
