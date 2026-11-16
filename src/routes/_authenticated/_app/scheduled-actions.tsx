import { createFileRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { pageHead, opts, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/scheduled-actions")({
  head: () => pageHead("Scheduled Actions", "Actions set to run at a chosen time."),
  component: Page,
});

function Page() {
  void StatusBadge; void opts; void fmtDuration; void shortDate;
  return (
    <EntityPage table="workflows" filter={{ kind: "scheduled" }} title="Scheduled Actions" singular="Scheduled Action" icon={Clock} description="Actions set to run at a chosen time."
      searchKeys={["name", "trigger_event", "action"]}
      fields={[
        { key: "name", label: "Name", required: true },
        { key: "trigger_event", label: "When", type: "select", options: opts(["lead_created", "deal_stage_changed", "call_completed", "call_missed", "task_overdue", "meeting_booked"]) },
        { key: "condition", label: "Only if (condition)" }, { key: "action", label: "Then", type: "select", options: opts(["create_task", "assign_owner", "start_ai_call", "send_email", "send_whatsapp", "send_sms", "update_status"]) },
        { key: "schedule_at", label: "Run at", type: "datetime" }, { key: "status", label: "Status", type: "select", options: opts(["active", "inactive"]) },
        { key: "notes", label: "Notes", type: "textarea", full: true },
      ]}
      defaults={{ status: "active" }}
      columns={[
        { key: "name", label: "Name", render: (r) => <span className="font-semibold">{String(r.name)}</span> },
        { key: "trigger_event", label: "When", render: (r) => String(r.trigger_event ?? "—").replace(/_/g, " ") },
        { key: "action", label: "Then", render: (r) => String(r.action ?? "—").replace(/_/g, " ") },
        { key: "schedule_at", label: "Runs", render: (r) => shortDate(r.schedule_at) },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
      ]}
    />
  );
}
