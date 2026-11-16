import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { inr, shortDate } from "@/lib/format";

const LEAD_STATUSES = ["new", "contacted", "qualified", "unqualified", "converted"];

export const Route = createFileRoute("/_authenticated/_app/leads")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => ({ new: s.new === true || s.new === "true" ? true : undefined }),
  head: () => ({
    meta: [
      { title: "Leads — Yulabs CRM" },
      { name: "description", content: "Capture, score and qualify incoming leads." },
      { property: "og:title", content: "Leads — Yulabs CRM" },
      { property: "og:description", content: "Capture, score and qualify incoming leads." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const s = Route.useSearch();
  const nav = useNavigate();
  return (
    <EntityPage table="leads" title="Leads" singular="Lead" icon={UserPlus} description="Capture, score and qualify new opportunities."
      openNew={s.new} onCloseNew={() => nav({ to: "/leads", search: {} })}
      searchKeys={["name", "email", "phone", "company_name", "source"]}
      fields={[
        { key: "name", label: "Name", required: true }, { key: "company_name", label: "Company" },
        { key: "email", label: "Email", type: "email" }, { key: "phone", label: "Phone" },
        { key: "status", label: "Status", type: "select", options: LEAD_STATUSES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
        { key: "source", label: "Source", type: "select", options: ["Website", "Referral", "Voice campaign", "Inbound call", "Ads", "Other"].map((v) => ({ value: v, label: v })) },
        { key: "score", label: "Score (0-100)", type: "number" }, { key: "value", label: "Estimated value (₹)", type: "number" },
      ]}
      defaults={{ status: "new", score: 0, value: 0 }}
      columns={[
        { key: "name", label: "Lead", render: (r) => <div><p className="font-semibold">{String(r.name)}</p><p className="text-xs text-muted-foreground">{String(r.company_name ?? "")}</p></div> },
        { key: "email", label: "Email" }, { key: "source", label: "Source" },
        { key: "score", label: "Score", render: (r) => <div className="flex items-center gap-2"><div className="h-1.5 w-16 rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-primary" style={{ width: Math.min(100, Number(r.score)) + "%" }} /></div><span className="text-xs">{String(r.score)}</span></div> },
        { key: "value", label: "Value", render: (r) => inr(r.value) },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
        { key: "created_at", label: "Added", render: (r) => shortDate(r.created_at) },
      ]}
    />
  );
}
