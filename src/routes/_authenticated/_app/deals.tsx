import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Handshake } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { DEAL_STAGES, inr, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/deals")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => ({ new: s.new === true || s.new === "true" ? true : undefined }),
  head: () => ({
    meta: [
      { title: "Deals — Yulabs CRM" },
      { name: "description", content: "Track every opportunity and its value." },
      { property: "og:title", content: "Deals — Yulabs CRM" },
      { property: "og:description", content: "Track every opportunity and its value." },
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
    <EntityPage table="deals" title="Deals" singular="Deal" icon={Handshake} description="Every opportunity and its value."
      openNew={s.new} onCloseNew={() => nav({ to: "/deals", search: {} })}
      searchKeys={["title", "stage"]}
      fields={[
        { key: "title", label: "Deal name", required: true, full: true }, { key: "value", label: "Value (₹)", type: "number" },
        { key: "stage", label: "Stage", type: "select", options: DEAL_STAGES }, { key: "probability", label: "Probability %", type: "number" },
        { key: "expected_close", label: "Expected close", type: "date" },
        { key: "contact_id", label: "Contact", type: "ref", refTable: "contacts" }, { key: "company_id", label: "Company", type: "ref", refTable: "companies" },
      ]}
      defaults={{ stage: "qualification", probability: 10, value: 0 }}
      columns={[
        { key: "title", label: "Deal", render: (r) => <span className="font-semibold">{String(r.title)}</span> },
        { key: "value", label: "Value", render: (r) => <span className="font-semibold">{inr(r.value)}</span> },
        { key: "stage", label: "Stage", render: (r) => <StatusBadge value={r.stage} /> },
        { key: "probability", label: "Prob.", render: (r) => String(r.probability) + "%" },
        { key: "company_id", label: "Company", render: (r, refs) => refs.companies?.get(String(r.company_id)) ?? "—" },
        { key: "expected_close", label: "Close", render: (r) => shortDate(r.expected_close) },
      ]}
    />
  );
}
