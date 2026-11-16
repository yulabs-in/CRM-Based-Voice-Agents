import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { pageHead, opts, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/call-campaigns")({
  head: () => pageHead("Call Campaigns", "Run outbound AI calling campaigns."),
  component: Page,
});

function Page() {
  void StatusBadge; void opts; void fmtDuration; void shortDate;
  return (
    <EntityPage table="call_campaigns" title="Call Campaigns" singular="Campaign" icon={Megaphone} description="Plan outbound calling campaigns run by your voice agents."
      searchKeys={["name", "audience", "status"]}
      fields={[
        { key: "name", label: "Campaign name", required: true }, { key: "agent_id", label: "Voice agent", type: "ref", refTable: "voice_agents" },
        { key: "audience", label: "Audience" }, { key: "target_count", label: "Contacts to call", type: "number" },
        { key: "starts_at", label: "Starts", type: "datetime" }, { key: "status", label: "Status", type: "select", options: opts(["draft", "scheduled", "running", "paused", "completed"]) },
        { key: "notes", label: "Notes", type: "textarea", full: true },
      ]}
      defaults={{ status: "draft", target_count: 0 }}
      columns={[
        { key: "name", label: "Campaign", render: (r) => <span className="font-semibold">{String(r.name)}</span> },
        { key: "agent_id", label: "Agent", render: (r, m) => m.voice_agents?.get(String(r.agent_id)) ?? "—" },
        { key: "target_count", label: "Contacts" }, { key: "starts_at", label: "Starts", render: (r) => shortDate(r.starts_at) },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
      ]}
    />
  );
}
