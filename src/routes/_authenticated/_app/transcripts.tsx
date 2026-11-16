import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { pageHead, opts, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/transcripts")({
  head: () => pageHead("Transcripts", "Read what was said on every call."),
  component: Page,
});

function Page() {
  void StatusBadge; void opts; void fmtDuration; void shortDate;
  return (
    <EntityPage table="calls" title="Transcripts" singular="Call" icon={FileText} description="Read what was said on every call." order="started_at"
      searchKeys={["phone","transcript"]}
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
        { key: "phone", label: "Number" }, { key: "started_at", label: "Date", render: (r) => shortDate(r.started_at) },
        { key: "transcript", label: "Transcript", className: "px-4 py-3 max-w-xl", render: (r) => <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{String(r.transcript ?? "No transcript yet")}</p> },]}
    />
  );
}
