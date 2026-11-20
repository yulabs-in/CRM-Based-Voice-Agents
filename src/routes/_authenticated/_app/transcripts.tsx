import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { CallsPage } from "@/components/app/CallsPage";
import { AnswerChips } from "@/components/app/AnswerChips";
import { pageHead } from "@/lib/seo";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/transcripts")({
  head: () => pageHead("Transcripts", "Read what was said on every call."),
  component: Page,
});

function Page() {
  return (
    <CallsPage title="Transcripts" icon={FileText} description="Read what was said on every call. Click a call to see the full conversation."
      searchKeys={["phone", "transcript"]} filter={{ status: "completed" }}
      columns={[
        { key: "phone", label: "Number" }, { key: "started_at", label: "Date", render: (r) => shortDate(r.started_at) },
        { key: "answers", label: "Answers", className: "px-4 py-3 max-w-xs", render: (r) => <AnswerChips answers={r.answers} max={2} /> },
        { key: "transcript", label: "Transcript", className: "px-4 py-3 max-w-xl", render: (r) => <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{String(r.transcript ?? "No transcript yet")}</p> },
      ]}
    />
  );
}
