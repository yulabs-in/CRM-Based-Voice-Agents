import { createFileRoute } from "@tanstack/react-router";
import { Disc3 } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { pageHead, opts, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";
import { CallRecordingPlayer } from "@/components/app/CallRecordingPlayer";

export const Route = createFileRoute("/_authenticated/_app/call-recordings")({
  head: () => pageHead("Call Recordings", "Listen back to recorded calls."),
  component: Page,
});

function Page() {
  void StatusBadge; void opts; void fmtDuration; void shortDate;
  return (
    <EntityPage table="calls" title="Call Recordings" singular="Call" icon={Disc3} description="Listen back to recorded calls." order="started_at"
      searchKeys={["phone","outcome","status"]}
      fields={[
        { key: "phone", label: "Phone number", required: true }, { key: "contact_id", label: "Contact", type: "ref", refTable: "contacts" },
        { key: "agent_id", label: "Voice agent", type: "ref", refTable: "voice_agents" }, { key: "campaign_id", label: "Campaign", type: "ref", refTable: "call_campaigns" },
        { key: "direction", label: "Direction", type: "select", options: opts(["outbound", "inbound"]) },
        { key: "status", label: "Status", type: "select", options: opts(["queued", "in_progress", "completed", "failed", "no_answer"]) },
        { key: "started_at", label: "Started", type: "datetime" }, { key: "duration_seconds", label: "Duration (seconds)", type: "number" },
        { key: "outcome", label: "Outcome" }, { key: "recording_url", label: "Recording link" },
        { key: "transcript", label: "Transcript", type: "textarea", full: true },
      ]}
      defaults={{ direction: "outbound", status: "queued", duration_seconds: 0 }}
      columns={[
        { key: "phone", label: "Number" }, { key: "status", label: "Result", render: (r) => <StatusBadge value={r.status} /> },
        { key: "started_at", label: "Date", render: (r) => shortDate(r.started_at) },
        { key: "duration_seconds", label: "Length", render: (r) => fmtDuration(r.duration_seconds) },
        { key: "recording_url", label: "Recording", render: (r) => r.recording_url ? <CallRecordingPlayer callId={r.id} /> : <span className="text-muted-foreground">No recording</span> },]}
    />
  );
}
