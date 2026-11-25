import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, PhoneCall } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { pageHead, opts } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/_app/meetings")({
  head: () => pageHead("Meetings", "Schedule and track customer meetings."),
  component: Page,
});

function formatIst(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })} IST`;
}

function Page() {
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
        {
          key: "title",
          label: "Meeting",
          render: (r) => (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{String(r.title)}</span>
              {r.source === "call" && (
                <Badge variant="secondary" className="text-xs font-medium">
                  From AI call
                </Badge>
              )}
              {r.call_id ? (
                <Link
                  to="/call-history"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <PhoneCall className="size-3" />
                  Call
                </Link>
              ) : null}
            </div>
          ),
        },
        { key: "contact_id", label: "With", render: (r, m) => m.contacts?.get(String(r.contact_id)) ?? "—" },
        { key: "starts_at", label: "When", render: (r) => formatIst(r.starts_at) },
        { key: "location", label: "Where" },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
      ]}
    />
  );
}
