import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { pageHead, opts, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/voice-agents")({
  head: () => pageHead("Voice Agents", "Configure Sarvam AI voice agents for your calls."),
  component: Page,
});

function Page() {
  void StatusBadge; void opts; void fmtDuration; void shortDate;
  return (
    <EntityPage table="voice_agents" title="Voice Agents" singular="Agent" icon={Bot} description="Configure the AI voices that call and answer for you."
      searchKeys={["name", "purpose", "language"]}
      fields={[
        { key: "name", label: "Agent name", required: true },
        { key: "language", label: "Language", type: "select", options: [["hi-IN","Hindi"],["en-IN","English (India)"],["ta-IN","Tamil"],["te-IN","Telugu"],["kn-IN","Kannada"],["ml-IN","Malayalam"],["mr-IN","Marathi"],["bn-IN","Bengali"],["gu-IN","Gujarati"],["pa-IN","Punjabi"],["od-IN","Odia"]].map(([value, label]) => ({ value: value!, label: label! })) },
        { key: "voice", label: "Voice (speaker)" }, { key: "purpose", label: "Purpose", type: "select", options: opts(["sales", "support", "reminders", "surveys", "collections"]) },
        { key: "sarvam_agent_id", label: "Sarvam agent ID" },
        { key: "sarvam_app_version", label: "Sarvam agent version", type: "number" },
        { key: "sarvam_connection_id", label: "Telephony connection ID" },
        { key: "sarvam_agent_phone_number", label: "Connected caller number" },
        { key: "status", label: "Status", type: "select", options: opts(["active", "inactive"]) },
        { key: "greeting", label: "Opening line", type: "textarea", full: true }, { key: "instructions", label: "Instructions", type: "textarea", full: true },
      ]}
      defaults={{ language: "hi-IN", status: "active", purpose: "sales" }}
      columns={[
        { key: "name", label: "Agent", render: (r) => <div><p className="font-semibold">{String(r.name)}</p><p className="text-xs text-muted-foreground">{String(r.purpose ?? "")}</p></div> },
        { key: "language", label: "Language" }, { key: "voice", label: "Voice" }, { key: "sarvam_agent_id", label: "Sarvam ID" },
        { key: "sarvam_connection_id", label: "Telephony connection" },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
      ]}
    />
  );
}
