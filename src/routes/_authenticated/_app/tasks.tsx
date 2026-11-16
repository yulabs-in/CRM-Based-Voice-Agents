import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckSquare } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/tasks")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => ({ new: s.new === true || s.new === "true" ? true : undefined }),
  head: () => ({
    meta: [
      { title: "Tasks — Yulabs CRM" },
      { name: "description", content: "Follow-ups and to-dos for your team." },
      { property: "og:title", content: "Tasks — Yulabs CRM" },
      { property: "og:description", content: "Follow-ups and to-dos for your team." },
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
    <EntityPage table="tasks" title="Tasks" singular="Task" icon={CheckSquare} description="Follow-ups and to-dos for your team."
      openNew={s.new} onCloseNew={() => nav({ to: "/tasks", search: {} })}
      searchKeys={["title", "description", "status"]} order="due_at"
      fields={[
        { key: "title", label: "Title", required: true, full: true }, { key: "description", label: "Details", type: "textarea" },
        { key: "due_at", label: "Due", type: "datetime" },
        { key: "priority", label: "Priority", type: "select", options: [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }] },
        { key: "status", label: "Status", type: "select", options: [{ value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "done", label: "Done" }] },
        { key: "contact_id", label: "Contact", type: "ref", refTable: "contacts" }, { key: "deal_id", label: "Deal", type: "ref", refTable: "deals" },
      ]}
      defaults={{ priority: "medium", status: "open" }}
      columns={[
        { key: "title", label: "Task", render: (r) => <span className="font-semibold">{String(r.title)}</span> },
        { key: "due_at", label: "Due", render: (r) => { const late = r.due_at && r.status !== "done" && new Date(String(r.due_at)) < new Date(); return <span className={late ? "font-semibold text-destructive" : ""}>{shortDate(r.due_at)}</span>; } },
        { key: "priority", label: "Priority", render: (r) => <StatusBadge value={r.priority} /> },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
        { key: "contact_id", label: "Contact", render: (r, refs) => refs.contacts?.get(String(r.contact_id)) ?? "—" },
      ]}
    />
  );
}
