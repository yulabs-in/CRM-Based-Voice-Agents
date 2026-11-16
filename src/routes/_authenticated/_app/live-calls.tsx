import { createFileRoute } from "@tanstack/react-router";
import { Radio } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { pageHead, opts, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/live-calls")({
  head: () => pageHead("Live Calls", "Calls happening right now."),
  component: Page,
});

function Page() {
  void StatusBadge; void opts; void fmtDuration; void shortDate;
  return (
    <EntityPage table="calls" title="Live Calls" singular="Call" icon={Radio} description="Calls happening right now." order="started_at" filter={{ status: "in_progress" }}
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
        { key: "phone", label: "Number" }, { key: "agent_id", label: "Agent", render: (r, m) => m.voice_agents?.get(String(r.agent_id)) ?? "—" },
        { key: "status", label: "Status", render: () => <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success"><span className="size-2 animate-pulse rounded-full bg-success" />Live</span> },
        { key: "started_at", label: "Started", render: (r) => shortDate(r.started_at) },]}
    />
  );
}
