import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { EMPTY_WORKFLOW, WorkflowBuilder, type WorkflowDraft } from "@/components/app/WorkflowBuilder";
import { WorkflowList } from "@/components/app/AutomationViews";
import { canWrite, useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/_app/rules")({
  head: () => pageHead("Rules", "If a call's answer matches, do something."),
  component: Page,
});

const PRESETS: Array<{ label: string; draft: WorkflowDraft }> = [
  { label: "If interested → create lead", draft: { ...EMPTY_WORKFLOW, kind: "rule", name: "If interested → lead", conditions: [{ field: "disposition", operator: "equals", value: "interested" }], actions: [{ type: "create_lead", status: "qualified" }] } },
  { label: "If callback → call again tomorrow", draft: { ...EMPTY_WORKFLOW, kind: "rule", name: "If callback → call tomorrow", conditions: [{ field: "disposition", operator: "contains", value: "callback" }], actions: [{ type: "schedule_callback", at_time: "11:00" }] } },
  { label: "If talk time < 10s → tag short call", draft: { ...EMPTY_WORKFLOW, kind: "rule", name: "Short call → tag", conditions: [{ field: "duration_seconds", operator: "lt", value: "10" }], actions: [{ type: "tag_contact", tag: "short-call" }] } },
];

function Page() {
  const { role } = useOrg();
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Rules" description="Simple IF → THEN rules on call results: the agent's answers, sentiment, status or talk time.">
        {canWrite(role) && <Button variant="hero" onClick={() => setDraft({ ...EMPTY_WORKFLOW, kind: "rule", name: "" })}><Plus /> New rule</Button>}
      </PageHeader>
      {canWrite(role) && (
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => <Button key={preset.label} size="sm" variant="outline" onClick={() => setDraft(preset.draft)}><Plus /> {preset.label}</Button>)}
        </div>
      )}
      <WorkflowList filter={(row) => (row.trigger?.event ?? "").startsWith("call.") && (row.conditions?.length ?? 0) > 0}
        emptyText="No rules yet. Add one above — e.g. if disposition is interested, create a lead." onNew={setDraft} />
      <WorkflowBuilder open={!!draft} onOpenChange={(open) => !open && setDraft(null)} initial={draft ?? EMPTY_WORKFLOW} />
    </div>
  );
}
