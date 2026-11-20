import { createFileRoute } from "@tanstack/react-router";
import { Disc3 } from "lucide-react";
import { CallsPage } from "@/components/app/CallsPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { CallRecordingPlayer } from "@/components/app/CallRecordingPlayer";
import { pageHead, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/call-recordings")({
  head: () => pageHead("Call Recordings", "Listen back to recorded calls."),
  component: Page,
});

function Page() {
  return (
    <CallsPage title="Call Recordings" icon={Disc3} description="Recordings are copied from Sarvam into your private storage after each connected call."
      searchKeys={["phone", "outcome", "status"]} filter={{ status: "completed" }}
      columns={[
        { key: "phone", label: "Number" }, { key: "status", label: "Result", render: (r) => <StatusBadge value={r.status} /> },
        { key: "outcome", label: "Outcome" },
        { key: "started_at", label: "Date", render: (r) => shortDate(r.started_at) },
        { key: "duration_seconds", label: "Length", render: (r) => fmtDuration(r.duration_seconds) },
        { key: "recording_path", label: "Recording", render: (r) => r.recording_path
          ? <div onClick={(event) => event.stopPropagation()}><CallRecordingPlayer callId={r.id} /></div>
          : <span className="text-muted-foreground">{r.sarvam_interaction_id ? "Not saved yet — open the call to fetch it" : "No recording"}</span> },
      ]}
    />
  );
}
