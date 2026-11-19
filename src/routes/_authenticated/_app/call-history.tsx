import { createFileRoute } from "@tanstack/react-router";
import { PhoneCall } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { pageHead, opts, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/call-history")({
  head: () => pageHead("Call History", "Every AI and manual call, synced from Sarvam."),
  component: Page,
});

function Page() {
  void StatusBadge; void opts; void fmtDuration; void shortDate;
  return (
    <EntityPage table="calls" title="Call History" singular="Call" icon={PhoneCall} description="Every AI and manual call, synced from Sarvam." order="started_at"
      searchKeys={["phone","outcome","status"]}
      fields={[
        { key: "phone", label: "Phone number", required: true }, { key: "contact_id", label: "Contact", type: "ref", refTable: "contacts" },
        { key: "agent_id", label: "Voice agent", type: "ref", refTable: "voice_agents" }, { key: "campaign_id", label: "Campaign", type: "ref", refTable: "call_campaigns" },
        { key: "direction", label: "Direction", type: "select", options: opts(["outbound", "inbound"]) },
        { key: "status", label: "Status", type: "select", options: opts(["queued", "in_progress", "completed", "failed", "no_answer"]) },
        { key: "started_at", label: "Started", type: "datetime" }, { key: "duration_seconds", label: "Duration (seconds)", type: "number" },
        { key: "outcome", label: "Outcome" }, { key: "recording_url", label: "Recording link" },
        { key: "sarvam_failure_reason", label: "Call issue", type: "textarea", full: true },
        { key: "transcript", label: "Transcript", type: "textarea", full: true },
      ]}
      defaults={{ direction: "outbound", status: "queued", duration_seconds: 0 }}
      columns={[
        { key: "phone", label: "Number" }, { key: "agent_id", label: "Agent", render: (r, m) => m.voice_agents?.get(String(r.agent_id)) ?? "—" },
        { key: "direction", label: "Direction", render: (r) => <StatusBadge value={r.direction} /> },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
        { key: "outcome", label: "Outcome" },
        { key: "sarvam_failure_reason", label: "Call issue", render: (r) => <span className="max-w-64 text-xs text-destructive">{String(r.sarvam_failure_reason ?? "—")}</span> },
        { key: "duration_seconds", label: "Duration", render: (r) => fmtDuration(r.duration_seconds) },
        { key: "started_at", label: "Started", render: (r) => shortDate(r.started_at) },]}
    />
  );
}
