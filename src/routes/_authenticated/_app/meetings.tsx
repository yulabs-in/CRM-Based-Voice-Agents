import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { pageHead, opts, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/meetings")({
  head: () => pageHead("Meetings", "Schedule and track customer meetings."),
  component: Page,
});

function Page() {
  void StatusBadge; void opts; void fmtDuration; void shortDate;
  return (
    <EntityPage table="meetings" title="Meetings" singular="Meeting" icon={CalendarDays} description="Schedule and track meetings with customers." order="starts_at"
      searchKeys={["title", "location"]}
      fields={[
        { key: "title", label: "Title", required: true }, { key: "contact_id", label: "Contact", type: "ref", refTable: "contacts" },
        { key: "starts_at", label: "Starts", type: "datetime", required: true }, { key: "duration_minutes", label: "Duration (minutes)", type: "number" },
        { key: "location", label: "Location or link" }, { key: "status", label: "Status", type: "select", options: opts(["scheduled", "done", "cancelled", "no_show"]) },
        { key: "notes", label: "Notes", type: "textarea", full: true },
      ]}
      defaults={{ duration_minutes: 30, status: "scheduled" }}
      columns={[
        { key: "title", label: "Meeting", render: (r) => <span className="font-semibold">{String(r.title)}</span> },
        { key: "contact_id", label: "With", render: (r, m) => m.contacts?.get(String(r.contact_id)) ?? "—" },
        { key: "starts_at", label: "When", render: (r) => shortDate(r.starts_at) }, { key: "location", label: "Where" },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
      ]}
    />
  );
}
