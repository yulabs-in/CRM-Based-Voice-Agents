import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { EMPTY_WORKFLOW, WorkflowBuilder, type WorkflowDraft } from "@/components/app/WorkflowBuilder";
import { RunLog, useWorkflows } from "@/components/app/AutomationViews";
import { canWrite, useOrg } from "@/lib/org";
import { EVENTS } from "@/lib/automation";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/_app/triggers")({
  head: () => pageHead("Triggers", "Events that start your automations."),
  component: Page,
});

function Page() {
  const { role } = useOrg();
  const list = useWorkflows();
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const workflows = list.data?.workflows ?? [];
  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Triggers" description="Every event the CRM can react to, and the workflows listening for it." />
      <div className="grid gap-3 md:grid-cols-2">
        {EVENTS.map((event) => {
          const listening = workflows.filter((w) => w.trigger?.event === event.value);
          const active = listening.filter((w) => w.status === "active");
          return (
            <div key={event.value} className="rounded-2xl border bg-card p-4 shadow-soft">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><Zap className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{event.label}</p>
                  <p className="text-xs text-muted-foreground">{event.help}</p>
                  <p className="mt-2 text-xs"><span className="font-semibold">{active.length}</span> active workflow{active.length === 1 ? "" : "s"}{listening.length > active.length ? ` · ${listening.length - active.length} paused` : ""}</p>
                  {!!listening.length && <p className="mt-1 truncate text-xs text-muted-foreground">{listening.map((w) => w.name).join(", ")}</p>}
                </div>
                {canWrite(role) && (
                  <Button size="sm" variant="outline" onClick={() => setDraft({ ...EMPTY_WORKFLOW, event: event.value, conditions: event.value.startsWith("call.") ? EMPTY_WORKFLOW.conditions : [] })}>
                    <Plus /> Add
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Fired recently</h2>
        <RunLog limit={50} />
      </section>
      <WorkflowBuilder open={!!draft} onOpenChange={(open) => !open && setDraft(null)} initial={draft ?? EMPTY_WORKFLOW} />
    </div>
  );
}
