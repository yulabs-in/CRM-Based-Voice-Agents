import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/contacts")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => ({ new: s.new === true || s.new === "true" ? true : undefined }),
  head: () => ({
    meta: [
      { title: "Contacts — Yulabs CRM" },
      { name: "description", content: "Manage every customer contact in your workspace." },
      { property: "og:title", content: "Contacts — Yulabs CRM" },
      { property: "og:description", content: "Manage every customer contact in your workspace." },
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
    <EntityPage table="contacts" title="Contacts" singular="Contact" icon={Users} description="Everyone your team works with."
      openNew={s.new} onCloseNew={() => nav({ to: "/contacts", search: {} })}
      searchKeys={["first_name", "last_name", "email", "phone", "job_title"]}
      fields={[
        { key: "first_name", label: "First name", required: true }, { key: "last_name", label: "Last name" },
        { key: "email", label: "Email", type: "email" }, { key: "phone", label: "Phone" },
        { key: "job_title", label: "Job title" }, { key: "company_id", label: "Company", type: "ref", refTable: "companies" },
        { key: "city", label: "City" }, { key: "source", label: "Source", type: "select", options: ["Website", "Referral", "Campaign", "Inbound call", "Import", "Other"].map((v) => ({ value: v, label: v })) },
        { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
      ]}
      defaults={{ status: "active" }}
      columns={[
        { key: "name", label: "Name", render: (r) => <div><p className="font-semibold">{String(r.first_name)} {String(r.last_name ?? "")}</p><p className="text-xs text-muted-foreground">{String(r.job_title ?? "")}</p></div> },
        { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
        { key: "company_id", label: "Company", render: (r, refs) => refs.companies?.get(String(r.company_id)) ?? "—" },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
        { key: "created_at", label: "Added", render: (r) => shortDate(r.created_at) },
      ]}
    />
  );
}
