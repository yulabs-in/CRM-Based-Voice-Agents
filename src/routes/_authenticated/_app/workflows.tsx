import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { EMPTY_WORKFLOW, WorkflowBuilder, type WorkflowDraft } from "@/components/app/WorkflowBuilder";
import { RunLog, TEMPLATES, WorkflowList } from "@/components/app/AutomationViews";
import { canWrite, useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/_app/workflows")({
  head: () => pageHead("Workflows", "Automations that run when calls finish, campaigns complete or contacts are imported."),
  component: Page,
});

function Page() {
  const { role } = useOrg();
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Workflows" description="WHEN something happens → IF your rules match → THEN do actions. Runs on the server the moment Sarvam reports a result.">
        {canWrite(role) && <Button variant="hero" onClick={() => setDraft(EMPTY_WORKFLOW)}><Plus /> New workflow</Button>}
      </PageHeader>

      {canWrite(role) && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Start from a template</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {TEMPLATES.map((template) => (
              <button key={template.title} type="button" onClick={() => setDraft({ ...template.draft, active: true })}
                className="rounded-2xl border bg-card p-4 text-left shadow-soft transition-colors hover:border-primary/50">
                <p className="font-semibold">{template.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{template.help}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Your workflows</h2>
        <WorkflowList emptyText="No workflows yet — pick a template above or create one." onNew={setDraft} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Recent runs</h2>
        <RunLog />
      </section>

      <WorkflowBuilder open={!!draft} onOpenChange={(open) => !open && setDraft(null)} initial={draft ?? EMPTY_WORKFLOW} />
    </div>
  );
}
