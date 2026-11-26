import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, SlidersHorizontal } from "lucide-react";
import { EntityPage, type Row } from "@/components/app/EntityPage";
import { OutcomeRulesDialog } from "@/components/app/agents/OutcomeRules";
import { SupportCallTest } from "@/components/app/SupportCallTest";
import { StatusBadge } from "@/components/app/StatusBadge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { pageHead, opts, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";
import { DEFAULT_AGENT } from "@/lib/sarvam-defaults";
import { asVariableMap } from "@/lib/campaign-vars";

export const Route = createFileRoute("/_authenticated/_app/voice-agents")({
  head: () => pageHead("Voice Agents", "Configure Sarvam AI voice agents for your calls."),
  component: Page,
});

function Page() {
  void StatusBadge; void opts; void fmtDuration; void shortDate;
  const [rulesAgent, setRulesAgent] = useState<Row | null>(null);
  return (
    <div className="space-y-5">
    <SupportCallTest />
    <EntityPage table="voice_agents" title="Voice Agents" singular="Agent" icon={Bot} description="Configure the AI voices that call and answer for you."
      searchKeys={["name", "purpose", "language"]}
      rowMenuItems={(r) => (
        <DropdownMenuItem onClick={() => setRulesAgent(r)}><SlidersHorizontal /> Outcome rules</DropdownMenuItem>
      )}
      fields={[
        { key: "name", label: "Agent name", required: true },
        { key: "language", label: "Language", type: "select", options: [["hi-IN","Hindi"],["en-IN","English (India)"],["ta-IN","Tamil"],["te-IN","Telugu"],["kn-IN","Kannada"],["ml-IN","Malayalam"],["mr-IN","Marathi"],["bn-IN","Bengali"],["gu-IN","Gujarati"],["pa-IN","Punjabi"],["od-IN","Odia"]].map(([value, label]) => ({ value: value!, label: label! })) },
        { key: "voice", label: "Voice (speaker)" }, { key: "purpose", label: "Purpose", type: "select", options: opts(["sales", "support", "reminders", "surveys", "collections"]) },
        { key: "sarvam_agent_id", label: "Sarvam agent ID" },
        { key: "sarvam_app_version", label: "Sarvam agent version", type: "number" },
        { key: "sarvam_connection_id", label: "Telephony connection ID" },
        { key: "sarvam_agent_phone_number", label: "Connected caller number" },
        { key: "status", label: "Status", type: "select", options: opts(["active", "inactive"]) },
        { key: "greeting", label: "Opening line (sent per call — use {customer_name}, {first_name}, {city} or any imported column like {renewal_date})", type: "textarea", full: true },
        { key: "greeting_no_name", label: "Opening line when the name is unknown (e.g. Hello sir, are you interested in…)", type: "textarea", full: true }, { key: "instructions", label: "Instructions", type: "textarea", full: true },
      ]}
      defaults={{ language: DEFAULT_AGENT.language, status: "active", purpose: "sales", sarvam_app_version: DEFAULT_AGENT.sarvam_app_version, sarvam_agent_id: DEFAULT_AGENT.sarvam_agent_id, sarvam_connection_id: DEFAULT_AGENT.sarvam_connection_id, sarvam_agent_phone_number: DEFAULT_AGENT.sarvam_agent_phone_number }}
      columns={[
        { key: "name", label: "Agent", render: (r) => <div><p className="font-semibold">{String(r.name)}</p><p className="text-xs text-muted-foreground">{String(r.purpose ?? "")}</p></div> },
        { key: "language", label: "Language" }, { key: "voice", label: "Voice" }, { key: "sarvam_agent_id", label: "Sarvam ID" },
        { key: "sarvam_connection_id", label: "Telephony connection" },
        { key: "agent_variables", label: "Script variables", render: (r) => {
          const names = Object.keys(asVariableMap(r.agent_variables));
          return names.length ? <div className="flex max-w-xs flex-wrap gap-1">{names.map((name) => <code key={name} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{name}</code>)}</div> : <span className="text-xs text-muted-foreground">none</span>;
        } },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
      ]}
    />
    <OutcomeRulesDialog agent={rulesAgent} open={!!rulesAgent} onOpenChange={(open) => { if (!open) setRulesAgent(null); }} />
    </div>
  );
}
