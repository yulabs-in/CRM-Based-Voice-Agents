import { createFileRoute } from "@tanstack/react-router";
import { PhoneCall } from "lucide-react";
import { CallsPage } from "@/components/app/CallsPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { AnswerChips } from "@/components/app/AnswerChips";
import { pageHead, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/call-history")({
  head: () => pageHead("Call History", "Every AI and manual call, synced from Sarvam."),
  component: Page,
});

function Page() {
  return (
    <CallsPage title="Call History" icon={PhoneCall} description="Every AI and manual call, synced from Sarvam. Click a call for answers, transcript and recording."
      searchKeys={["phone", "outcome", "status", "summary"]}
      columns={[
        { key: "phone", label: "Number" }, { key: "agent_id", label: "Agent", render: (r, m) => m.voice_agents?.get(String(r.agent_id)) ?? "—" },
        { key: "campaign_id", label: "Campaign", render: (r, m) => m.call_campaigns?.get(String(r.campaign_id)) ?? "—" },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
        { key: "answers", label: "Answers", className: "px-4 py-3 max-w-sm", render: (r) => <AnswerChips answers={r.answers} max={3} /> },
        { key: "sarvam_failure_reason", label: "Call issue", render: (r) => <span className="line-clamp-2 max-w-64 text-xs text-destructive">{String(r.sarvam_failure_reason ?? "")}</span> },
        { key: "duration_seconds", label: "Duration", render: (r) => fmtDuration(r.duration_seconds) },
        { key: "started_at", label: "Started", render: (r) => shortDate(r.started_at) },
      ]}
    />
  );
}
