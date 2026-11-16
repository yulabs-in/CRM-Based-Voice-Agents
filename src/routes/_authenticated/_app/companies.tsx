import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/companies")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => ({ new: s.new === true || s.new === "true" ? true : undefined }),
  head: () => ({
    meta: [
      { title: "Companies — Yulabs CRM" },
      { name: "description", content: "Accounts and organisations your team sells to." },
      { property: "og:title", content: "Companies — Yulabs CRM" },
      { property: "og:description", content: "Accounts and organisations your team sells to." },
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
    <EntityPage table="companies" title="Companies" singular="Company" icon={Building2} description="Accounts your team sells to."
      openNew={s.new} onCloseNew={() => nav({ to: "/companies", search: {} })}
      searchKeys={["name", "industry", "city", "website"]}
      fields={[
        { key: "name", label: "Company name", required: true }, { key: "industry", label: "Industry" },
        { key: "website", label: "Website" }, { key: "phone", label: "Phone" }, { key: "city", label: "City" },
        { key: "size", label: "Size", type: "select", options: ["1-10", "11-50", "51-200", "201-1000", "1000+"].map((v) => ({ value: v, label: v })) },
      ]}
      columns={[
        { key: "name", label: "Company", render: (r) => <span className="font-semibold">{String(r.name)}</span> },
        { key: "industry", label: "Industry" }, { key: "city", label: "City" }, { key: "size", label: "Size" },
        { key: "website", label: "Website" }, { key: "created_at", label: "Added", render: (r) => shortDate(r.created_at) },
      ]}
    />
  );
}
