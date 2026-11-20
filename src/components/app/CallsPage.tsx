import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { EntityPage, type Column, type Field } from "@/components/app/EntityPage";
import { CallDetailSheet } from "@/components/app/CallDetailSheet";
import { opts } from "@/lib/seo";

export const CALL_FIELDS: Field[] = [
  { key: "phone", label: "Phone number", required: true }, { key: "contact_id", label: "Contact", type: "ref", refTable: "contacts" },
  { key: "agent_id", label: "Voice agent", type: "ref", refTable: "voice_agents" }, { key: "campaign_id", label: "Campaign", type: "ref", refTable: "call_campaigns" },
  { key: "direction", label: "Direction", type: "select", options: opts(["outbound", "inbound"]) },
  { key: "status", label: "Status", type: "select", options: opts(["queued", "in_progress", "completed", "failed", "no_answer"]) },
  { key: "started_at", label: "Started", type: "datetime" }, { key: "duration_seconds", label: "Duration (seconds)", type: "number" },
  { key: "outcome", label: "Outcome" },
  { key: "sarvam_failure_reason", label: "Call issue", type: "textarea", full: true },
  { key: "transcript", label: "Transcript", type: "textarea", full: true },
];

/** Call list pages share one shape: a filtered `calls` table where clicking a row opens the full call (answers, transcript, recording). */
export function CallsPage(props: {
  title: string; description: string; icon: LucideIcon; columns: Column[]; searchKeys: string[]; filter?: Record<string, string>; readOnly?: boolean;
}) {
  const [openCall, setOpenCall] = useState<string | null>(null);
  return (
    <>
      <EntityPage table="calls" title={props.title} singular="Call" icon={props.icon} description={props.description} order="started_at"
        searchKeys={props.searchKeys} filter={props.filter} readOnly={props.readOnly}
        fields={CALL_FIELDS} defaults={{ direction: "outbound", status: "queued", duration_seconds: 0 }}
        columns={props.columns} onRowClick={(row) => setOpenCall(row.id)} />
      <CallDetailSheet callId={openCall} onClose={() => setOpenCall(null)} />
    </>
  );
}
